/**
 * 粗筛文献
 * 对候选文献进行初步筛选，区分有摘要和无摘要的文献
 * 策略：没有摘要的标记为待定；有摘要的标记为待精筛
 */
import type { ToolInput, ToolResult } from '../types.js';

interface LiteratureRecord {
  id: string;
  title: string;
  authors?: string[];
  year?: number;
  abstract?: string;
  keywords?: string[];
  source?: string;
  status?: string;
  screening_reason?: string;
}

export async function coarseScreening({ ctx }: ToolInput): Promise<ToolResult> {
  const records: LiteratureRecord[] = (ctx.state as any).mergedRecords || [];
  
  if (records.length === 0) {
    console.log('[粗筛] 无候选文献，跳过');
    return { output: { screened: 0, skipped: true } };
  }
  
  // 分离有摘要和无摘要的文献
  const withAbstract = records.filter(r => r.abstract && r.abstract.length >= 50);
  const withoutAbstract = records.filter(r => !r.abstract || r.abstract.length < 50);
  
  console.log(`[粗筛] 文献总数: ${records.length}, 有摘要: ${withAbstract.length}, 无摘要: ${withoutAbstract.length}`);
  
  // 无摘要的统一标记为待定
  for (const record of withoutAbstract) {
    record.status = 'pending';
    record.screening_reason = '缺少摘要，无法进行内容筛选，标记为待定';
  }
  console.log(`[粗筛] ${withoutAbstract.length} 篇无摘要文献标记为待定`);
  
  // 有摘要的标记为待精筛
  for (const record of withAbstract) {
    record.status = 'to_fine_screen';
    record.screening_reason = '有摘要，待精筛';
  }
  console.log(`[粗筛] ${withAbstract.length} 篇有摘要文献标记为待精筛`);
  
  (ctx.state as any).mergedRecords = records;
  
  console.log(`[粗筛] 结果: 待精筛 ${withAbstract.length}, 待定 ${withoutAbstract.length}`);
  
  return { 
    output: { 
      total: records.length,
      withAbstract: withAbstract.length,
      pendingNoAbstract: withoutAbstract.length,
      toFineScreen: withAbstract.length,
    } 
  };
}
