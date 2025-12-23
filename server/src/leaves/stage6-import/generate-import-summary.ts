/**
 * 生成入库摘要
 * 为每篇文献生成通过/未通过的决策和原因
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function generateImportSummary({ ctx }: ToolInput): Promise<ToolResult> {
  const records = (ctx.state as any).mergedRecords || [];
  
  const messages: ChatMessage[] = [
    { role: 'system', content: '你是学术助手，请为每篇文献给出通过/未通过的原因，简短中文。输出 JSON 数组，字段 title, decision, reason。' },
    { role: 'user', content: JSON.stringify(records).slice(0, 12000) },
  ];
  
  const res = await callLLM(messages);
  return { output: res.content };
}
