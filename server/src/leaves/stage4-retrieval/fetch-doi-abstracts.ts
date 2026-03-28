/**
 * DOI 摘要抓取工具
 * 
 * 策略（四级降级）：
 * 1. DOI 直接抓取出版商页面
 * 2. CrossRef API 获取摘要
 * 3. OpenAlex API 获取摘要
 * 4. CORE API 获取摘要
 */
import type { ToolInput, ToolResult } from '../types.js';
import type { LiteratureRecord } from '../../services/deepreference/recode.types.js';
import { config } from '../../config/index.js';
import * as cheerio from 'cheerio';

interface FetchResult {
  doi: string;
  abstract: string | null;
  source: string | null;
  resolvedUrl: string | null;
  error: string | null;
  duration: number;
  retryCount?: number;
}

interface HostState {
  concurrency: number;
  cooldownUntil: number;
  consecutiveErrors: number;
  lastRequestTime: number;
}

// API 配置（从环境变量读取）
const CROSSREF_EMAIL = process.env.CROSSREF_EMAIL || '';
const CROSSREF_BASE_URL = 'https://api.crossref.org';
const OPENALEX_API_KEY = process.env.OPENALEX_API_KEY || '';
const OPENALEX_EMAIL = process.env.OPENALEX_EMAIL || '';
const OPENALEX_BASE_URL = 'https://api.openalex.org';
const CORE_API_KEY = process.env.CORE_API_KEY || '';
const CORE_BASE_URL = 'https://api.core.ac.uk/v3';

// 全局状态
const hostStates = new Map<string, HostState>();
const activeRequests = new Map<string, number>();
const resolvedUrlCache = new Map<string, string>();

// 配置
const GLOBAL_CONCURRENCY = config.doiAbstract?.concurrency || 8;
const PER_HOST_CONCURRENCY = config.doiAbstract?.perHost || 2;
const TIMEOUT_MS = config.doiAbstract?.timeoutMs || 15000;
const COOLDOWN_BASE_MS = 20000;
const MAX_COOLDOWN_MS = 90000;
const REQUEST_DELAY_MS = 1000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 5000;

// User-Agent 列表
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

// DOM 摘要选择器（按优先级排序）
const ABSTRACT_SELECTORS = [
  '#abstract', '#Abstract', '.abstract', '.Abstract',
  '[data-abstract]', '[id*="abstract" i]',
  '[class*="abstract" i]:not(nav):not(header):not(footer)',
  '.abstract.author', '#abstracts .abstract', '.Abstracts .abstract',
  '#Abs1-content', '.c-article-section__content[id*="Abs"]', '.abstract-content',
  '.article-section__content.en.main', '.abstract-group',
  '.abstract-text', '.document-abstract',
  '.abstractSection', '.article__abstract',
  '#Abs1', '.c-article-body .c-article-section__content',
  '.abstractSection.abstractInFull',
  '.art-abstract', '.JournalAbstract',
  '#eng-abstract', 'blockquote.abstract',
];

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms + Math.random() * 300));
}

function getHost(url: string | null | undefined): string {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function getHostState(host: string): HostState {
  if (!hostStates.has(host)) {
    hostStates.set(host, {
      concurrency: PER_HOST_CONCURRENCY,
      cooldownUntil: 0,
      consecutiveErrors: 0,
      lastRequestTime: 0,
    });
  }
  return hostStates.get(host)!;
}

function isHostAvailable(host: string): boolean {
  if (host === 'unknown') return true;
  const state = getHostState(host);
  const active = activeRequests.get(host) || 0;
  return active < state.concurrency;
}

function isHostInCooldown(host: string): boolean {
  if (host === 'unknown') return false;
  const state = getHostState(host);
  return Date.now() < state.cooldownUntil;
}

async function waitForHostDelay(host: string): Promise<void> {
  if (host === 'unknown') return;
  const state = getHostState(host);
  const elapsed = Date.now() - state.lastRequestTime;
  if (elapsed < REQUEST_DELAY_MS) {
    await sleep(REQUEST_DELAY_MS - elapsed);
  }
  state.lastRequestTime = Date.now();
}

function markHostError(host: string, statusCode?: number): void {
  if (host === 'unknown') return;
  const state = getHostState(host);
  state.consecutiveErrors++;
  
  const shouldCooldown = statusCode === 429 || statusCode === 503 || state.consecutiveErrors >= 3;
  
  if (shouldCooldown) {
    const cooldownMs = Math.min(
      COOLDOWN_BASE_MS * Math.pow(1.5, state.consecutiveErrors - 1),
      MAX_COOLDOWN_MS
    );
    state.cooldownUntil = Date.now() + cooldownMs;
    state.concurrency = 1;
    console.log(`[DOI] ${host} 进入冷却 ${Math.round(cooldownMs / 1000)}s`);
  }
}

function markHostSuccess(host: string): void {
  if (host === 'unknown') return;
  const state = getHostState(host);
  state.consecutiveErrors = 0;
  if (state.concurrency < PER_HOST_CONCURRENCY) {
    state.concurrency = Math.min(state.concurrency + 1, PER_HOST_CONCURRENCY);
  }
}

function resetAllCooldowns(): void {
  hostStates.forEach((state) => {
    state.cooldownUntil = 0;
    state.consecutiveErrors = Math.max(0, state.consecutiveErrors - 1);
    state.concurrency = PER_HOST_CONCURRENCY;
  });
  console.log('[DOI] 已重置冷却状态');
}

// 清理 HTML 文本
function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 从 OpenAlex inverted_index 还原摘要文本
function invertedIndexToText(invertedIndex: Record<string, number[]>): string {
  if (!invertedIndex || typeof invertedIndex !== 'object') return '';
  
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }
  
  words.sort((a, b) => a[1] - b[1]);
  return words.map(w => w[0]).join(' ');
}

// 从 meta 标签提取摘要
function extractFromMeta($: cheerio.CheerioAPI): { abstract: string | null; source: string | null } {
  const citationAbstract = $('meta[name="citation_abstract"]').attr('content');
  if (citationAbstract && citationAbstract.length > 50) {
    return { abstract: cleanText(citationAbstract), source: 'meta_citation' };
  }
  
  const dcDesc = $('meta[name="dc.description"], meta[name="DC.Description"], meta[name="DC.description"]').attr('content');
  if (dcDesc && dcDesc.length > 50) {
    return { abstract: cleanText(dcDesc), source: 'meta_dc' };
  }
  
  const ogDesc = $('meta[property="og:description"]').attr('content');
  if (ogDesc && ogDesc.length > 150) {
    return { abstract: cleanText(ogDesc), source: 'meta_og' };
  }
  
  return { abstract: null, source: null };
}

// 从 JSON-LD 提取摘要
function extractFromJsonLd($: cheerio.CheerioAPI): { abstract: string | null; source: string | null } {
  const ldJsonScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < ldJsonScripts.length; i++) {
    try {
      const jsonText = $(ldJsonScripts[i]).html();
      if (!jsonText) continue;
      
      const data = JSON.parse(jsonText);
      const items = Array.isArray(data) ? data : [data];
      
      for (const item of items) {
        const abs = item.abstract || item.description;
        if (abs && typeof abs === 'string' && abs.length > 50) {
          return { abstract: cleanText(abs), source: 'json_ld' };
        }
        if (item['@graph']) {
          for (const node of item['@graph']) {
            if (node.abstract && node.abstract.length > 50) {
              return { abstract: cleanText(node.abstract), source: 'json_ld' };
            }
          }
        }
      }
    } catch {
      // 继续
    }
  }
  return { abstract: null, source: null };
}

// 从 DOM 选择器提取摘要
function extractFromDom($: cheerio.CheerioAPI): { abstract: string | null; source: string | null } {
  for (const selector of ABSTRACT_SELECTORS) {
    try {
      const elements = $(selector);
      for (let i = 0; i < elements.length; i++) {
        const el = $(elements[i]);
        
        if (el.closest('nav, header, footer, .nav, .header, .footer').length > 0) {
          continue;
        }
        
        let text = el.text();
        text = text.replace(/^(Abstract|ABSTRACT|Summary|SUMMARY)[:\s]*/i, '');
        text = cleanText(text);
        
        if (text.length > 100 && text.length < 10000) {
          const academicKeywords = /\b(study|research|method|result|conclusion|analysis|data|experiment|model|system|approach|propose|present|investigate|demonstrate|show|find|suggest|indicate)\b/i;
          if (academicKeywords.test(text)) {
            return { abstract: text, source: `dom:${selector}` };
          }
        }
      }
    } catch {
      // 选择器语法错误，跳过
    }
  }
  return { abstract: null, source: null };
}

// 正则降级提取
function extractWithRegex(html: string): { abstract: string | null; source: string | null } {
  const citationMatch = html.match(/<meta[^>]+name=["']citation_abstract["'][^>]+content=["']([^"']{50,})["']/i);
  if (citationMatch) {
    return { abstract: cleanText(citationMatch[1]), source: 'regex_meta' };
  }
  
  const ldMatch = html.match(/"abstract"\s*:\s*"([^"]{50,})"/);
  if (ldMatch) {
    return { abstract: cleanText(ldMatch[1]), source: 'regex_ld' };
  }
  
  const divMatch = html.match(/<(?:div|section|p)[^>]*(?:id|class)=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]{100,3000}?)<\/(?:div|section|p)>/i);
  if (divMatch) {
    const text = cleanText(divMatch[1]);
    if (text.length > 100) {
      return { abstract: text, source: 'regex_div' };
    }
  }
  
  return { abstract: null, source: null };
}

// 综合提取摘要
function extractAbstract(html: string): { abstract: string | null; source: string | null } {
  try {
    const $ = cheerio.load(html);
    
    let result = extractFromMeta($);
    if (result.abstract) return result;
    
    result = extractFromJsonLd($);
    if (result.abstract) return result;
    
    result = extractFromDom($);
    if (result.abstract) return result;
    
    result = extractWithRegex(html);
    if (result.abstract) return result;
    
    return { abstract: null, source: null };
  } catch {
    return extractWithRegex(html);
  }
}

// 普通 HTTP 请求抓取
async function fetchWithHttp(url: string, userAgent: string, timeout: number): Promise<{ html: string | null; finalUrl: string | null; error: string | null; statusCode?: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return { html: null, finalUrl: response.url, error: `http_${response.status}`, statusCode: response.status };
    }
    
    const html = await response.text();
    return { html, finalUrl: response.url, error: null };
    
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { html: null, finalUrl: null, error: 'timeout' };
    }
    return { html: null, finalUrl: null, error: err.message || 'fetch_failed' };
  }
}

// 解析 DOI 重定向
async function resolveDoiUrl(doi: string, userAgent: string): Promise<string | null> {
  const cached = resolvedUrlCache.get(doi);
  if (cached) return cached;
  
  const doiUrl = `https://doi.org/${doi}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(doiUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      resolvedUrlCache.set(doi, response.url);
      return response.url;
    }
  } catch {
    // HEAD 失败，尝试 GET
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(doiUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      resolvedUrlCache.set(doi, response.url);
      return response.url;
    }
  } catch {
    // ignore
  }
  
  return null;
}

// 使用 CrossRef API 获取摘要
async function fetchFromCrossRef(doi: string): Promise<{ abstract: string | null; error: string | null }> {
  if (!CROSSREF_EMAIL) {
    return { abstract: null, error: 'crossref_no_email' };
  }
  
  const url = `${CROSSREF_BASE_URL}/works/${encodeURIComponent(doi)}?mailto=${CROSSREF_EMAIL}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': `AIReferences/1.0 (mailto:${CROSSREF_EMAIL})`,
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 404) {
        return { abstract: null, error: 'crossref_not_found' };
      }
      return { abstract: null, error: `crossref_http_${response.status}` };
    }
    
    const data = await response.json();
    const message = data.message;
    
    if (message?.abstract) {
      // CrossRef 的摘要可能包含 JATS XML 标签，需要清理
      const abstract = cleanText(message.abstract);
      if (abstract.length > 50) {
        return { abstract, error: null };
      }
    }
    
    return { abstract: null, error: 'crossref_no_abstract' };
    
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { abstract: null, error: 'crossref_timeout' };
    }
    return { abstract: null, error: `crossref_${err.message || 'error'}` };
  }
}

// 使用 OpenAlex API 获取摘要
async function fetchFromOpenAlex(doi: string): Promise<{ abstract: string | null; error: string | null }> {
  if (!OPENALEX_EMAIL) {
    return { abstract: null, error: 'openalex_no_email' };
  }
  
  const apiKeyParam = OPENALEX_API_KEY ? `&api_key=${OPENALEX_API_KEY}` : '';
  const url = `${OPENALEX_BASE_URL}/works/https://doi.org/${encodeURIComponent(doi)}?mailto=${OPENALEX_EMAIL}${apiKeyParam}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': `AIReferences/1.0 (mailto:${OPENALEX_EMAIL})`,
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 404) {
        return { abstract: null, error: 'openalex_not_found' };
      }
      return { abstract: null, error: `openalex_http_${response.status}` };
    }
    
    const data = await response.json();
    
    // OpenAlex 摘要存储在 abstract_inverted_index 中
    if (data.abstract_inverted_index) {
      const abstract = invertedIndexToText(data.abstract_inverted_index);
      if (abstract && abstract.length > 50) {
        return { abstract, error: null };
      }
    }
    
    // 备用：直接使用 abstract 字段（如果存在）
    if (data.abstract && data.abstract.length > 50) {
      return { abstract: data.abstract, error: null };
    }
    
    return { abstract: null, error: 'openalex_no_abstract' };
    
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { abstract: null, error: 'openalex_timeout' };
    }
    return { abstract: null, error: `openalex_${err.message || 'error'}` };
  }
}

// 使用 CORE API 获取摘要
async function fetchFromCore(doi: string): Promise<{ abstract: string | null; error: string | null }> {
  if (!CORE_API_KEY) {
    return { abstract: null, error: 'core_no_api_key' };
  }
  
  const url = `${CORE_BASE_URL}/search/works?q=doi:"${encodeURIComponent(doi)}"&limit=1`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${CORE_API_KEY}`,
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 404) {
        return { abstract: null, error: 'core_not_found' };
      }
      if (response.status === 401 || response.status === 403) {
        return { abstract: null, error: 'core_auth_error' };
      }
      return { abstract: null, error: `core_http_${response.status}` };
    }
    
    const data = await response.json();
    
    // CORE API 返回 results 数组
    if (data.results && data.results.length > 0) {
      const work = data.results[0];
      if (work.abstract && work.abstract.length > 50) {
        return { abstract: cleanText(work.abstract), error: null };
      }
    }
    
    return { abstract: null, error: 'core_no_abstract' };
    
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { abstract: null, error: 'core_timeout' };
    }
    return { abstract: null, error: `core_${err.message || 'error'}` };
  }
}

// 抓取单个 DOI 摘要
async function fetchSingleDoiAbstract(doi: string, retryCount = 0): Promise<FetchResult> {
  const startTime = Date.now();
  const userAgent = getRandomUA();
  
  // 策略1：先尝试通过 DOI 直接获取
  const resolvedUrl = await resolveDoiUrl(doi, userAgent);
  
  if (resolvedUrl) {
    const host = getHost(resolvedUrl);
    
    // 检查冷却
    if (!isHostInCooldown(host)) {
      // 等待主机可用
      const hostWaitStart = Date.now();
      while (!isHostAvailable(host)) {
        if (Date.now() - hostWaitStart > 20000) break;
        await sleep(200);
      }
      
      if (isHostAvailable(host)) {
        await waitForHostDelay(host);
        activeRequests.set(host, (activeRequests.get(host) || 0) + 1);
        
        try {
          const httpResult = await fetchWithHttp(resolvedUrl, userAgent, TIMEOUT_MS);
          
          if (httpResult.html) {
            const result = extractAbstract(httpResult.html);
            
            if (result.abstract) {
              markHostSuccess(host);
              return {
                doi,
                abstract: result.abstract,
                source: result.source,
                resolvedUrl: httpResult.finalUrl,
                error: null,
                duration: Date.now() - startTime,
                retryCount,
              };
            }
          }
          
          if (httpResult.statusCode) {
            markHostError(host, httpResult.statusCode);
          }
        } finally {
          const current = activeRequests.get(host) || 1;
          activeRequests.set(host, Math.max(0, current - 1));
        }
      }
    }
  }
  
  // 策略2：使用 CrossRef API 获取
  const crossRefResult = await fetchFromCrossRef(doi);
  
  if (crossRefResult.abstract) {
    return {
      doi,
      abstract: crossRefResult.abstract,
      source: 'crossref',
      resolvedUrl,
      error: null,
      duration: Date.now() - startTime,
      retryCount,
    };
  }
  
  // 策略3：使用 OpenAlex API 获取
  const openAlexResult = await fetchFromOpenAlex(doi);
  
  if (openAlexResult.abstract) {
    return {
      doi,
      abstract: openAlexResult.abstract,
      source: 'openalex',
      resolvedUrl,
      error: null,
      duration: Date.now() - startTime,
      retryCount,
    };
  }
  
  // 策略4：使用 CORE API 获取
  const coreResult = await fetchFromCore(doi);
  
  if (coreResult.abstract) {
    return {
      doi,
      abstract: coreResult.abstract,
      source: 'core',
      resolvedUrl,
      error: null,
      duration: Date.now() - startTime,
      retryCount,
    };
  }
  
  // 都失败了
  return {
    doi,
    abstract: null,
    source: null,
    resolvedUrl,
    error: coreResult.error || openAlexResult.error || crossRefResult.error || 'no_abstract_found',
    duration: Date.now() - startTime,
    retryCount,
  };
}

// 判断错误是否可重试
function isRetryableError(error: string | null): boolean {
  if (!error) return false;
  const retryable = ['fetch_failed', 'timeout', 'host_cooldown', 'http_503', 'http_429', 'openalex_timeout'];
  return retryable.some(e => error.includes(e));
}

// 并发控制器
async function fetchWithConcurrencyControl(
  records: LiteratureRecord[],
  onProgress?: (completed: number, total: number, round: number) => void
): Promise<Map<string, FetchResult>> {
  const results = new Map<string, FetchResult>();
  
  const toFetch = records.filter(r => r.doi && (!r.abstract || r.abstract.length < 50));
  const total = toFetch.length;
  
  console.log(`[DOI] 需要抓取摘要: ${total} 篇`);
  
  if (total === 0) return results;
  
  // 按主机分组，交错排列
  const byHost = new Map<string, LiteratureRecord[]>();
  for (const record of toFetch) {
    const cached = resolvedUrlCache.get(record.doi!);
    const host = cached ? getHost(cached) : 'unknown';
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(record);
  }
  
  const interleaved: LiteratureRecord[] = [];
  const hostQueues = Array.from(byHost.values());
  const maxLen = Math.max(...hostQueues.map(q => q.length));
  for (let i = 0; i < maxLen; i++) {
    for (const queue of hostQueues) {
      if (i < queue.length) {
        interleaved.push(queue[i]);
      }
    }
  }
  
  // 第一轮抓取
  let completed = 0;
  const pending: Promise<void>[] = [];
  const failedDois: string[] = [];
  
  console.log(`[DOI] 第 1 轮抓取开始`);
  
  for (const record of interleaved) {
    while (pending.length >= GLOBAL_CONCURRENCY) {
      await Promise.race(pending);
    }
    
    const doi = record.doi!;
    const promise = fetchSingleDoiAbstract(doi).then(result => {
      results.set(doi, result);
      completed++;
      onProgress?.(completed, total, 1);
      
      if (!result.abstract && isRetryableError(result.error)) {
        failedDois.push(doi);
      }
      
      const idx = pending.indexOf(promise);
      if (idx > -1) pending.splice(idx, 1);
    });
    
    pending.push(promise);
  }
  
  await Promise.all(pending);
  
  // 重试轮次
  for (let retry = 1; retry <= MAX_RETRIES && failedDois.length > 0; retry++) {
    console.log(`[DOI] 第 ${retry + 1} 轮重试: ${failedDois.length} 篇`);
    
    resetAllCooldowns();
    await sleep(RETRY_DELAY_MS);
    
    const retryDois = [...failedDois];
    failedDois.length = 0;
    
    for (const doi of retryDois) {
      while (pending.length >= Math.max(2, GLOBAL_CONCURRENCY / 2)) {
        await Promise.race(pending);
      }
      
      const promise = fetchSingleDoiAbstract(doi, retry).then(result => {
        results.set(doi, result);
        onProgress?.(completed, total, retry + 1);
        
        if (!result.abstract && isRetryableError(result.error) && retry < MAX_RETRIES) {
          failedDois.push(doi);
        }
        
        const idx = pending.indexOf(promise);
        if (idx > -1) pending.splice(idx, 1);
      });
      
      pending.push(promise);
    }
    
    await Promise.all(pending);
  }
  
  return results;
}

// 主工具函数
export async function fetchDoiAbstracts({ ctx }: ToolInput): Promise<ToolResult> {
  const records: LiteratureRecord[] = ctx.state.mergedRecords || [];
  
  if (records.length === 0) {
    console.log('[DOI] 无文献记录，跳过摘要抓取');
    return { output: { fetched: 0, skipped: true } };
  }
  
  const missingAbstract = records.filter(r => r.doi && (!r.abstract || r.abstract.length < 50));
  console.log(`[DOI] 文献总数: ${records.length}, 缺少摘要: ${missingAbstract.length}`);
  
  if (missingAbstract.length === 0) {
    ctx.state.logs.push('DOI 摘要抓取: 所有文献已有摘要');
    return { output: { fetched: 0, allHaveAbstract: true } };
  }
  
  ctx.state.logs.push(`DOI 摘要抓取开始: ${missingAbstract.length} 篇待处理`);
  
  // 清理状态
  hostStates.clear();
  activeRequests.clear();
  
  const results = await fetchWithConcurrencyControl(missingAbstract, (completed, total, round) => {
    if (completed % 10 === 0 || completed === total) {
      console.log(`[DOI] 进度: ${completed}/${total} (第${round}轮)`);
    }
  });
  
  // 统计结果
  let successCount = 0;
  let failCount = 0;
  let crossRefCount = 0;
  let openAlexCount = 0;
  let coreCount = 0;
  const errorDistribution: Record<string, number> = {};
  const sourceDistribution: Record<string, number> = {};
  
  for (const record of records) {
    if (!record.doi) continue;
    
    const result = results.get(record.doi);
    if (!result) continue;
    
    if (result.abstract) {
      record.abstract = result.abstract;
      if (!record.raw_data) record.raw_data = {};
      (record.raw_data as Record<string, unknown>).abstract_source = result.source;
      (record.raw_data as Record<string, unknown>).resolved_url = result.resolvedUrl;
      
      successCount++;
      if (result.source === 'crossref') crossRefCount++;
      if (result.source === 'openalex') openAlexCount++;
      if (result.source === 'core') coreCount++;
      sourceDistribution[result.source || 'unknown'] = (sourceDistribution[result.source || 'unknown'] || 0) + 1;
    } else {
      failCount++;
      const errKey = result.error || 'unknown';
      errorDistribution[errKey] = (errorDistribution[errKey] || 0) + 1;
    }
  }
  
  console.log(`[DOI] 抓取完成: 成功 ${successCount} (CrossRef ${crossRefCount}, OpenAlex ${openAlexCount}, CORE ${coreCount}), 失败 ${failCount}`);
  console.log(`[DOI] 来源分布:`, sourceDistribution);
  console.log(`[DOI] 错误分布:`, errorDistribution);
  
  ctx.state.logs.push(`DOI 摘要抓取完成: 成功 ${successCount}/${missingAbstract.length}`);
  
  ctx.state.mergedRecords = records;
  
  return {
    output: {
      total: missingAbstract.length,
      success: successCount,
      crossRefUsed: crossRefCount,
      openAlexUsed: openAlexCount,
      coreUsed: coreCount,
      failed: failCount,
      sourceDistribution,
      errorDistribution,
    },
  };
}
