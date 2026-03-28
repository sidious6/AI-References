/**
 * 优化检索式
 * 当检索结果不理想时，优化检索式以提高命中率，结果写回 ctx.state.queries
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';
import type { QueryItem } from '../../services/deepreference/recode.types.js';

export async function refineQuery({ ctx }: ToolInput): Promise<ToolResult> {
  const queries = ctx.state.queries || [];

  // 安全截断: 按条目数量限制而非字符截断，避免截断 JSON 结构
  const safeQueries = queries.slice(0, 20);
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('QUERY_REFINEMENT')}\n如果发现数量不足或命中低，请优化检索式，输出 JSON。` },
    { role: 'user', content: JSON.stringify(safeQueries) },
  ];
  
  const res = await callLLM(messages);

  // 解析 LLM 返回的优化检索式并写回 state
  try {
    const jsonMatch = res.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const refined: QueryItem[] = JSON.parse(jsonMatch[0]);
      if (Array.isArray(refined) && refined.length > 0) {
        ctx.state.queries = refined;
        console.log(`[refineQuery] 检索式已优化: ${queries.length} -> ${refined.length} 条`);
        ctx.state.logs.push(`检索式优化: ${refined.length} 条`);
        return { output: refined };
      }
    }
  } catch {
    console.warn('[refineQuery] LLM 返回非 JSON，保留原始检索式');
  }

  ctx.state.logs.push('检索式优化: LLM 未返回有效结果，保留原始检索式');
  return { output: queries };
}
