/**
 * ReCode 脚本执行引擎
 * 负责执行工作流脚本树，管理节点执行和事件发送
 * 支持断点恢复功能和阻塞式用户交互
 */
import type { ScriptTree, ScriptNode, ExecutionContext, EngineEvent, ToolResult } from './recode.types.js';
import { getTool, listTools, getToolDescription } from '../../leaves/index.js';
import { agentSessionRepository, tempAssetRepository } from '../../lib/repository.js';
import type { WorkflowState, WorkflowCheckpoint } from '../../types/database.js';
import { userResponseManager } from './user-response-manager.js';

const buildPath = (node: ScriptNode, parents: string[]) => [...parents, node.id];

// 记录已使用的工具
const usedTools = new Set<string>();

// 活跃工作流注册表：追踪正在运行的会话
const activeWorkflows = new Map<string, { startedAt: Date; lastActivity: Date }>();

// 检查工作流是否正在活跃运行
export function isWorkflowActive(sessionId: string): boolean {
  const workflow = activeWorkflows.get(sessionId);
  if (!workflow) return false;
  // 如果最后活动时间超过 30 秒，认为工作流已停止
  const now = Date.now();
  const lastActivity = workflow.lastActivity.getTime();
  return now - lastActivity < 30000;
}

// 注册活跃工作流
function registerActiveWorkflow(sessionId: string): void {
  activeWorkflows.set(sessionId, {
    startedAt: new Date(),
    lastActivity: new Date(),
  });
}

// 更新工作流活动时间
function updateWorkflowActivity(sessionId: string): void {
  const workflow = activeWorkflows.get(sessionId);
  if (workflow) {
    workflow.lastActivity = new Date();
  }
}

// 注销活跃工作流
function unregisterActiveWorkflow(sessionId: string): void {
  activeWorkflows.delete(sessionId);
}

// 当前工作流状态
let currentWorkflowState: WorkflowState = {
  stages: [],
  currentStage: null,
  updatedAt: new Date().toISOString(),
};

// 恢复模式标记
let isResumeMode = false;
let resumeFromStage: number | null = null;

// 工作流暂停标记（用于等待用户确认时完全停止执行）
let workflowPaused = false;
let pausedAtStage: number | null = null;

// 保存工作流状态到数据库
async function saveWorkflowState(sessionId: string): Promise<void> {
  try {
    currentWorkflowState.updatedAt = new Date().toISOString();
    await agentSessionRepository.update(sessionId, {
      workflow_state: currentWorkflowState as unknown as Record<string, unknown>,
    });
  } catch (err) {
    console.warn('[ReCode] 保存工作流状态失败:', err);
  }
}

// 保存 checkpoint 数据（暂停时使用）
async function savePauseCheckpoint(sessionId: string, ctx: ExecutionContext, currentStage: number, pauseReason: string): Promise<void> {
  try {
    const savedAssets = await tempAssetRepository.findAll({
      filters: { session_id: sessionId },
    });
    const tempAssetIds = savedAssets.map(a => a.id);
    
    const checkpoint: WorkflowCheckpoint = {
      lastCompletedStage: currentStage > 0 ? currentStage - 1 : 0,
      tempAssetIds,
      executionState: {
        seenIds: Array.from(ctx.state.seenIds),
        historyIds: Array.from(ctx.state.historyIds),
        projectExistingIds: Array.from(ctx.state.projectExistingIds),
        candidateLiteratureCount: ctx.state.candidateLiterature.length,
        queriesCount: ctx.state.queries.length,
      },
      savedAt: new Date().toISOString(),
      pauseReason,
    };
    
    currentWorkflowState.checkpoint = checkpoint;
    currentWorkflowState.isInterrupted = true;
    currentWorkflowState.interruptedAt = new Date().toISOString();
    await saveWorkflowState(sessionId);
    console.log(`[ReCode] 暂停 Checkpoint 已保存: 当前 Stage ${currentStage}, 暂停原因: ${pauseReason}`);
  } catch (err) {
    console.warn('[ReCode] 保存暂停 checkpoint 失败:', err);
  }
}

// 保存 checkpoint 数据（阶段完成时使用）
async function saveCheckpoint(sessionId: string, ctx: ExecutionContext, completedStage: number): Promise<void> {
  try {
    // 获取已保存的临时资产 ID
    const savedAssets = await tempAssetRepository.findAll({
      filters: { session_id: sessionId },
    });
    const tempAssetIds = savedAssets.map(a => a.id);
    
    const checkpoint: WorkflowCheckpoint = {
      lastCompletedStage: completedStage,
      tempAssetIds,
      executionState: {
        seenIds: Array.from(ctx.state.seenIds),
        historyIds: Array.from(ctx.state.historyIds),
        projectExistingIds: Array.from(ctx.state.projectExistingIds),
        candidateLiteratureCount: ctx.state.candidateLiterature.length,
        queriesCount: ctx.state.queries.length,
      },
      savedAt: new Date().toISOString(),
    };
    
    currentWorkflowState.checkpoint = checkpoint;
    await saveWorkflowState(sessionId);
    console.log(`[ReCode] Checkpoint 已保存: Stage ${completedStage}`);
  } catch (err) {
    console.warn('[ReCode] 保存 checkpoint 失败:', err);
  }
}

// 标记工作流被中断
async function markWorkflowInterrupted(sessionId: string): Promise<void> {
  try {
    currentWorkflowState.isInterrupted = true;
    currentWorkflowState.interruptedAt = new Date().toISOString();
    await saveWorkflowState(sessionId);
  } catch (err) {
    console.warn('[ReCode] 标记中断状态失败:', err);
  }
}

// 检查阶段是否已完成
function isStageCompleted(stage: number): boolean {
  const stageState = currentWorkflowState.stages.find(s => s.stage === stage);
  return stageState?.status === 'completed';
}

// 更新工作流阶段状态
function updateWorkflowStage(ev: EngineEvent, sessionId: string): void {
  // 确保 stages 数组存在
  if (!currentWorkflowState.stages) {
    currentWorkflowState.stages = [];
  }
  
  if (ev.type === 'node_started') {
    if (ev.stage) {
      // 阶段节点开始
      const existingStage = currentWorkflowState.stages.find(s => s.stage === ev.stage);
      if (!existingStage) {
        currentWorkflowState.stages.push({
          stage: ev.stage,
          title: ev.title || `Stage ${ev.stage}`,
          status: 'running',
          nodeId: ev.nodeId,
          steps: [],
        });
      } else {
        existingStage.status = 'running';
      }
      currentWorkflowState.currentStage = ev.stage;
      saveWorkflowState(sessionId);
    } else if (ev.nodeId && ev.title) {
      // 工具节点开始 - 添加到当前运行阶段的 steps
      const runningStage = currentWorkflowState.stages.find(s => s.status === 'running');
      if (runningStage) {
        const stepExists = runningStage.steps?.some(step => step.nodeId === ev.nodeId);
        if (!stepExists) {
          if (!runningStage.steps) {
            runningStage.steps = [];
          }
          runningStage.steps.push({
            nodeId: ev.nodeId,
            title: ev.title,
            status: 'running',
          });
          saveWorkflowState(sessionId);
        }
      }
    }
  } else if (ev.type === 'node_completed') {
    if (ev.stage) {
      // 阶段完成
      const stage = currentWorkflowState.stages.find(s => s.stage === ev.stage);
      if (stage) {
        stage.status = 'completed';
        stage.summary = ev.summary;
      }
      saveWorkflowState(sessionId);
    } else if (ev.nodeId) {
      // 工具节点完成
      for (const stage of currentWorkflowState.stages) {
        const step = stage.steps?.find(s => s.nodeId === ev.nodeId);
        if (step) {
          step.status = 'completed';
          step.summary = ev.summary;
          saveWorkflowState(sessionId);
          break;
        }
      }
    }
  } else if (ev.type === 'node_failed') {
    if (ev.stage) {
      // 阶段失败
      const stage = currentWorkflowState.stages.find(s => s.stage === ev.stage);
      if (stage) {
        stage.status = 'failed';
        stage.error = ev.error;
      }
      saveWorkflowState(sessionId);
    } else if (ev.nodeId) {
      // 工具节点失败
      for (const stage of currentWorkflowState.stages) {
        const step = stage.steps?.find(s => s.nodeId === ev.nodeId);
        if (step) {
          step.status = 'failed';
          step.error = ev.error;
          saveWorkflowState(sessionId);
          break;
        }
      }
    }
  }
}

// 检查是否应该跳过节点（恢复模式下）
function shouldSkipNode(node: ScriptNode): boolean {
  if (!isResumeMode || resumeFromStage === null) {
    return false;
  }
  
  // 如果节点有 stage 且小于恢复起点，跳过
  if (node.stage && node.stage < resumeFromStage) {
    return true;
  }
  
  return false;
}

async function* runNode(node: ScriptNode, ctx: ExecutionContext, parents: string[]): AsyncGenerator<EngineEvent> {
  // 如果工作流已暂停，不再执行任何节点
  if (workflowPaused) {
    return;
  }
  
  const path = buildPath(node, parents);
  const stageNum = node.stage;
  
  // 恢复模式下检查是否跳过
  if (shouldSkipNode(node)) {
    console.log(`[ReCode] 跳过已完成节点: ${node.title} (Stage ${stageNum})`);
    yield { 
      type: 'node_completed', 
      nodeId: node.id, 
      stage: stageNum, 
      title: node.title, 
      path,
      summary: '(已恢复)',
    };
    return;
  }
  
  console.log(`[ReCode] >>> 开始节点: ${node.title} (${node.kind}${stageNum ? `, Stage ${stageNum}` : ''})`);
  
  yield { 
    type: 'node_started', 
    nodeId: node.id, 
    stage: stageNum, 
    title: node.title, 
    path 
  };

  if (node.kind === 'tool' && node.toolName) {
    try {
      console.log(`[ReCode]   调用工具: ${node.toolName}`);
      usedTools.add(node.toolName);
      
      const tool = getTool(node.toolName);
      const result: ToolResult = await tool({ node, ctx });
      
      if (result?.tempAssets?.length) {
        for (const asset of result.tempAssets) {
          try {
            await tempAssetRepository.create(asset);
            console.log(`[ReCode] 临时资产已实时保存: ${asset.title || asset.type}`);
          } catch (err) {
            console.warn(`[ReCode] 保存临时资产失败:`, err);
          }
        }
        ctx.state.tempAssets.push(...result.tempAssets);
      }
      
      // 处理需要用户确认的情况 - 阻塞等待用户响应
      if (result?.output?.action === 'awaiting_confirmation') {
        const confirmationType = result.output.confirmationType;
        const currentStage = currentWorkflowState.currentStage || stageNum || 2;
        console.log(`[ReCode]   需要用户确认: ${confirmationType}`);
        
        // 保存待确认请求到工作流状态（用于页面刷新后恢复）
        currentWorkflowState.pendingConfirmation = {
          confirmationType,
          message: result.output.message || '请选择操作',
          options: result.output.options || [],
          timeout: result.output.timeout,
          candidates: result.output.candidates,
          recommendedProjectId: result.output.recommendedProjectId,
          createdAt: new Date().toISOString(),
        };
        await saveWorkflowState(ctx.session.id);
        
        // 发送确认请求事件给前端
        yield {
          type: 'awaiting_confirmation',
          nodeId: node.id,
          stage: currentStage,
          title: node.title,
          path,
          confirmationType,
          message: result.output.message,
          options: result.output.options,
          timeout: result.output.timeout,
          candidates: result.output.candidates,
          recommendedProjectId: result.output.recommendedProjectId,
        };
        
        // 阻塞等待用户响应
        console.log(`[ReCode]   等待用户响应...`);
        const userResponse = await userResponseManager.waitForResponse(
          ctx.session.id,
          confirmationType,
          result.output.timeout || 5 * 60 * 1000
        );
        
        console.log(`[ReCode]   用户选择: ${userResponse.selectedOption}`);
        
        // 用户已响应，清除中断标记和待确认请求
        currentWorkflowState.isInterrupted = false;
        currentWorkflowState.interruptedAt = undefined;
        currentWorkflowState.pendingConfirmation = undefined;
        await saveWorkflowState(ctx.session.id);
        
        // 将用户响应存入 ctx.state，供后续工具使用
        (ctx.state as any).userConfirmation = {
          confirmationType,
          selectedOption: userResponse.selectedOption,
          data: userResponse.data,
          timestamp: new Date().toISOString(),
        };
        
        // 处理用户选择
        if (confirmationType === 'select_or_create_project' || confirmationType === 'create_project') {
          const option = userResponse.selectedOption;
          
          if (option === 'cancel') {
            console.log(`[ReCode]   用户取消操作`);
            // 设置暂停标记，停止后续执行
            workflowPaused = true;
            
            yield {
              type: 'node_completed',
              nodeId: node.id,
              stage: stageNum,
              title: node.title,
              path,
              output: { action: 'cancelled' },
              summary: '用户取消',
            };
            
            yield {
              type: 'workflow_paused',
              nodeId: node.id,
              stage: stageNum,
              title: node.title,
              path,
              reason: 'user_cancelled',
            };
            return;
          }
          
          if (option === 'create') {
            // 用户选择创建新项目，标记待创建
            (ctx.state as any).pendingProjectAction = {
              action: 'create_new',
              reason: 'user_choice',
            };
            console.log(`[ReCode]   用户选择创建新项目`);
          } else if (option.startsWith('select_')) {
            // 用户选择现有项目
            const projectId = option.replace('select_', '');
            ctx.projectId = projectId;
            
            // 更新 session 的 project_id
            await agentSessionRepository.update(ctx.session.id, { project_id: projectId });
            ctx.session.project_id = projectId;
            
            console.log(`[ReCode]   用户选择项目: ${projectId}`);
          }
        }
        
        // 继续执行，生成完成事件
        yield {
          type: 'node_completed',
          nodeId: node.id,
          stage: stageNum,
          title: node.title,
          path,
          output: { action: 'user_confirmed', selection: userResponse.selectedOption },
          summary: `用户选择: ${userResponse.selectedOption}`,
        };
        return;
      }
      
      // 生成输出摘要
      const outputSummary = summarizeOutput(result?.output, node.toolName);
      console.log(`[ReCode]   工具完成: ${node.toolName} -> ${outputSummary}`);
      
      yield { 
        type: 'node_completed', 
        nodeId: node.id, 
        stage: stageNum, 
        title: node.title, 
        path, 
        output: result?.output,
        summary: outputSummary,
      };
      return;
    } catch (err: any) {
      console.error(`[ReCode]   工具失败: ${node.toolName} -> ${err.message}`);
      yield {
        type: 'node_failed',
        nodeId: node.id,
        stage: stageNum,
        title: node.title,
        path,
        error: err.message,
      };
      return;
    }
  }

  // 处理子节点
  for (const child of node.children) {
    // 每次执行子节点前检查暂停标记
    if (workflowPaused) {
      console.log(`[ReCode] 工作流已暂停，跳过子节点: ${child.title}`);
      return;
    }
    yield* runNode(child, ctx, path);
  }
  
  // 如果工作流已暂停，不输出完成事件
  if (workflowPaused) {
    return;
  }
  
  console.log(`[ReCode] <<< 完成节点: ${node.title}`);
  
  // 阶段完成时保存 checkpoint
  if (stageNum) {
    await saveCheckpoint(ctx.session.id, ctx, stageNum);
  }
  
  yield { 
    type: 'node_completed', 
    nodeId: node.id, 
    stage: stageNum, 
    title: node.title, 
    path 
  };
}

function summarizeOutput(output: unknown, toolName: string): string {
  if (output === undefined || output === null) return '无输出';
  
  if (Array.isArray(output)) {
    return `返回 ${output.length} 条记录`;
  }
  
  if (typeof output === 'number') {
    return `${output}`;
  }
  
  if (typeof output === 'string') {
    if (output.length > 100) {
      return output.slice(0, 100) + '...';
    }
    return output;
  }
  
  if (typeof output === 'object') {
    const keys = Object.keys(output);
    return `对象(${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''})`;
  }
  
  return String(output).slice(0, 50);
}

function printToolUsageSummary(): void {
  const allTools = listTools();
  const used = Array.from(usedTools);
  const unused = allTools.filter(t => !usedTools.has(t));
  
  console.log('\n[ReCode] ========== 叶子使用情况汇总 ==========');
  console.log(`[ReCode] 总计叶子: ${allTools.length} 个`);
  console.log(`[ReCode] 已使用: ${used.length} 个`);
  console.log(`[ReCode] 未使用: ${unused.length} 个`);
  
  console.log('\n[ReCode] 已使用的叶子:');
  used.forEach(t => {
    console.log(`[ReCode]   + ${t} - ${getToolDescription(t)}`);
  });
  
  if (unused.length > 0) {
    console.log('\n[ReCode] 未使用的叶子:');
    unused.forEach(t => {
      console.log(`[ReCode]   - ${t} - ${getToolDescription(t)}`);
    });
  }
  
  console.log('[ReCode] ==========================================\n');
}

// 检查工作流是否可恢复
export interface WorkflowResumeInfo {
  canResume: boolean;
  isActive: boolean;
  lastCompletedStage: number | null;
  lastCompletedStageTitle: string | null;
  interruptedAt: string | null;
  totalStages: number;
  completedStages: number;
  pendingConfirmation?: {
    confirmationType: string;
    message: string;
    options: { id: string; label: string; isDefault?: boolean }[];
    timeout?: number;
    candidates?: { id: string; name: string; score?: number }[];
    recommendedProjectId?: string;
  };
}

export async function checkWorkflowResumable(sessionId: string): Promise<WorkflowResumeInfo> {
  try {
    // 首先检查工作流是否正在活跃运行
    const isActive = isWorkflowActive(sessionId);
    
    const session = await agentSessionRepository.findById(sessionId);
    if (!session?.workflow_state) {
      return {
        canResume: false,
        isActive,
        lastCompletedStage: null,
        lastCompletedStageTitle: null,
        interruptedAt: null,
        totalStages: 0,
        completedStages: 0,
      };
    }
    
    const state = session.workflow_state as WorkflowState;
    const stages = state.stages || [];
    const completedStages = stages.filter(s => s.status === 'completed');
    const hasRunningOrFailed = stages.some(s => s.status === 'running' || s.status === 'failed');
    const hasCheckpoint = state.checkpoint && state.checkpoint.lastCompletedStage !== undefined;
    
    // 可恢复条件：
    // 1. 工作流不在活跃运行中（如果正在运行，不需要恢复）
    // 2. 且满足以下条件之一：
    //    a. 被标记为中断（包括等待用户确认的暂停）
    //    b. 或者有已完成的阶段且有未完成的阶段
    //    c. 或者有 checkpoint
    const canResume = !isActive && (
      state.isInterrupted || 
      (completedStages.length > 0 && hasRunningOrFailed) ||
      (hasCheckpoint && stages.length > 0)
    );
    
    // 获取最后完成的阶段
    let lastCompletedStage: number | null = null;
    let lastCompletedStageTitle: string | null = null;
    
    if (state.checkpoint?.lastCompletedStage !== undefined) {
      lastCompletedStage = state.checkpoint.lastCompletedStage;
      const stageInfo = stages.find(s => s.stage === lastCompletedStage);
      lastCompletedStageTitle = stageInfo?.title || null;
    } else if (completedStages.length > 0) {
      const lastCompleted = completedStages.reduce((max, s) => s.stage > max.stage ? s : max);
      lastCompletedStage = lastCompleted.stage;
      lastCompletedStageTitle = lastCompleted.title;
    }
    
    return {
      canResume,
      isActive,
      lastCompletedStage,
      lastCompletedStageTitle,
      interruptedAt: state.interruptedAt || null,
      totalStages: stages.length,
      completedStages: completedStages.length,
      pendingConfirmation: state.pendingConfirmation ? {
        confirmationType: state.pendingConfirmation.confirmationType,
        message: state.pendingConfirmation.message,
        options: state.pendingConfirmation.options,
        timeout: state.pendingConfirmation.timeout,
        candidates: state.pendingConfirmation.candidates,
        recommendedProjectId: state.pendingConfirmation.recommendedProjectId,
      } : undefined,
    };
  } catch (err) {
    console.error('[ReCode] 检查恢复状态失败:', err);
    return {
      canResume: false,
      isActive: false,
      lastCompletedStage: null,
      lastCompletedStageTitle: null,
      interruptedAt: null,
      totalStages: 0,
      completedStages: 0,
    };
  }
}

export { userResponseManager } from './user-response-manager.js';

export interface RunOptions {
  resumeMode?: boolean;
}

export async function* runScriptTree(tree: ScriptTree, ctx: ExecutionContext, options: RunOptions = {}): AsyncGenerator<EngineEvent> {
  // 注册活跃工作流
  registerActiveWorkflow(ctx.session.id);
  
  // 重置已使用工具记录
  usedTools.clear();
  
  // 重置暂停标记
  workflowPaused = false;
  pausedAtStage = null;
  
  // 初始化工作流状态
  currentWorkflowState = {
    stages: [],
    currentStage: null,
    updatedAt: new Date().toISOString(),
  };
  
  // 重置恢复模式标记
  isResumeMode = false;
  resumeFromStage = null;
  
  // 尝试从数据库恢复工作流状态
  try {
    const session = await agentSessionRepository.findById(ctx.session.id);
    if (session?.workflow_state) {
      const restored = session.workflow_state as WorkflowState;
      // 确保恢复的状态有正确的结构
      currentWorkflowState = {
        stages: restored.stages || [],
        currentStage: restored.currentStage ?? null,
        updatedAt: restored.updatedAt || new Date().toISOString(),
        checkpoint: restored.checkpoint,
        isInterrupted: restored.isInterrupted,
        interruptedAt: restored.interruptedAt,
      };
      
      // 如果是恢复模式且有 checkpoint
      if (options.resumeMode && restored.checkpoint?.lastCompletedStage) {
        isResumeMode = true;
        resumeFromStage = restored.checkpoint.lastCompletedStage + 1;
        console.log(`[ReCode] 恢复模式启用: 从 Stage ${resumeFromStage} 开始`);
        
        // 恢复执行状态
        if (restored.checkpoint.executionState) {
          const es = restored.checkpoint.executionState;
          ctx.state.seenIds = new Set(es.seenIds || []);
          ctx.state.historyIds = new Set(es.historyIds || []);
          ctx.state.projectExistingIds = new Set(es.projectExistingIds || []);
        }
        
        // 清除中断标记
        currentWorkflowState.isInterrupted = false;
        currentWorkflowState.interruptedAt = undefined;
      }
    }
  } catch (err) {
    console.warn('[ReCode] 恢复工作流状态失败:', err);
  }
  
  console.log('[ReCode] ========== 开始执行脚本树 ==========');
  console.log(`[ReCode] 研究主题: ${ctx.session.research_topic}`);
  console.log(`[ReCode] 项目ID: ${ctx.projectId || '未绑定'}`);
  console.log(`[ReCode] 用户ID: ctx.userId=${ctx.userId}, session.user_id=${ctx.session.user_id}`);
  console.log(`[ReCode] 恢复模式: ${isResumeMode ? `是 (从 Stage ${resumeFromStage} 开始)` : '否'}`);
  
  // 注册中断处理
  const handleInterrupt = async () => {
    console.log('[ReCode] 检测到中断信号，保存状态...');
    await markWorkflowInterrupted(ctx.session.id);
  };
  
  process.on('SIGINT', handleInterrupt);
  process.on('SIGTERM', handleInterrupt);
  
  try {
    for await (const ev of runNode(tree.root, ctx, [])) {
      // 更新工作流活动时间
      updateWorkflowActivity(ctx.session.id);
      // 更新工作流状态
      updateWorkflowStage(ev, ctx.session.id);
      yield ev;
    }
  } finally {
    // 清理中断处理器
    process.off('SIGINT', handleInterrupt);
    process.off('SIGTERM', handleInterrupt);
    // 注销活跃工作流
    unregisterActiveWorkflow(ctx.session.id);
  }
  
  // 生成最终输出
  const draft = ctx.state.tempAssets.find(a => a.type === 'draft');
  const framework = ctx.state.tempAssets.find(a => a.type === 'chapter_framework');
  const report = ctx.state.tempAssets.find(a => a.type === 'candidate_literature');
  
  // 汇总日志
  const logs = ctx.state.logs || [];
  const mergedRecords = (ctx.state as any).mergedRecords || [];
  
  // 如果工作流暂停，不生成最终输出
  if (workflowPaused) {
    console.log('[ReCode] ========== 工作流已暂停，等待用户确认 ==========');
    console.log(`[ReCode] 暂停位置: Stage ${pausedAtStage}`);
    return;
  }
  
  let content = '';
  
  if (draft?.content) {
    content = draft.content;
  } else if (framework?.content) {
    content = `## 研究框架\n\n${framework.content}`;
  }
  
  // 添加执行摘要
  const summary = [
    `## 执行摘要`,
    `- 研究主题: ${ctx.session.research_topic}`,
    `- 检索到文献: ${mergedRecords.length} 篇`,
    `- 生成临时资产: ${ctx.state.tempAssets.length} 个`,
  ];
  
  if (logs.length > 0) {
    summary.push(`\n### 执行日志`);
    logs.forEach(log => summary.push(`- ${log}`));
  }
  
  content = content || summary.join('\n');
  
  console.log('[ReCode] ========== 脚本树执行完成 ==========');
  console.log(`[ReCode] 临时资产: ${ctx.state.tempAssets.length} 个`);
  console.log(`[ReCode] 检索文献: ${mergedRecords.length} 篇`);
  
  // 打印叶子使用情况汇总
  printToolUsageSummary();
  
  yield { type: 'final_result', content, tempAssets: ctx.state.tempAssets };
}
