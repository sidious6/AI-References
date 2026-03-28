/**
 * 插入引用标记
 * 在草稿中将 [?] 占位符替换为 [N] 编号引用，并附加参考文献列表
 * 
 * 局限性说明: LLM 生成草稿时输出 [?] 占位符，此处按出现顺序分配编号。
 * 编号与参考文献列表的对应关系依赖于 LLM 按文献重要性/出现顺序引用的假设。
 * 如需精确匹配，需在 write-section-draft 阶段提供编号文献列表让 LLM 直接输出 [N]。
 */
import type { ToolInput, ToolResult } from '../types.js';
import type { LiteratureRecord } from '../../services/deepreference/recode.types.js';

export async function insertCitations({ ctx }: ToolInput): Promise<ToolResult> {
  const draft = ctx.state.tempAssets.find(a => a.title === '章节草稿')
    || [...ctx.state.tempAssets].reverse().find(a => a.type === 'draft');
  const records: LiteratureRecord[] = (ctx.state.mergedRecords || [])
    .filter(r => r.status !== 'rejected');
  
  const maxCitations = Math.min(records.length, 30);
  const citations = records.slice(0, maxCitations).map((r, idx) => 
    `[${idx + 1}] ${r.title}`
  );

  let body = draft?.content || '';
  
  // 替换正文中的 [?] 占位符为递增编号 [N]
  // 超过可用文献数量的占位符保留为 [?]
  let citationIndex = 0;
  body = body.replace(/\[\?]/g, () => {
    citationIndex++;
    if (citationIndex <= maxCitations) {
      return `[${citationIndex}]`;
    }
    return '[?]';
  });

  const replacedCount = Math.min(citationIndex, maxCitations);
  const content = `${body}\n\n参考文献：\n${citations.join('\n')}`;
  
  const asset = {
    session_id: ctx.session.id,
    type: 'draft' as const,
    title: '章节草稿含引用',
    content,
    data: { citationCount: citations.length, replacedMarkers: replacedCount, unreplacedMarkers: Math.max(0, citationIndex - maxCitations) },
    synced_to_project: false,
    synced_at: null,
    synced_project_id: ctx.projectId || ctx.session.project_id || null,
  };
  
  ctx.state.logs.push(`插入引用: ${citations.length} 条, 替换 ${replacedCount} 个标记` + (citationIndex > maxCitations ? `, ${citationIndex - maxCitations} 个未替换` : ''));
  return { output: content, tempAssets: [asset] };
}
