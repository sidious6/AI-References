/**
 * 解析研究方向
 * 从用户输入中提取研究主题、关键词、领域等结构化信息，写入 ctx.state
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';
import type { ParsedDirection } from '../../services/deepreference/recode.types.js';

export async function parseResearchDirection({ ctx }: ToolInput): Promise<ToolResult> {
  const topic = ctx.session.research_topic || '';
  const goal = ctx.session.research_goal || '';
  
  const messages: ChatMessage[] = [
    { role: 'system', content: `${getPrompt('PARSE_DIRECTION')}\n请提取研究主题、关键词、领域、约束，返回 JSON。` },
    { role: 'user', content: `研究主题: ${topic}\n研究目标: ${goal}` },
  ];
  
  const res = await callLLM(messages);

  // 尝试解析 LLM 返回的 JSON 结构
  let parsed: ParsedDirection = {};
  try {
    const jsonMatch = res.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const raw = JSON.parse(jsonMatch[0]);
      parsed = {
        research_topic: raw.research_topic || topic,
        keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
        domain: raw.domain || undefined,
        constraints: raw.constraints || undefined,
      };
    }
  } catch {
    console.warn('[parseResearchDirection] LLM 返回非 JSON，使用原始输入');
    parsed = { research_topic: topic, keywords: [], domain: undefined };
  }

  ctx.state.parsedDirection = parsed;
  ctx.state.logs.push(`解析研究方向: ${parsed.research_topic || topic}, 关键词: ${(parsed.keywords || []).join(', ')}`);

  return { output: parsed };
}
