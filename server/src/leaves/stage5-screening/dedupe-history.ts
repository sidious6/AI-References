/**
 * 历史去重
 * 过滤掉在历史会话中已经处理过的文献
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function dedupeHistory({ ctx }: ToolInput): Promise<ToolResult> {
  const merged = ctx.state.mergedRecords || [];
  const before = merged.length;
  
  const filtered = merged.filter((r: any) => {
    const key = (r.doi || r.title || '').toLowerCase();
    return key && !ctx.state.historyIds.has(key);
  });
  
  ctx.state.mergedRecords = filtered;
  
  const removed = before - filtered.length;
  if (removed > 0) {
    ctx.state.logs.push(`历史去重: 移除 ${removed} 篇`);
  }
  
  return { output: filtered.length };
}
