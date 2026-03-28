/**
 * 创建新项目
 * 根据用户在 askProjectSelection 中的选择执行
 */
import type { ToolInput, ToolResult } from '../types.js';
import { agentSessionRepository } from '../../lib/repository.js';

export async function createNewProject({ ctx }: ToolInput): Promise<ToolResult> {
  // 如果已有项目绑定，跳过
  if (ctx.projectId || ctx.session.project_id) {
    const pid = ctx.projectId || ctx.session.project_id;
    console.log(`[创建项目] 跳过: 已绑定项目 ${pid}`);
    ctx.projectId = pid!;
    return { output: { skipped: true, projectId: pid, reason: 'already_bound' } };
  }
  
  // 检查用户确认结果
  const userConfirmation = ctx.state.userConfirmation;
  const pendingAction = ctx.state.pendingProjectAction;
  
  // 如果用户选择创建新项目
  if (pendingAction?.action === 'create_new' || userConfirmation?.selectedOption === 'create') {
    console.log(`[创建项目] 用户选择创建新项目`);
    
    const { projectService } = await import('../../services/project.service.js');
    const project = await projectService.create({
      name: (ctx.session.research_topic || '未命名项目').slice(0, 100),
      description: ctx.session.research_goal || null,
      domain: null,
      status: 'researching',
      tags: [],
      literature_count: 0,
      document_count: 0,
      user_id: ctx.userId || ctx.session.user_id,
    });
    
    // 更新 session 和 ctx
    await agentSessionRepository.update(ctx.session.id, { project_id: project.id });
    ctx.projectId = project.id;
    ctx.session.project_id = project.id;
    
    console.log(`[创建项目] 新项目已创建: ${project.id}`);
    ctx.state.logs.push(`创建新项目: ${project.name}`);
    
    return { 
      output: { 
        created: true, 
        projectId: project.id, 
        projectName: project.name,
      } 
    };
  }
  
  // 重新检查数据库中的会话状态（可能在 askProjectSelection 中已更新）
  const session = await agentSessionRepository.findById(ctx.session.id);
  if (session?.project_id) {
    ctx.projectId = session.project_id;
    ctx.session.project_id = session.project_id;
    console.log(`[创建项目] 项目已在之前绑定: ${session.project_id}`);
    return { output: { skipped: true, projectId: session.project_id, reason: 'already_selected' } };
  }
  
  console.warn('[创建项目] 警告: 未预期的执行路径');
  return { 
    output: { 
      skipped: true, 
      reason: 'unexpected_state',
    } 
  };
}
