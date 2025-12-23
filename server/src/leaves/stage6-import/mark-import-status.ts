/**
 * 标记入库状态
 * 根据目标数量为文献标记 approved/pending 状态
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function markImportStatus({ ctx }: ToolInput): Promise<ToolResult> {
  const records = (ctx.state as any).mergedRecords || [];
  const targetCount = ctx.preferences.targetPaperCount || 50;
  
  console.log(`[markImportStatus] 标记 ${records.length} 条记录, 目标 ${targetCount} 篇`);
  
  const marked = records.map((r: any, idx: number) => ({ 
    ...r, 
    status: idx < targetCount ? 'approved' : 'pending' 
  }));
  
  (ctx.state as any).mergedRecords = marked;
  
  const approvedCount = marked.filter((r: any) => r.status === 'approved').length;
  console.log(`[markImportStatus] 标记完成: ${approvedCount} 篇 approved`);
  ctx.state.logs.push(`入库标记: ${approvedCount} 篇通过, ${marked.length - approvedCount} 篇待定`);
  
  return { output: marked.length };
}
