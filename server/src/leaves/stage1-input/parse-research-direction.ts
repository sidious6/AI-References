/**
 * 解析研究方向
 * 从用户输入中提取研究主题、关键词、领域等结构化信息
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

export async function parseResearchDirection({ ctx }: ToolInput): Promise<ToolResult> {
  const topic = ctx.session.research_topic || '';
  const goal = ctx.session.research_goal || '';
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('PARSE_DIRECTION')}\n请提取研究主题、关键词、领域、约束，返回 JSON。` },
    { role: 'user', content: `研究主题: ${topic}\n研究目标: ${goal}` },
  ];
  
  const res = await callLLM(messages);
  ctx.state.logs.push(res.content);
  return { output: res.content };
}
