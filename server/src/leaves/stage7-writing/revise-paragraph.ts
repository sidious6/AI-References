/**
 * 润色段落
 * 在保持核心信息不变的前提下优化语言和结构
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function reviseParagraph({ ctx }: ToolInput): Promise<ToolResult> {
  const draft = ctx.state.tempAssets.find(a => a.title?.includes('草稿'));
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('PARAGRAPH_REVISION')}\n请在不改变核心信息的前提下优化语言和结构，输出改写结果。` },
    { role: 'user', content: draft?.content || '请润色这一段：...' },
  ];
  
  const res = await callLLM(messages);
  return { output: res.content };
}
