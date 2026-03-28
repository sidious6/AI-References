/**
 * 生成初始研究框架
 * 根据研究主题生成完整的章节结构框架
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function generateInitialFramework({ ctx }: ToolInput): Promise<ToolResult> {
  const topic = ctx.session.research_topic || '';
  const goal = ctx.session.research_goal || '';
  const parsed = ctx.state.parsedDirection;
  
  console.log(`[generateInitialFramework] 研究主题: ${topic}`);
  ctx.state.logs.push(`生成研究框架: ${topic.slice(0, 50)}`);
  
  // 汇总上游信息供 LLM 参考
  const contextParts: string[] = [
    `研究主题: ${topic}`,
    `研究目标: ${goal}`,
  ];

  if (parsed?.keywords?.length) {
    contextParts.push(`关键词: ${parsed.keywords.join(', ')}`);
  }
  if (parsed?.domain) {
    contextParts.push(`学科领域: ${parsed.domain}`);
  }
  if (parsed?.constraints) {
    contextParts.push(`约束条件: ${parsed.constraints}`);
  }
  if (ctx.state.projectDocuments.length > 0) {
    const docSnippets = ctx.state.projectDocuments
      .filter(d => d.snippet)
      .map(d => `[${d.name}] ${d.snippet!.slice(0, 300)}`)
      .join('\n');
    if (docSnippets) contextParts.push(`项目文档摘要:\n${docSnippets}`);
  }
  if (ctx.state.webSearchAnalysis) {
    contextParts.push(`网络调研结果:\n${ctx.state.webSearchAnalysis.slice(0, 800)}`);
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: `${getPrompt('FRAMEWORK_GENERATION')}\n请输出到二级标题的章节框架，先给 JSON，再给可读版。` },
      { role: 'user', content: contextParts.join('\n') },
    ];
    const res = await callLLM(messages);
    
    console.log(`[generateInitialFramework] 框架生成完成, 长度: ${res.content.length}`);
    ctx.state.logs.push(`研究框架生成完成`);
    
    const asset = {
      session_id: ctx.session.id,
      type: 'chapter_framework' as const,
      title: '初始框架',
      content: res.content,
      data: { topic, goal },
      synced_to_project: false,
      synced_at: null,
      synced_project_id: null,
    };
    
    return { output: res.content, tempAssets: [asset] };
  } catch (err: any) {
    console.error(`[generateInitialFramework] 失败:`, err.message);
    ctx.state.logs.push(`框架生成失败: ${err.message}`);
    return { output: '' };
  }
}
