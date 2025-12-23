/**
 * 记录检索式版本
 * 将当前使用的检索式保存为临时资产，便于追溯和优化
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function recordQueryVersion({ ctx }: ToolInput): Promise<ToolResult> {
  const queries = (ctx.state as any).queries || [];
  
  const asset = {
    session_id: ctx.session.id,
    type: 'search_query' as const,
    title: '检索式版本',
    content: JSON.stringify(queries, null, 2),
    data: { queryCount: queries.length },
    synced_to_project: false,
    synced_at: null,
    synced_project_id: null,
  };
  
  ctx.state.logs.push(`记录检索式: ${queries.length} 条`);
  return { output: asset.content, tempAssets: [asset] };
}
