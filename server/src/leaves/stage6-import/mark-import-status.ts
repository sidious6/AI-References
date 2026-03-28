/**
 * 标记入库状态
 * 尊重 Stage 5 筛选结果，仅对未标记的记录按目标数量补充 approved
 */
import type { ToolInput, ToolResult } from '../types.js';
import type { LiteratureRecord } from '../../services/deepreference/recode.types.js';

export async function markImportStatus({ ctx }: ToolInput): Promise<ToolResult> {
  const records: LiteratureRecord[] = ctx.state.mergedRecords || [];
  const targetCount = ctx.preferences.targetPaperCount || 50;

  console.log(`[markImportStatus] 处理 ${records.length} 条记录, 目标 ${targetCount} 篇`);

  // 统计已有筛选结果
  const alreadyApproved = records.filter(r => r.status === 'approved');
  const alreadyRejected = records.filter(r => r.status === 'rejected');
  const unmarked = records.filter(r => !r.status || r.status === 'pending' || r.status === 'to_fine_screen');

  console.log(`[markImportStatus] 已 approved: ${alreadyApproved.length}, rejected: ${alreadyRejected.length}, 未标记: ${unmarked.length}`);

  // 计算还需补充多少篇
  const remaining = Math.max(0, targetCount - alreadyApproved.length);

  const marked = records.map(r => {
    // 保留已有的 approved / rejected 决策
    if (r.status === 'approved' || r.status === 'rejected') {
      return r;
    }
    // 对未标记记录: 按需补充 approved，超出部分标 pending
    if (remaining > 0 && unmarked.indexOf(r) < remaining) {
      return { ...r, status: 'approved' as const };
    }
    return { ...r, status: 'pending' as const };
  });

  ctx.state.mergedRecords = marked;

  const approvedCount = marked.filter(r => r.status === 'approved').length;
  const rejectedCount = marked.filter(r => r.status === 'rejected').length;
  const pendingCount = marked.filter(r => r.status === 'pending').length;

  console.log(`[markImportStatus] 最终: approved=${approvedCount}, rejected=${rejectedCount}, pending=${pendingCount}`);
  ctx.state.logs.push(`入库标记: ${approvedCount} 篇通过, ${rejectedCount} 篇拒绝, ${pendingCount} 篇待定`);

  return { output: { approved: approvedCount, rejected: rejectedCount, pending: pendingCount } };
}
