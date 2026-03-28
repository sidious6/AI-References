#!/usr/bin/env node
/**
 * 数据源 API 可用性测试脚本
 * 直接使用 .env 中的配置测试 WOS / Scopus / CrossRef / OpenAlex / CORE API
 * 
 * 用法: node scripts/test-datasource-apis.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');

// 解析 .env
function loadEnv(filePath) {
  const env = {};
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val;
  }
  return env;
}

const env = loadEnv(envPath);

// 通用的测试请求函数
async function testApi(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[PASS] ${name}  (${elapsed}ms)`);
    console.log(`${'='.repeat(60)}`);
    if (result) console.log(result);
    return true;
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[FAIL] ${name}  (${elapsed}ms)`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Error: ${err.message}`);
    if (err.status) console.log(`  HTTP Status: ${err.status}`);
    if (err.body) console.log(`  Response: ${err.body.slice(0, 500)}`);
    return false;
  }
}

// 测试用的简单英文检索词
const TEST_QUERY = 'machine learning';

// ============================================================
// 1. WOS Starter API
// ============================================================
async function testWos() {
  const apiKey = env.WOS_API_KEY;
  const baseUrl = env.WOS_BASE_URL || 'https://api.clarivate.com/apis/wos-starter/v1';

  if (!apiKey) throw new Error('WOS_API_KEY 未配置');

  const query = encodeURIComponent(`TS=(${TEST_QUERY})`);
  const url = `${baseUrl}/documents?db=WOS&q=${query}&limit=3`;

  const resp = await fetch(url, {
    headers: { 'X-ApiKey': apiKey },
  });

  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`HTTP ${resp.status}`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }

  const data = await resp.json();
  const total = data.metadata?.total || 0;
  const hits = data.hits || [];

  let info = `  Total results: ${total}\n  Returned: ${hits.length} records\n`;
  for (const hit of hits.slice(0, 3)) {
    const title = hit.title || '(no title)';
    const year = hit.source?.publishYear || '?';
    const doi = hit.identifiers?.doi || '-';
    info += `  - [${year}] ${title.slice(0, 80)}  DOI: ${doi}\n`;
  }
  return info;
}

// ============================================================
// 2. Scopus API
// ============================================================
async function testScopus() {
  const apiKey = env.SCOPUS_API_KEY;
  const insttoken = env.SCOPUS_INSTTOKEN;
  const baseUrl = env.SCOPUS_BASE_URL || 'https://api.elsevier.com/content/search/scopus';

  if (!apiKey) throw new Error('SCOPUS_API_KEY 未配置');

  const query = encodeURIComponent(`TITLE-ABS-KEY(${TEST_QUERY})`);
  const viewParam = insttoken ? '&view=COMPLETE' : '';
  const url = `${baseUrl}?query=${query}&count=3${viewParam}`;

  const headers = {
    'X-ELS-APIKey': apiKey,
    'Accept': 'application/json',
  };
  if (insttoken) {
    headers['X-ELS-Insttoken'] = insttoken;
  }

  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`HTTP ${resp.status}`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }

  const data = await resp.json();
  const results = data['search-results'];
  const total = results?.['opensearch:totalResults'] || 0;
  const entries = results?.entry || [];

  // 检查错误响应
  if (entries.length === 1 && entries[0].error) {
    throw new Error(`Scopus query error: ${entries[0].error}`);
  }

  let info = `  Insttoken: ${insttoken ? 'configured (COMPLETE view)' : 'NOT configured (STANDARD view)'}\n`;
  info += `  Total results: ${total}\n  Returned: ${entries.length} records\n`;

  for (const e of entries.slice(0, 3)) {
    const title = e['dc:title'] || '(no title)';
    const year = e['prism:coverDate']?.slice(0, 4) || '?';
    const doi = e['prism:doi'] || '-';
    const hasAbstract = !!(e['dc:description'] && e['dc:description'].length > 50);
    info += `  - [${year}] ${title.slice(0, 80)}  DOI: ${doi}  Abstract: ${hasAbstract ? 'YES' : 'NO'}\n`;
  }
  return info;
}

// ============================================================
// 3. CrossRef API (free, no key)
// ============================================================
async function testCrossRef() {
  const email = env.CROSSREF_EMAIL || '';
  const mailto = email ? `&mailto=${encodeURIComponent(email)}` : '';
  const query = encodeURIComponent(TEST_QUERY);
  const url = `https://api.crossref.org/works?query=${query}&rows=3${mailto}`;

  const resp = await fetch(url, {
    headers: { 'User-Agent': `AI-References/1.0 (${email || 'anonymous'})` },
  });

  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`HTTP ${resp.status}`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }

  const data = await resp.json();
  const total = data.message?.['total-results'] || 0;
  const items = data.message?.items || [];

  let info = `  Polite pool email: ${email || '(not set)'}\n`;
  info += `  Total results: ${total}\n  Returned: ${items.length} records\n`;
  for (const item of items.slice(0, 3)) {
    const title = item.title?.[0] || '(no title)';
    const year = item['published-print']?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0] || '?';
    const doi = item.DOI || '-';
    info += `  - [${year}] ${title.slice(0, 80)}  DOI: ${doi}\n`;
  }
  return info;
}

// ============================================================
// 4. OpenAlex API
// ============================================================
async function testOpenAlex() {
  const apiKey = env.OPENALEX_API_KEY || '';
  const email = env.OPENALEX_EMAIL || '';
  const query = encodeURIComponent(TEST_QUERY);
  let url = `https://api.openalex.org/works?search=${query}&per_page=3`;
  if (email) url += `&mailto=${encodeURIComponent(email)}`;
  if (apiKey) url += `&api_key=${apiKey}`;

  const resp = await fetch(url);

  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`HTTP ${resp.status}`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }

  const data = await resp.json();
  const total = data.meta?.count || 0;
  const items = data.results || [];

  let info = `  API Key: ${apiKey ? 'configured' : 'NOT configured (using free tier)'}\n`;
  info += `  Total results: ${total}\n  Returned: ${items.length} records\n`;
  for (const item of items.slice(0, 3)) {
    const title = item.title || '(no title)';
    const year = item.publication_year || '?';
    const doi = item.doi || '-';
    const cited = item.cited_by_count || 0;
    info += `  - [${year}] ${title.slice(0, 80)}  DOI: ${doi}  Cited: ${cited}\n`;
  }
  return info;
}

// ============================================================
// 5. CORE API
// ============================================================
async function testCore() {
  const apiKey = env.CORE_API_KEY;
  if (!apiKey) throw new Error('CORE_API_KEY 未配置');

  const url = `https://api.core.ac.uk/v3/search/works`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: TEST_QUERY,
      limit: 3,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`HTTP ${resp.status}`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }

  const data = await resp.json();
  const total = data.totalHits || 0;
  const items = data.results || [];

  let info = `  Total results: ${total}\n  Returned: ${items.length} records\n`;
  for (const item of items.slice(0, 3)) {
    const title = item.title || '(no title)';
    const year = item.yearPublished || '?';
    const doi = item.doi || '-';
    info += `  - [${year}] ${title.slice(0, 80)}  DOI: ${doi}\n`;
  }
  return info;
}

// ============================================================
// 6. Google Custom Search Engine
// ============================================================
async function testGoogleCSE() {
  const apiKey = env.GOOGLE_CSE_API_KEY;
  const cx = env.GOOGLE_CSE_CX;
  const baseUrl = env.GOOGLE_CSE_BASE_URL || 'https://www.googleapis.com/customsearch/v1';

  if (!apiKey) throw new Error('GOOGLE_CSE_API_KEY 未配置');
  if (!cx) throw new Error('GOOGLE_CSE_CX 未配置');

  const query = encodeURIComponent(`${TEST_QUERY} research papers`);
  const url = `${baseUrl}?key=${apiKey}&cx=${cx}&q=${query}&num=3`;

  const resp = await fetch(url);

  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`HTTP ${resp.status}`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }

  const data = await resp.json();
  const total = data.searchInformation?.totalResults || 0;
  const items = data.items || [];

  let info = `  Total results: ${total}\n  Returned: ${items.length} results\n`;
  for (const item of items.slice(0, 3)) {
    const title = item.title || '(no title)';
    const link = item.link || '-';
    info += `  - ${title.slice(0, 80)}\n    ${link}\n`;
  }
  return info;
}

// ============================================================
// Run all tests
// ============================================================
async function main() {
  console.log('========================================');
  console.log('  AI-References Datasource API Tests');
  console.log(`  Test query: "${TEST_QUERY}"`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('========================================');

  const results = {};

  results['WOS (Web of Science) Starter API'] = await testApi('WOS (Web of Science) Starter API', testWos);
  results['Scopus (Elsevier) API'] = await testApi('Scopus (Elsevier) API', testScopus);
  results['CrossRef API'] = await testApi('CrossRef API', testCrossRef);
  results['OpenAlex API'] = await testApi('OpenAlex API', testOpenAlex);
  results['CORE API'] = await testApi('CORE API', testCore);
  results['Google Custom Search Engine'] = await testApi('Google Custom Search Engine', testGoogleCSE);

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'='.repeat(60)}`);
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  for (const [name, ok] of Object.entries(results)) {
    console.log(`  ${ok ? '[PASS]' : '[FAIL]'} ${name}`);
  }
  console.log(`\n  Result: ${passed}/${total} APIs available`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
