/**
 * 调用 WOS API
 * 使用 Web of Science Starter API 检索学术文献
 * 支持多条检索式批量检索
 */
import type { ToolInput, ToolResult } from '../types.js';
import { config } from '../../config/index.js';
import { settingsService } from '../../services/settings.service.js';

interface QueryItem {
  section: string;
  query: string;
  keywords_en?: string[];
}

export async function callWosApi({ ctx }: ToolInput): Promise<ToolResult> {
  // 动态获取配置，优先使用数据库配置
  const dsConfig = await settingsService.getEffectiveDatasourceConfig();
  const key = dsConfig.wos.apiKey;
  
  if (!key) {
    console.log('[WOS API] 跳过: WOS_API_KEY 未配置');
    ctx.state.logs.push('WOS 检索跳过: API Key 未配置');
    return { output: [] };
  }

  const queries: QueryItem[] = (ctx.state as any).queries || [];
  const allRecords: any[] = [];
  
  // 如果没有生成检索式，使用研究主题的英文翻译
  const searchQueries: string[] = [];
  
  if (queries.length > 0) {
    // 使用 AI 生成的检索式（取前 3 条避免请求过多）
    for (const q of queries.slice(0, 3)) {
      if (q.query && typeof q.query === 'string') {
        searchQueries.push(q.query);
      }
    }
  }
  
  // 如果没有有效检索式，使用备用关键词
  if (searchQueries.length === 0) {
    // 从研究主题提取可能的英文关键词或使用通用检索
    const topic = ctx.session.research_topic || '';
    // 检查是否已经是英文
    const isEnglish = /^[a-zA-Z\s\-\*"()]+$/.test(topic.trim());
    if (isEnglish && topic.length > 3) {
      searchQueries.push(topic);
    } else {
      // 中文主题，使用通用学术关键词
      console.log('[WOS API] 警告: 研究主题为中文，需要先生成英文检索式');
      ctx.state.logs.push('WOS 检索跳过: 需要英文检索式');
      return { output: [] };
    }
  }

  console.log(`[WOS API] 准备执行 ${searchQueries.length} 条检索`);

  for (let i = 0; i < searchQueries.length; i++) {
    const searchQuery = searchQueries[i];
    
    try {
      // WOS Starter API 使用 TS= 语法进行主题检索
      // 清理检索式中的特殊字符
      const cleanQuery = searchQuery
        .replace(/[""]/g, '"')  // 统一引号
        .replace(/\s+/g, ' ')   // 合并空格
        .trim();
      
      const query = encodeURIComponent(`TS=(${cleanQuery})`);
      const url = `${config.apis.wosBaseUrl}/documents?db=WOS&q=${query}&limit=20`;

      console.log(`[WOS API] 检索 ${i + 1}/${searchQueries.length}: ${cleanQuery.slice(0, 60)}...`);
      ctx.state.logs.push(`WOS 检索 ${i + 1}: ${cleanQuery.slice(0, 40)}...`);

      const resp = await fetch(url, {
        headers: { 'X-ApiKey': key },
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[WOS API] 错误 ${resp.status}:`, errText.slice(0, 200));
        ctx.state.logs.push(`WOS 请求失败: ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const hits = data.hits || [];

      const records = hits.map((r: any) => {
        // 提取作者信息 - WOS Starter API 返回 names.authors 数组
        let authors: string[] = [];
        if (r.names?.authors && Array.isArray(r.names.authors)) {
          authors = r.names.authors.map((a: any) => {
            // 优先使用 displayName，否则拼接 lastName 和 firstName
            if (a.displayName) return a.displayName;
            if (a.lastName) {
              return a.firstName ? `${a.lastName}, ${a.firstName}` : a.lastName;
            }
            return a.wosStandard || '';
          }).filter(Boolean);
        }

        // 注意: WOS Starter API 不返回摘要字段，这是 API 的限制
        // 如需摘要，需要使用 WOS Expanded API（付费版本）
        // 参考: https://developer.clarivate.com/apis/wos-starter/swagger

        // 提取关键词 - WOS Starter API 返回 keywords 对象
        let keywords: string[] = [];
        if (r.keywords?.authorKeywords && Array.isArray(r.keywords.authorKeywords)) {
          keywords = r.keywords.authorKeywords;
        }
        // 也添加 keywordsPlus（WOS 自动生成的关键词）
        if (r.keywords?.keywordsPlus && Array.isArray(r.keywords.keywordsPlus)) {
          keywords = [...keywords, ...r.keywords.keywordsPlus];
        }

        // 提取链接
        const wosLink = r.links?.record || null;
        const doiLink = r.identifiers?.doi ? `https://doi.org/${r.identifiers.doi}` : null;

        return {
          title: r.title || '',
          doi: r.identifiers?.doi || null,
          authors,
          year: r.source?.publishYear || null,
          abstract: '', // WOS Starter API 不提供摘要
          keywords,
          journal: r.source?.sourceTitle || '',
          source_database: 'wos',
          uid: r.uid,
          wos_link: wosLink,
          doi_link: doiLink,
          search_query: cleanQuery.slice(0, 100),
        };
      });

      console.log(`[WOS API] 检索 ${i + 1} 返回 ${records.length} 条 (总计 ${data.metadata?.total || 0})`);
      allRecords.push(...records);
      
    } catch (err: any) {
      console.error(`[WOS API] 检索 ${i + 1} 异常:`, err.message);
      ctx.state.logs.push(`WOS 请求异常: ${err.message}`);
    }
  }

  // 去重（按 DOI 或 title）
  const seen = new Set<string>();
  const uniqueRecords = allRecords.filter(r => {
    const key = r.doi || r.title?.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[WOS API] 总计返回 ${uniqueRecords.length} 条（去重后）`);
  ctx.state.logs.push(`WOS 返回 ${uniqueRecords.length} 条文献`);
  
  // 初始化或追加到 latestRecords
  if (!(ctx.state as any).latestRecords) {
    (ctx.state as any).latestRecords = [];
  }
  (ctx.state as any).latestRecords.push(...uniqueRecords);

  return { output: uniqueRecords };
}
