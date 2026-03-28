/**
 * 优化研究框架
 * 对初始框架进行优化、去重和补充
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function refineFramework({ ctx }: ToolInput): Promise<ToolResult> {
  const framework = ctx.state.tempAssets.find(a => a.type === 'chapter_framework');
  const parsed = ctx.state.parsedDirection;

  // 补充上游上下文帮助优化框架
  const extraContext: string[] = [];
  if (parsed?.keywords?.length) {
    extraContext.push(`关键词: ${parsed.keywords.join(', ')}`);
  }
  if (ctx.state.projectDocuments.length > 0) {
    extraContext.push(`项目已有 ${ctx.state.projectDocuments.length} 个文档`);
  }
  if (ctx.state.webSearchAnalysis) {
    extraContext.push(`网络调研摘要: ${ctx.state.webSearchAnalysis.slice(0, 500)}`);
  }

  const userContent = extraContext.length > 0
    ? `${framework?.content || '请生成框架'}\n\n参考信息:\n${extraContext.join('\n')}`
    : framework?.content || '请生成框架';

  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('FRAMEWORK_GENERATION')}\n请在保持结构完整的情况下优化、去重、补充缺失环节，输出 JSON + 可读版。` },
    { role: 'user', content: userContent },
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
