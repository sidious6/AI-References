/**
 * 记录已见文献ID
 * 将当前批次的文献ID记录到会话状态，用于后续去重
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function recordSeenIds({ ctx }: ToolInput): Promise<ToolResult> {
  const records = ctx.state.mergedRecords || [];
  
  for (const r of records) {
    const key = (r.doi || r.title || '').toLowerCase();
    if (key) ctx.state.seenIds.add(key);
  }
  
  ctx.state.logs.push(`记录已见文献: ${ctx.state.seenIds.size} 篇`);
  return { output: { seen: ctx.state.seenIds.size } };
}
