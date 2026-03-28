/**
 * 润色段落
 * 在保持核心信息不变的前提下优化语言和结构，产出更新后的草稿 tempAsset
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function reviseParagraph({ ctx }: ToolInput): Promise<ToolResult> {
  // 逆序查找取最新草稿
  const draft = [...ctx.state.tempAssets].reverse().find(a => a.title?.includes('草稿'));
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('PARAGRAPH_REVISION')}\n请在不改变核心信息的前提下优化语言和结构，输出改写结果。` },
    { role: 'user', content: draft?.content || '请润色这一段：...' },
  ];
  
  const res = await callLLM(messages);

  const asset = {
    session_id: ctx.session.id,
    type: 'draft' as const,
    title: '润色草稿',
    content: res.content,
    data: { source: 'reviseParagraph' },
    synced_to_project: false,
    synced_at: null,
    synced_project_id: ctx.projectId || ctx.session.project_id || null,
  };

  ctx.state.logs.push('段落润色完成');
  return { output: res.content, tempAssets: [asset] };
}
