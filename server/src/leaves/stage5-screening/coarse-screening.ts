/**
 * 粗筛文献
 * 对候选文献进行初步筛选，区分有摘要和无摘要的文献
 * 策略：没有摘要的标记为待定；有摘要的标记为待精筛
 */
import type { ToolInput, ToolResult } from '../types.js';
import type { LiteratureRecord } from '../../services/deepreference/recode.types.js';

export async function coarseScreening({ ctx }: ToolInput): Promise<ToolResult> {
  const records: LiteratureRecord[] = ctx.state.mergedRecords || [];
  
  if (records.length === 0) {
    console.log('[粗筛] 无候选文献，跳过');
    return { output: { screened: 0, skipped: true } };
  }
  
  // 使用不可变模式更新记录，避免直接修改共享对象
  let withAbstractCount = 0;
  let withoutAbstractCount = 0;
  
  const updatedRecords = records.map(r => {
    if (r.abstract && r.abstract.length >= 50) {
      withAbstractCount++;
      return { ...r, status: 'to_fine_screen' as const, screening_reason: '有摘要，待精筛' };
    } else {
      withoutAbstractCount++;
      return { ...r, status: 'pending' as const, screening_reason: '缺少摘要，无法进行内容筛选，标记为待定' };
    }
  });
  
  console.log(`[粗筛] 文献总数: ${records.length}, 有摘要: ${withAbstractCount}, 无摘要: ${withoutAbstractCount}`);
  console.log(`[粗筛] ${withoutAbstractCount} 篇无摘要文献标记为待定`);
  console.log(`[粗筛] ${withAbstractCount} 篇有摘要文献标记为待精筛`);
  
  ctx.state.mergedRecords = updatedRecords;
  
  console.log(`[粗筛] 结果: 待精筛 ${withAbstractCount}, 待定 ${withoutAbstractCount}`);
  
  return { 
    output: { 
      total: records.length,
      withAbstract: withAbstractCount,
      pendingNoAbstract: withoutAbstractCount,
      toFineScreen: withAbstractCount,
    } 
  };
}
