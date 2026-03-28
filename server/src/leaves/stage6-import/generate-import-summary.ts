/**
 * 生成入库摘要
 * 为每篇文献生成通过/未通过的决策和原因，并将决策写回 mergedRecords
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';
import type { LiteratureRecord } from '../../services/deepreference/recode.types.js';

export async function generateImportSummary({ ctx }: ToolInput): Promise<ToolResult> {
  const records: LiteratureRecord[] = ctx.state.mergedRecords || [];

  // 安全截断: 按条目数量限制而非字符截断
  const safeRecords = records.slice(0, 60).map(r => ({
    title: r.title,
    authors: r.authors?.slice(0, 3),
    year: r.year,
    abstract: r.abstract?.slice(0, 200),
    status: r.status,
  }));
  
  const messages: ChatMessage[] = [
    { role: 'system', content: '你是学术助手，请为每篇文献给出通过/未通过的原因，简短中文。输出 JSON 数组，字段 title, decision(approved/rejected), reason。' },
    { role: 'user', content: JSON.stringify(safeRecords) },
  ];
  
  const res = await callLLM(messages);

  // 解析 LLM 决策并写回 mergedRecords
  try {
    const jsonMatch = res.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const decisions: { title: string; decision: string; reason: string }[] = JSON.parse(jsonMatch[0]);
      const decisionMap = new Map(decisions.map(d => [d.title, d]));

      let updated = 0;
      ctx.state.mergedRecords = records.map(r => {
        const d = decisionMap.get(r.title);
        if (d) {
          updated++;
          const status = d.decision === 'approved' ? 'approved' as const
            : d.decision === 'rejected' ? 'rejected' as const
            : r.status;
          return { ...r, status, screening_reason: d.reason };
        }
        return r;
      });

      console.log(`[generateImportSummary] 更新 ${updated}/${records.length} 条记录的决策`);
      ctx.state.logs.push(`入库摘要: 更新 ${updated} 条决策`);
      return { output: { updated, total: records.length } };
    }
  } catch {
    console.warn('[generateImportSummary] LLM 返回非 JSON，决策未写回');
  }

  ctx.state.logs.push('入库摘要: LLM 未返回有效结果');
  return { output: res.content };
}
