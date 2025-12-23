/**
 * 聚合检索结果
 * 合并来自多个数据源的检索结果并去重
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function aggregateResults({ ctx }: ToolInput): Promise<ToolResult> {
  const merged: any[] = [];
  const dedupe = new Set<string>();
  const list = (ctx.state as any).latestRecords || [];
  
  console.log(`[aggregateResults] 输入 ${list.length} 条记录`);
  
  for (const item of list) {
    const key = (item.doi || item.title || '').toLowerCase();
    if (!key || dedupe.has(key)) continue;
    dedupe.add(key);
    merged.push(item);
  }
  
  (ctx.state as any).mergedRecords = merged;
  
  console.log(`[aggregateResults] 去重后 ${merged.length} 条`);
  ctx.state.logs.push(`文献聚合: ${list.length} -> ${merged.length} 条 (去重)`);
  
  return { output: merged };
}
