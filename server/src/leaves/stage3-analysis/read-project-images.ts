/**
 * 读取项目图片
 * 获取项目中已上传的图片列表
 */
import type { ToolInput, ToolResult } from '../types.js';
import { documentRepository } from '../../lib/repository.js';

export async function readProjectImages({ ctx }: ToolInput): Promise<ToolResult> {
  const projectId = ctx.projectId || ctx.session.project_id;
  if (!projectId) return { output: [] };
  
  const docs = await documentRepository.findAll({ 
    filters: { project_id: projectId, type: 'image' } 
  });
  
  ctx.state.logs.push(`读取 ${docs.length} 个项目图片`);
  return { output: docs.map(d => ({ id: d.id, name: d.name })) };
}
