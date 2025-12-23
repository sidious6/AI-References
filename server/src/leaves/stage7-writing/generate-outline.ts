/**
 * 生成写作大纲
 * 基于章节框架生成更详细的写作要点
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function generateOutline({ ctx }: ToolInput): Promise<ToolResult> {
  const framework = ctx.state.tempAssets.find(a => a.type === 'chapter_framework');
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('OUTLINE_GENERATION')}\n请基于框架生成更细的写作要点。` },
    { role: 'user', content: framework?.content || '请生成大纲' },
  ];
  
  const res = await callLLM(messages);
  const asset = {
    session_id: ctx.session.id,
    type: 'draft' as const,
    title: '写作大纲',
    content: res.content,
    data: {},
    synced_to_project: false,
    synced_at: null,
    synced_project_id: ctx.projectId || ctx.session.project_id || null,
  };
  return { output: res.content, tempAssets: [asset] };
}
