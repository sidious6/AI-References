/**
 * 插入引用标记
 * 在草稿中添加文献引用标记
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function insertCitations({ ctx }: ToolInput): Promise<ToolResult> {
  const draft = ctx.state.tempAssets.find(a => a.title === '章节草稿' || a.type === 'draft');
  const records = (ctx.state as any).mergedRecords || [];
  
  const citations = records.slice(0, 30).map((r: any, idx: number) => 
    `[${idx + 1}] ${r.title}`
  );
  
  const content = `${draft?.content || ''}\n\n参考文献标记：\n${citations.join('\n')}`;
  
  const asset = {
    session_id: ctx.session.id,
    type: 'draft' as const,
    title: '章节草稿含引用',
    content,
    data: { citationCount: citations.length },
    synced_to_project: false,
    synced_at: null,
    synced_project_id: ctx.projectId || ctx.session.project_id || null,
  };
  
  ctx.state.logs.push(`插入引用: ${citations.length} 条`);
  return { output: content, tempAssets: [asset] };
}
