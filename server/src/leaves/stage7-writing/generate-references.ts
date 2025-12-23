/**
 * 生成参考文献列表
 * 按学术格式生成完整的参考文献列表
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function generateReferences({ ctx }: ToolInput): Promise<ToolResult> {
  const records = (ctx.state as any).mergedRecords || [];
  
  const refs = records.map((r: any, idx: number) => {
    const authors = r.authors?.join(', ') || '';
    const year = r.year || 'n.d.';
    const title = r.title || '';
    const journal = r.journal || '';
    const doi = r.doi || 'N/A';
    return `${idx + 1}. ${authors} (${year}). ${title}. ${journal}. DOI: ${doi}`;
  });
  
  const content = refs.join('\n');
  
  const asset = {
    session_id: ctx.session.id,
    type: 'draft' as const,
    title: '参考文献列表',
    content,
    data: { referenceCount: refs.length },
    synced_to_project: false,
    synced_at: null,
    synced_project_id: ctx.projectId || ctx.session.project_id || null,
  };
  
  ctx.state.logs.push(`生成参考文献: ${refs.length} 条`);
  return { output: content, tempAssets: [asset] };
}
