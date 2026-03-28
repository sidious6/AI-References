/**
 * 写入项目
 * 将筛选通过的文献批量写入项目的文献库
 */
import type { ToolInput, ToolResult } from '../types.js';
import type { LiteratureRecord } from '../../services/deepreference/recode.types.js';
import { literatureService } from '../../services/literature.service.js';

export async function writeToProject({ ctx }: ToolInput): Promise<ToolResult> {
  const projectId = ctx.projectId || ctx.session.project_id;
  
  if (!projectId) {
    console.log('[writeToProject] 跳过: 未绑定项目');
    ctx.state.logs.push('文献入库跳过: 未绑定项目');
    return { output: 0 };
  }
  
  const records: LiteratureRecord[] = ctx.state.mergedRecords || [];
  console.log(`[writeToProject] 准备入库 ${records.length} 条记录到项目 ${projectId}`);
  
  if (records.length === 0) {
    ctx.state.logs.push('文献入库: 无候选文献');
    return { output: 0 };
  }
  
  const approved = records.filter(r => r.status !== 'rejected');
  console.log(`[writeToProject] 筛选后 ${approved.length} 条待入库`);
  
  const items = approved.map(r => ({
    project_id: projectId,
    chapter_id: null,
    title: r.title || '未命名文献',
    authors: Array.isArray(r.authors) ? r.authors : [],
    year: r.year || null,
    journal: r.journal || r.source_title || null,
    volume: r.volume || null,
    issue: r.issue || null,
    pages: r.pages || null,
    doi: r.doi || null,
    abstract: r.abstract || null,
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    source: 'ai' as const,
    source_database: r.source_database || null,
    status: r.status === 'approved' ? 'approved' as const : 'pending' as const,
    ai_summary: r.screening_reason || null,
    ai_relevance_score: r.ai_relevance_score || null,
    ai_inclusion_reason: r.screening_reason || r.ai_inclusion_reason || null,
    file_path: null,
    file_url: null,
    bibtex: r.bibtex || null,
    raw_data: r,
  }));
  
  try {
    if (items.length > 0) {
      const created = await literatureService.createMany(items);
      console.log(`[writeToProject] 成功入库 ${created.length} 条文献`);
      ctx.state.logs.push(`文献入库成功: ${created.length} 篇`);
      return { output: created.length };
    }
  } catch (err: any) {
    console.error('[writeToProject] 入库失败:', err.message);
    ctx.state.logs.push(`文献入库失败: ${err.message}`);
    return { output: 0 };
  }
  
  return { output: 0 };
}
