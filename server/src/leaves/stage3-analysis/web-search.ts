/**
 * 网络搜索
 * 使用 Google CSE 搜索相关网页资料，并用 AI 分析提取关键信息
 */
import type { ToolInput, ToolResult } from '../types.js';
import { config } from '../../config/index.js';
import { callLLM } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

const ANALYSIS_PROMPT = `你是一个学术研究助手，擅长从网页搜索结果中提取对学术研究有价值的信息。

## 任务
分析以下网页搜索结果，提取与研究主题相关的关键信息。

## 输出要求
1. 识别出与研究主题最相关的 5-10 条结果
2. 对每条相关结果，提取：
   - 核心观点或发现
   - 可能的研究方向启示
   - 是否包含可引用的数据或案例
3. 总结这些搜索结果对研究的整体价值

## 输出格式
### 关键发现
[列出最重要的发现]

### 相关资源分析
[对每个相关资源的简要分析]

### 研究启示
[对研究方向的建议]`;

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
    
    // 如果有搜索结果，使用 AI 分析
    if (allItems.length > 0) {
      console.log('[webSearch] 开始 AI 分析搜索结果...');
      
      const searchResultsText = allItems.map((item, i) => 
        `${i + 1}. ${item.title}\n   链接: ${item.link}\n   摘要: ${item.snippet}`
      ).join('\n\n');
      
      const messages: ChatMessage[] = [
        { role: 'system', content: ANALYSIS_PROMPT },
        { role: 'user', content: `## 研究主题\n${query}\n\n## 搜索结果\n${searchResultsText}` },
      ];
      
      try {
        const analysisResult = await callLLM(messages);
        const analysis = analysisResult.content;
        
        console.log('[webSearch] AI 分析完成');
        ctx.state.logs.push('网络搜索 AI 分析完成');
        
        // 将分析结果存入上下文
        ctx.state.webSearchAnalysis = analysis;
        ctx.state.webSearchResults = allItems;
        
        return { 
          output: {
            results: allItems,
            analysis,
          }
        };
      } catch (analysisErr: any) {
        console.error('[webSearch] AI 分析失败:', analysisErr.message);
        ctx.state.logs.push(`网络搜索 AI 分析失败: ${analysisErr.message}`);
        // 分析失败仍保存原始搜索结果供下游使用
        ctx.state.webSearchResults = allItems;
        return { output: allItems };
      }
    }
    
    return { output: allItems };
  } catch (err: any) {
    console.error(`[webSearch] 异常:`, err.message);
    ctx.state.logs.push(`网络搜索异常: ${err.message}`);
    return { output: [] };
  }
}
