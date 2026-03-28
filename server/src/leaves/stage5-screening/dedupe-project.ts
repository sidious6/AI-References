/**
 * 项目去重
 * 过滤掉项目中已存在的文献，避免重复入库
 */
import type { ToolInput, ToolResult } from '../types.js';
import { literatureRepository } from '../../lib/repository.js';

export async function dedupeProject({ ctx }: ToolInput): Promise<ToolResult> {
  const projectId = ctx.projectId || ctx.session.project_id;
  if (!projectId) return { output: 0 };
  
  const existing = await literatureRepository.findAll({ filters: { project_id: projectId } });
  const existingKeys = new Set(
    existing.map(l => (l.doi || l.title || '').toLowerCase()).filter(Boolean)
  );
  
  const merged = ctx.state.mergedRecords || [];
  const before = merged.length;
  
  const filtered = merged.filter((r: any) => 
    !existingKeys.has((r.doi || r.title || '').toLowerCase())
  );
  
  ctx.state.mergedRecords = filtered;
  ctx.state.projectExistingIds = existingKeys;
  
  const removed = before - filtered.length;
  if (removed > 0) {
    ctx.state.logs.push(`项目去重: 移除 ${removed} 篇已存在文献`);
  }
  
  return { output: filtered.length };
}
