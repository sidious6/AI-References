/**
 * 读取项目文档
 * 获取项目中已上传的文档内容片段，用于分析
 */
import type { ToolInput, ToolResult } from '../types.js';
import { documentRepository } from '../../lib/repository.js';
import fs from 'fs';
import path from 'path';

export async function readProjectDocuments({ ctx }: ToolInput): Promise<ToolResult> {
  const projectId = ctx.projectId || ctx.session.project_id;
  if (!projectId) return { output: [] };
  
  const docs = await documentRepository.findAll({ filters: { project_id: projectId } });
  
  const result = docs.slice(0, 5).map(doc => {
    let text: string | null = null;
    
    if (doc.extracted_text) {
      text = String(doc.extracted_text).slice(0, 1200);
    } else if (doc.file_path && fs.existsSync(path.resolve(doc.file_path))) {
      try {
        const raw = fs.readFileSync(path.resolve(doc.file_path), 'utf-8');
        text = raw.slice(0, 1200);
      } catch {
        text = null;
      }
    }
    
    return { id: doc.id, name: doc.name, type: doc.type, snippet: text };
  });
  
  ctx.state.projectDocuments = result;
  ctx.state.logs.push(`读取 ${result.length} 个项目文档`);
  return { output: result };
}
