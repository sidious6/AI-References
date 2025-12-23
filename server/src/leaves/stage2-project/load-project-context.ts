/**
 * 加载项目上下文
 * 获取项目的基本信息、文献数量和文档数量
 */
import type { ToolInput, ToolResult } from '../types.js';
import { projectService } from '../../services/project.service.js';
import { literatureService } from '../../services/literature.service.js';
import { documentRepository } from '../../lib/repository.js';

export async function loadProjectContext({ ctx }: ToolInput): Promise<ToolResult> {
  const projectId = ctx.projectId || ctx.session.project_id;
  if (!projectId) return { output: {} };
  
  const project = await projectService.getById(projectId, ctx.userId || undefined);
  const literature = await literatureService.list({ project_id: projectId, limit: 50, offset: 0 });
  const documents = await documentRepository.findAll({ filters: { project_id: projectId } });
  
  const summary = {
    project,
    literatureCount: literature.total,
    documentCount: documents.length,
  };
  
  ctx.state.logs.push(`加载项目上下文: ${project?.name || projectId}`);
  return { output: summary };
}
