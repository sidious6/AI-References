/**
 * 调用 Scopus API
 * 使用 Elsevier Scopus API 检索学术文献
 * 支持多条检索式批量检索
 * 
 * 认证方式:
 * - X-ELS-APIKey: API Key (必需)
 * - X-ELS-Insttoken: 机构令牌 (有则可获取摘要等完整数据)
 * 
 * 安全约束 (Elsevier 要求):
 * - insttoken 必须保存在服务端
 * - 不能出现在浏览器端代码或地址栏
 * - 所有请求必须通过 HTTPS
 */
import type { ToolInput, ToolResult } from '../types.js';
import { config } from '../../config/index.js';
import { settingsService } from '../../services/settings.service.js';

interface QueryItem {
  section: string;
  query: string;
  keywords_en?: string[];
}

// Scopus API 响应类型
interface ScopusSearchResponse {
  'search-results': {
    entry?: ScopusEntry[];
    'opensearch:totalResults'?: string;
  };
}

interface ScopusEntry {
  error?: string;
  '@_fa'?: string;
  'dc:identifier'?: string;
  'dc:title'?: string;
  'dc:creator'?: string;
  'dc:description'?: string;
  'prism:doi'?: string;
  'prism:publicationName'?: string;
  'prism:coverDate'?: string;
  'prism:issn'?: string;
  'prism:eIssn'?: string;
  'prism:volume'?: string;
  'prism:issueIdentifier'?: string;
  'prism:pageRange'?: string;
  'prism:teaser'?: string;
  'prism:aggregationType'?: string;
  'citedby-count'?: string;
  'subtypeDescription'?: string;
  author?: ScopusAuthor[];
  authkeywords?: string | string[];
  affiliation?: { affilname?: string }[];
  link?: { '@ref'?: string; '@href'?: string }[];
}

interface ScopusAuthor {
  authname?: string;
  surname?: string;
  'given-name'?: string;
  'ce:given-name'?: string;
  'ce:indexed-name'?: string;
}

// 构建通用请求头
function buildHeaders(apiKey: string, insttoken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-ELS-APIKey': apiKey,
    'Accept': 'application/json',
  };
  if (insttoken) {
    headers['X-ELS-Insttoken'] = insttoken;
  }
  return headers;
}

export async function callScopusApi({ ctx }: ToolInput): Promise<ToolResult> {
  // 动态获取配置，优先使用数据库配置
  const dsConfig = await settingsService.getEffectiveDatasourceConfig();
  const apiKey = dsConfig.scopus.apiKey;
  const insttoken = dsConfig.scopus.insttoken;
  
  if (!apiKey) {
    console.log('[Scopus API] 跳过: SCOPUS_API_KEY 未配置');
    ctx.state.logs.push('Scopus 检索跳过: API Key 未配置');
    return { output: [] };
  }
  
  const hasInsttoken = !!insttoken;
  if (!hasInsttoken) {
    console.log('[Scopus API] 警告: SCOPUS_INSTTOKEN 未配置，无法获取摘要');
  } else {
    console.log('[Scopus API] 已配置 insttoken，将获取完整数据（含摘要）');
  }

  const queries: QueryItem[] = ctx.state.queries || [];
  const allRecords: any[] = [];
  
  // 收集检索式
  const searchQueries: string[] = [];
  
  if (queries.length > 0) {
    for (const q of queries.slice(0, 3)) {
      if (q.query && typeof q.query === 'string') {
        searchQueries.push(q.query);
      }
    }
  }
  
  if (searchQueries.length === 0) {
    const topic = ctx.session.research_topic || '';
    const isEnglish = /^[a-zA-Z\s\-\*"()]+$/.test(topic.trim());
    if (isEnglish && topic.length > 3) {
      searchQueries.push(topic);
    } else {
      console.log('[Scopus API] 警告: 需要英文检索式');
      ctx.state.logs.push('Scopus 检索跳过: 需要英文检索式');
      return { output: [] };
    }
  }

  console.log(`[Scopus API] 准备执行 ${searchQueries.length} 条检索`);
  const headers = buildHeaders(apiKey, insttoken);

  for (let i = 0; i < searchQueries.length; i++) {
    const searchQuery = searchQueries[i];
    
    try {
      // Scopus 使用 TITLE-ABS-KEY 语法
      const cleanQuery = searchQuery
        .replace(/[""]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Scopus 检索语法转换
      const scopusQuery = `TITLE-ABS-KEY(${cleanQuery})`;
      const query = encodeURIComponent(scopusQuery);
      
      // 有 insttoken 时使用 COMPLETE view 获取摘要
      // field 参数指定返回字段，确保包含摘要
      const viewParam = hasInsttoken ? '&view=COMPLETE' : '';
      const url = `${config.apis.scopusBaseUrl}?query=${query}&count=25${viewParam}`;

      console.log(`[Scopus API] 检索 ${i + 1}/${searchQueries.length}: ${cleanQuery.slice(0, 60)}...`);
      ctx.state.logs.push(`Scopus 检索 ${i + 1}: ${cleanQuery.slice(0, 40)}...`);

      const resp = await fetch(url, { headers });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[Scopus API] 错误 ${resp.status}:`, errText.slice(0, 200));
        ctx.state.logs.push(`Scopus 请求失败: ${resp.status}`);
        continue;
      }

      const data = await resp.json() as ScopusSearchResponse;
      const entries: ScopusEntry[] = data?.['search-results']?.entry || [];
      
      // 检查是否有错误响应
      if (entries.length === 1 && entries[0].error) {
        console.error('[Scopus API] 查询错误:', entries[0].error);
        continue;
      }
      
      const records = entries.map((e: ScopusEntry) => {
        // 提取作者信息 - Scopus API 可能返回多种格式
        let authors: string[] = [];
        if (e.author && Array.isArray(e.author)) {
          authors = e.author.map((a: ScopusAuthor) => {
            // 优先使用 authname，否则拼接 surname 和 given-name
            if (a.authname) return a.authname;
            if (a.surname) {
              const givenName = a['given-name'] || a['ce:given-name'] || '';
              return givenName ? `${a.surname}, ${givenName}` : a.surname;
            }
            return a['ce:indexed-name'] || '';
          }).filter(Boolean);
        } else if (e['dc:creator']) {
          // 备用：使用 dc:creator 字段
          authors = [e['dc:creator']];
        }

        // 提取链接
        const links = e.link || [];
        const scopusLink = links.find((l: any) => l['@ref'] === 'scopus')?.['@href'] || null;
        const fullTextLink = links.find((l: any) => l['@ref'] === 'full-text')?.['@href'] || null;

        // 提取关键词 - Scopus 返回的 authkeywords 可能是字符串或数组
        let keywords: string[] = [];
        if (e.authkeywords) {
          if (typeof e.authkeywords === 'string') {
            keywords = e.authkeywords.split('|').map((k: string) => k.trim()).filter(Boolean);
          } else if (Array.isArray(e.authkeywords)) {
            keywords = e.authkeywords;
          }
        }

        // 提取摘要 - COMPLETE view 下 dc:description 包含完整摘要
        const abstract = e['dc:description'] || e['prism:teaser'] || '';

        return {
          title: e['dc:title'] || '',
          doi: e['prism:doi'] || null,
          authors,
          year: e['prism:coverDate'] ? Number((e['prism:coverDate'] as string).slice(0, 4)) : null,
          abstract,
          keywords,
          journal: e['prism:publicationName'] || '',
          source_database: 'scopus',
          scopus_id: e['dc:identifier']?.replace('SCOPUS_ID:', '') || null,
          scopus_link: scopusLink,
          full_text_link: fullTextLink,
          search_query: cleanQuery.slice(0, 100),
          // 额外字段（COMPLETE view 可能包含）
          citation_count: e['citedby-count'] ? Number(e['citedby-count']) : null,
          document_type: e['subtypeDescription'] || e['prism:aggregationType'] || null,
          issn: e['prism:issn'] || e['prism:eIssn'] || null,
          volume: e['prism:volume'] || null,
          issue: e['prism:issueIdentifier'] || null,
          pages: e['prism:pageRange'] || null,
          affiliation: e.affiliation?.[0]?.affilname || null,
        };
      });

      // 统计有摘要的记录数
      const withAbstract = records.filter((r: any) => r.abstract && r.abstract.length > 50).length;
      console.log(`[Scopus API] 检索 ${i + 1} 返回 ${records.length} 条，${withAbstract} 条有摘要`);
      allRecords.push(...records);
      
    } catch (err: any) {
      console.error(`[Scopus API] 检索 ${i + 1} 异常:`, err.message);
      ctx.state.logs.push(`Scopus 请求异常: ${err.message}`);
    }
  }

  // 去重
  const seen = new Set<string>();
  const uniqueRecords = allRecords.filter(r => {
    const key = r.doi || r.title?.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 统计摘要覆盖率
  const totalWithAbstract = uniqueRecords.filter(r => r.abstract && r.abstract.length > 50).length;
  console.log(`[Scopus API] 总计返回 ${uniqueRecords.length} 条（去重后），${totalWithAbstract} 条有摘要`);
  ctx.state.logs.push(`Scopus 返回 ${uniqueRecords.length} 条文献（${totalWithAbstract} 条有摘要）`);
  
  // 初始化或追加到 latestRecords
  if (!ctx.state.latestRecords) {
    ctx.state.latestRecords = [];
  }
  ctx.state.latestRecords.push(...uniqueRecords);
  
  return { output: uniqueRecords };
}
