/**
 * 生成入库报告
 * 汇总文献入库情况，生成统计报告
 * 保存完整的文献数据供同步使用
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function generateImportReport({ ctx }: ToolInput): Promise<ToolResult> {
  const records = (ctx.state as any).mergedRecords || [];
  const approved = records.filter((r: any) => r.status === 'approved');
  const rejected = records.filter((r: any) => r.status === 'rejected');
  const pending = records.filter((r: any) => r.status === 'pending' || !r.status);
  
  const summary = [
    `## 文献入库报告`,
    ``,
    `- 总计检索: ${records.length} 篇`,
    `- 已通过: ${approved.length} 篇`,
    `- 待定: ${pending.length} 篇`,
    `- 已拒绝: ${rejected.length} 篇`,
  ].join('\n');
  
  console.log(`[generateImportReport] ${summary.replace(/\n/g, ' ')}`);
  ctx.state.logs.push(`入库报告: ${approved.length}/${records.length} 篇通过`);
  
  // 保存完整的文献数据供同步使用
  const papers = records.map((r: any) => ({
    title: r.title || '',
    authors: r.authors || [],
    year: r.year || null,
    journal: r.journal || r.source_title || '',
    abstract: r.abstract || '',
    keywords: r.keywords || [],
    doi: r.doi || null,
    source_database: r.source_database || '',
    ai_relevance_score: r.ai_relevance_score || null,
    ai_inclusion_reason: r.ai_inclusion_reason || r.reason || null,
    status: r.status || 'pending',
    scopus_id: r.scopus_id || null,
    scopus_link: r.scopus_link || null,
    wos_uid: r.uid || null,
    wos_link: r.wos_link || null,
    search_query: r.search_query || null,
  }));
  
  const asset = {
    session_id: ctx.session.id,
    type: 'candidate_literature' as const,
    title: '入库报告',
    content: summary,
    data: { 
      approved: approved.length, 
      pending: pending.length,
      rejected: rejected.length,
      total: records.length,
      papers, // 完整的文献数据
    },
    synced_to_project: false,
    synced_at: null,
    synced_project_id: ctx.projectId || ctx.session.project_id || null,
  };
  
  return { output: summary, tempAssets: [asset] };
}
