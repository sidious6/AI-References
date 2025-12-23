/**
 * 触发补充检索
 * 当文献数量不足时，提示用户进行补充检索
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function triggerSupplement({ ctx }: ToolInput): Promise<ToolResult> {
  const target = ctx.preferences.targetPaperCount || 50;
  const records = (ctx.state as any).mergedRecords || [];
  
  if (records.length < target) {
    ctx.state.logs.push(`文献不足: ${records.length}/${target}，建议补充`);
    return { 
      output: 'need_supplement', 
      messagesToUser: [`当前 ${records.length}/${target}，建议补充检索。`] 
    };
  }
  
  ctx.state.logs.push(`文献充足: ${records.length}/${target}`);
  return { output: 'enough' };
}
