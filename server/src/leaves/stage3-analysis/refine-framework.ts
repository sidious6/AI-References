/**
 * 优化研究框架
 * 对初始框架进行优化、去重和补充
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function refineFramework({ ctx }: ToolInput): Promise<ToolResult> {
  const framework = ctx.state.tempAssets.find(a => a.type === 'chapter_framework');
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('FRAMEWORK_GENERATION')}\n请在保持结构完整的情况下优化、去重、补充缺失环节，输出 JSON + 可读版。` },
    { role: 'user', content: framework?.content || '请生成框架' },
  ];
  
  const res = await callLLM(messages);
  const asset = {
    session_id: ctx.session.id,
    type: 'chapter_framework' as const,
    title: '优化框架',
    content: res.content,
    data: {},
    synced_to_project: false,
    synced_at: null,
    synced_project_id: null,
  };
  return { output: res.content, tempAssets: [asset] };
}
