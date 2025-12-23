/**
 * 评估文献数量
 * 检查当前候选文献数量是否达到目标
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function evaluateCount({ ctx }: ToolInput): Promise<ToolResult> {
  const target = ctx.preferences.targetPaperCount || 50;
  const records = (ctx.state as any).mergedRecords || [];
  
  ctx.state.logs.push(`文献数量评估: ${records.length}/${target}`);
  return { output: { current: records.length, target } };
}
