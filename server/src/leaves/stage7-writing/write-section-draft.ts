/**
 * 撰写章节草稿
 * 根据大纲撰写学术论文章节内容
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function writeSectionDraft({ ctx }: ToolInput): Promise<ToolResult> {
  // 优先精确匹配写作大纲，回退到最新的 chapter_framework，避免匹配到其他 draft
  const outline = ctx.state.tempAssets.find(a => a.title === '写作大纲')
    || [...ctx.state.tempAssets].reverse().find(a => a.type === 'chapter_framework');
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('SECTION_DRAFT')}\n请按中文输出正文，带小标题。` },
    { role: 'user', content: outline?.content || '请写一段综述' },
  ];
  
  const res = await callLLM(messages, ctx.preferences.model || undefined);
  const asset = {
    session_id: ctx.session.id,
    type: 'draft' as const,
    title: '章节草稿',
    content: res.content,
    data: {},
    synced_to_project: false,
    synced_at: null,
    synced_project_id: ctx.projectId || ctx.session.project_id || null,
  };
  return { output: res.content, tempAssets: [asset] };
}
