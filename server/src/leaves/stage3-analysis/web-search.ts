/**
 * 网络搜索
 * 使用 Google CSE 搜索相关网页资料作为背景信息
 */
import type { ToolInput, ToolResult } from '../types.js';
import { config } from '../../config/index.js';

export async function webSearch({ ctx }: ToolInput): Promise<ToolResult> {
  const query = ctx.session.research_topic || 'research survey';
  const key = config.apis.googleCseApiKey;
  const cx = config.apis.googleCseCx;
  
  if (!key || !cx) {
    console.log('[webSearch] 跳过: Google CSE 未配置');
    ctx.state.logs.push('网络搜索跳过: 未配置');
    return { output: [] };
  }
  
  try {
    const allItems: { title: string; link: string; snippet: string }[] = [];
    const maxResults = 30;
    const perPage = 10;
    
    for (let start = 1; start <= maxResults; start += perPage) {
      const url = `${config.apis.googleCseBaseUrl}?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${perPage}&start=${start}`;
      const resp = await fetch(url);
      
      if (!resp.ok) {
        console.error(`[webSearch] 请求失败 (start=${start}): ${resp.status}`);
        break;
      }
      
      const data = await resp.json();
      const items = (data.items || []).map((it: any) => ({
        title: it.title,
        link: it.link,
        snippet: it.snippet,
      }));
      
      allItems.push(...items);
      console.log(`[webSearch] 第 ${Math.ceil(start / perPage)} 页: ${items.length} 条`);
      
      if (items.length < perPage) break;
    }
    
    ctx.state.logs.push(`网络搜索返回 ${allItems.length} 条`);
    return { output: allItems };
  } catch (err: any) {
    console.error(`[webSearch] 异常:`, err.message);
    ctx.state.logs.push(`网络搜索异常: ${err.message}`);
    return { output: [] };
  }
}
