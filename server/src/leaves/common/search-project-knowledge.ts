/**
 * 搜索项目知识库
 * 在项目的文献和文档中搜索与研究主题相关的内容
 */
import type { ToolInput, ToolResult } from '../types.js';
import { literatureRepository, documentRepository } from '../../lib/repository.js';

export async function searchProjectKnowledge({ ctx }: ToolInput): Promise<ToolResult> {
  const projectId = ctx.projectId || ctx.session.project_id;
  if (!projectId) return { output: [] };
  
  const term = (ctx.session.research_topic || '').toLowerCase();
  const literature = await literatureRepository.findAll({ filters: { project_id: projectId } });
  const docs = await documentRepository.findAll({ filters: { project_id: projectId } });
  
  const matches = [
    ...literature.filter(l => l.title.toLowerCase().includes(term)),
    ...docs.filter(d => d.name.toLowerCase().includes(term)),
  ];
  
  ctx.state.logs.push(`项目知识搜索: 找到 ${matches.length} 条`);
  return { output: matches };
}
