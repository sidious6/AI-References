/**
 * 调用 Scopus API
 * 使用 Elsevier Scopus API 检索学术文献
 * 支持多条检索式批量检索
 * 
 * 注意: 当前 API Key 权限限制，无法获取摘要
 * - Search API 不支持 view=FULL/COMPLETE
 * - Abstract Retrieval API 的 view=META_ABS/FULL 返回 401
 * - 只有 view=META 可用，但不含摘要
 */
import type { ToolInput, ToolResult } from '../types.js';
import { config } from '../../config/index.js';

interface QueryItem {
  section: string;
  query: string;
  keywords_en?: string[];
}

export async function callScopusApi({ ctx }: ToolInput): Promise<ToolResult> {
  const key = config.apis.scopusApiKey;
  if (!key) {
    console.log('[Scopus API] 跳过: SCOPUS_API_KEY 未配置');
    ctx.state.logs.push('Scopus 检索跳过: API Key 未配置');
    return { output: [] };
  }

  const queries: QueryItem[] = (ctx.state as any).queries || [];
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
      // 注意: 当前 API Key 不支持获取摘要的 view 参数
      const url = `${config.apis.scopusBaseUrl}?query=${query}&count=20`;

      console.log(`[Scopus API] 检索 ${i + 1}/${searchQueries.length}: ${cleanQuery.slice(0, 60)}...`);
      ctx.state.logs.push(`Scopus 检索 ${i + 1}: ${cleanQuery.slice(0, 40)}...`);

      const resp = await fetch(url, {
        headers: {
          'X-ELS-APIKey': key,
          'Accept': 'application/json',
        },
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[Scopus API] 错误 ${resp.status}:`, errText.slice(0, 200));
        ctx.state.logs.push(`Scopus 请求失败: ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const entries = data?.['search-results']?.entry || [];
      
      // 检查是否有错误响应
      if (entries.length === 1 && entries[0].error) {
        console.error('[Scopus API] 查询错误:', entries[0].error);
        continue;
      }
      
      const records = entries.map((e: any) => {
        // 提取作者信息 - Scopus API 可能返回多种格式
        let authors: string[] = [];
        if (e.author && Array.isArray(e.author)) {
          authors = e.author.map((a: any) => {
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

        return {
          title: e['dc:title'] || '',
          doi: e['prism:doi'] || null,
          authors,
          year: e['prism:coverDate'] ? Number((e['prism:coverDate'] as string).slice(0, 4)) : null,
          abstract: e['dc:description'] || e['prism:teaser'] || '',
          keywords,
          journal: e['prism:publicationName'] || '',
          source_database: 'scopus',
          scopus_id: e['dc:identifier']?.replace('SCOPUS_ID:', '') || null,
          scopus_link: scopusLink,
          full_text_link: fullTextLink,
          search_query: cleanQuery.slice(0, 100),
        };
      });

      console.log(`[Scopus API] 检索 ${i + 1} 返回 ${records.length} 条`);
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

  console.log(`[Scopus API] 总计返回 ${uniqueRecords.length} 条（去重后）`);
  ctx.state.logs.push(`Scopus 返回 ${uniqueRecords.length} 条文献`);
  
  // 初始化或追加到 latestRecords
  if (!(ctx.state as any).latestRecords) {
    (ctx.state as any).latestRecords = [];
  }
  (ctx.state as any).latestRecords.push(...uniqueRecords);
  
  return { output: uniqueRecords };
}
