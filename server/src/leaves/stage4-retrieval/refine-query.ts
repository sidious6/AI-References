/**
 * 优化检索式
 * 当检索结果不理想时，优化检索式以提高命中率
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function refineQuery({ ctx }: ToolInput): Promise<ToolResult> {
  const queries = (ctx.state as any).queries || [];
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('QUERY_REFINEMENT')}\n如果发现数量不足或命中低，请优化检索式，输出 JSON。` },
    { role: 'user', content: JSON.stringify(queries).slice(0, 6000) },
  ];
  
  const res = await callLLM(messages);
  return { output: res.content };
}
