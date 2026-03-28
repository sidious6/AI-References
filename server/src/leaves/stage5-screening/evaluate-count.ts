/**
 * 评估文献数量
 * 检查当前通过筛选的文献数量是否达到目标
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function evaluateCount({ ctx }: ToolInput): Promise<ToolResult> {
  const target = ctx.preferences.targetPaperCount || 50;
  const records = ctx.state.mergedRecords || [];
  const approvedCount = records.filter(r => r.status === 'approved').length;
  const totalCount = records.length;
  
  ctx.state.logs.push(`文献数量评估: approved ${approvedCount}/${target} (总计 ${totalCount})`);
  return { output: { approved: approvedCount, total: totalCount, target } };
}
