/**
 * 触发补充检索
 * 当通过筛选的文献数量不足时，提示用户进行补充检索
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function triggerSupplement({ ctx }: ToolInput): Promise<ToolResult> {
  const target = ctx.preferences.targetPaperCount || 50;
  const records = ctx.state.mergedRecords || [];
  const approvedCount = records.filter(r => r.status === 'approved').length;
  
  if (approvedCount < target) {
    ctx.state.logs.push(`文献不足: approved ${approvedCount}/${target}，建议补充`);
    return { 
      output: 'need_supplement', 
      messagesToUser: [`当前通过筛选 ${approvedCount}/${target}，建议补充检索。`] 
    };
  }
  
  ctx.state.logs.push(`文献充足: approved ${approvedCount}/${target}`);
  return { output: 'enough' };
}
