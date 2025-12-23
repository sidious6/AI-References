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
  
  console.log(`[generateInitialFramework] 研究主题: ${topic}`);
  ctx.state.logs.push(`生成研究框架: ${topic.slice(0, 50)}`);
  
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: `${getPrompt('FRAMEWORK_GENERATION')}\n请输出到二级标题的章节框架，先给 JSON，再给可读版。` },
      { role: 'user', content: `研究主题: ${topic}\n研究目标: ${goal}` },
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
