/**
 * 询问澄清问题
 * 当研究方向不够清晰时，生成澄清问题帮助用户明确需求
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function askClarification({ ctx }: ToolInput): Promise<ToolResult> {
  const topic = ctx.session.research_topic || '';
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('CLARIFICATION')}\n请输出 3 个需要澄清的问题，用中文简洁列出。` },
    { role: 'user', content: `研究主题: ${topic}` },
  ];
  
  const res = await callLLM(messages);
  return { output: res.content, messagesToUser: [res.content] };
}
