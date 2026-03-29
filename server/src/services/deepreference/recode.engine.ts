/**
 * ReCode 脚本执行引擎
 * 负责执行工作流脚本树，管理节点执行和事件发送
 * 支持断点恢复功能和阻塞式用户交互
 * 
 * 架构: WorkflowExecution 类按 sessionId 隔离状态，
 * 支持多会话并发执行互不干扰。
 */
import type { ScriptTree, ScriptNode, ExecutionContext, EngineEvent, ToolResult, AwaitingConfirmationOutput } from './recode.types.js';
import { getTool, listTools, getToolDescription } from '../../leaves/index.js';
import { agentSessionRepository, tempAssetRepository } from '../../lib/repository.js';
import type { WorkflowState, WorkflowCheckpoint } from '../../types/database.js';
import { userResponseManager } from './user-response-manager.js';

const buildPath = (node: ScriptNode, parents: string[]) => [...parents, node.id];

// 活跃工作流注册表：追踪正在运行的会话（全局唯一，按 sessionId 隔离）
const activeWorkflows = new Map<string, { startedAt: Date; lastActivity: Date }>();

export function isWorkflowActive(sessionId: string): boolean {
  const workflow = activeWorkflows.get(sessionId);
  if (!workflow) return false;
  const now = Date.now();
  const lastActivity = workflow.lastActivity.getTime();
  return now - lastActivity < 30000;
}

function summarizeOutput(output: unknown, _toolName: string): string {
  if (output === undefined || output === null) return '无输出';
  if (Array.isArray(output)) return `返回 ${output.length} 条记录`;
  if (typeof output === 'number') return `${output}`;
  if (typeof output === 'string') {
    return output.length > 100 ? output.slice(0, 100) + '...' : output;
  }
  if (typeof output === 'object') {
    const keys = Object.keys(output);
    return `对象(${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''})`;
  }
  return String(output).slice(0, 50);
}

/**
 * 工作流执行实例
 * 每次 runScriptTree 调用创建一个实例，按 sessionId 隔离全部运行时状态。
 * 解决了原先模块级全局变量导致并发会话状态互相覆盖的问题。
 */
class WorkflowExecution {
  readonly sessionId: string;
  workflowState: WorkflowState;
  isResumeMode = false;
  resumeFromStage: number | null = null;
  paused = false;
  pausedAtStage: number | null = null;
  usedTools = new Set<string>();
  failedStages = new Set<number>();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.workflowState = {
      stages: [],
      currentStage: null,
      updatedAt: new Date().toISOString(),
    };
  }

  // --- 状态持久化 ---

  // 注意: updateWorkflowStage 中多处调用 saveWorkflowState 未 await，
  // 这是故意的 fire-and-forget 行为，避免阻塞主流程。
  async saveWorkflowState(): Promise<void> {
    try {
      this.workflowState.updatedAt = new Date().toISOString();
      await agentSessionRepository.update(this.sessionId, {
        workflow_state: this.workflowState as unknown as Record<string, unknown>,
      });
    } catch (err) {
      console.warn('[ReCode] 保存工作流状态失败:', err);
    }
  }

  async saveCheckpoint(ctx: ExecutionContext, completedStage: number): Promise<void> {
    try {
      const savedAssets = await tempAssetRepository.findAll({
        filters: { session_id: this.sessionId },
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
          // 序列化关键业务数据，恢复后续阶段必需
          mergedRecords: ctx.state.mergedRecords as Record<string, unknown>[],
          queries: ctx.state.queries,
          candidateLiterature: ctx.state.candidateLiterature as Record<string, unknown>[],
          parsedDirection: ctx.state.parsedDirection,
          webSearchAnalysis: ctx.state.webSearchAnalysis,
        },
        savedAt: new Date().toISOString(),
      };

      this.workflowState.checkpoint = checkpoint;
      await this.saveWorkflowState();
      console.log(`[ReCode] Checkpoint 已保存: Stage ${completedStage}`);
    } catch (err) {
      console.warn('[ReCode] 保存 checkpoint 失败:', err);
    }
  }

  async markInterrupted(): Promise<void> {
    try {
      this.workflowState.isInterrupted = true;
      this.workflowState.interruptedAt = new Date().toISOString();
      await this.saveWorkflowState();
    } catch (err) {
      console.warn('[ReCode] 标记中断状态失败:', err);
    }
  }

  // --- 阶段判断 ---

  isStageCompleted(stage: number): boolean {
    const stageState = this.workflowState.stages.find(s => s.stage === stage);
    return stageState?.status === 'completed';
  }

  shouldSkipNode(node: ScriptNode): boolean {
    if (!this.isResumeMode || this.resumeFromStage === null) return false;
    if (node.stage && node.stage < this.resumeFromStage) return true;
    return false;
  }

  // --- 工作流状态更新 ---

  updateWorkflowStage(ev: EngineEvent): void {
    if (!this.workflowState.stages) {
      this.workflowState.stages = [];
    }

    // root 节点不参与前端阶段进度展示
    if ('nodeId' in ev && ev.nodeId === 'root') return;

    if (ev.type === 'node_started') {
      if (ev.stage) {
        const existingStage = this.workflowState.stages.find(s => s.stage === ev.stage);
        if (!existingStage) {
          this.workflowState.stages.push({
            stage: ev.stage,
            title: ev.title || `Stage ${ev.stage}`,
            status: 'running',
            nodeId: ev.nodeId,
            steps: [],
          });
        } else {
          existingStage.status = 'running';
        }
        this.workflowState.currentStage = ev.stage;
        this.saveWorkflowState(); // fire-and-forget
      } else if (ev.nodeId && ev.title) {
        const runningStage = this.workflowState.stages.find(s => s.status === 'running');
        if (runningStage) {
          const stepExists = runningStage.steps?.some(step => step.nodeId === ev.nodeId);
          if (!stepExists) {
            if (!runningStage.steps) runningStage.steps = [];
            runningStage.steps.push({
              nodeId: ev.nodeId,
              title: ev.title,
              status: 'running',
            });
            this.saveWorkflowState(); // fire-and-forget
          }
        }
      }
    } else if (ev.type === 'node_completed') {
      if (ev.stage) {
        const stage = this.workflowState.stages.find(s => s.stage === ev.stage);
        if (stage) {
          stage.status = 'completed';
          stage.summary = ev.summary;
        }
        this.saveWorkflowState(); // fire-and-forget
      } else if (ev.nodeId) {
        for (const stage of this.workflowState.stages) {
          const step = stage.steps?.find(s => s.nodeId === ev.nodeId);
          if (step) {
            step.status = 'completed';
            step.summary = ev.summary;
            this.saveWorkflowState(); // fire-and-forget
            break;
          }
        }
      }
    } else if (ev.type === 'node_failed') {
      if (ev.stage) {
        const stage = this.workflowState.stages.find(s => s.stage === ev.stage);
        if (stage) {
          stage.status = 'failed';
          stage.error = ev.error;
        }
        this.saveWorkflowState(); // fire-and-forget
      } else if (ev.nodeId) {
        for (const stage of this.workflowState.stages) {
          const step = stage.steps?.find(s => s.nodeId === ev.nodeId);
          if (step) {
            step.status = 'failed';
            step.error = ev.error;
            this.saveWorkflowState(); // fire-and-forget
            break;
          }
        }
      }
    }
  }

  // --- 节点执行 ---

  // 阶段依赖关系: 后续阶段依赖前序阶段的数据
  // Stage 3(框架) -> Stage 4(检索) -> Stage 5(筛选) -> Stage 6(入库) -> Stage 7(撰写)
  private static readonly STAGE_DEPS: Record<number, number[]> = {
    4: [3],    // 检索依赖框架
    5: [4],    // 筛选依赖检索
    6: [5],    // 入库依赖筛选
    7: [6],    // 撰写依赖入库
  };

  private hasDependencyFailed(stage: number): boolean {
    const deps = WorkflowExecution.STAGE_DEPS[stage];
    if (!deps) return false;
    return deps.some(dep => this.failedStages.has(dep));
  }

  async *runNode(node: ScriptNode, ctx: ExecutionContext, parents: string[]): AsyncGenerator<EngineEvent> {
    if (this.paused) return;

    const path = buildPath(node, parents);
    const stageNum = node.stage;

    // 检查依赖阶段是否失败，如果是则跳过当前阶段
    if (stageNum && this.hasDependencyFailed(stageNum)) {
      const failedDeps = (WorkflowExecution.STAGE_DEPS[stageNum] || [])
        .filter(d => this.failedStages.has(d));
      console.log(`[ReCode] 跳过 Stage ${stageNum}: 依赖阶段 ${failedDeps.join(',')} 已失败`);
      this.failedStages.add(stageNum);
      yield {
        type: 'node_failed',
        nodeId: node.id,
        stage: stageNum,
        title: node.title,
        path,
        error: `依赖阶段 (Stage ${failedDeps.join(',')}) 执行失败，跳过当前阶段`,
      };
      return;
    }

    // 恢复模式下跳过已完成阶段
    if (this.shouldSkipNode(node)) {
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
      path,
    };

    if (node.kind === 'tool' && node.toolName) {
      try {
        console.log(`[ReCode]   调用工具: ${node.toolName}`);
        this.usedTools.add(node.toolName);

        const tool = getTool(node.toolName);
        const result: ToolResult = await tool({ node, ctx });

        if (result?.tempAssets?.length) {
          for (const asset of result.tempAssets) {
            try {
              // Deduplicate: if an asset with same session_id + type + title exists, update it instead of creating a new one
              const sessionId = (asset as Record<string, unknown>).session_id as string;
              const assetType = (asset as Record<string, unknown>).type as string;
              const assetTitle = (asset as Record<string, unknown>).title as string;
              let deduped = false;

              if (sessionId && assetType) {
                const existing = await tempAssetRepository.findAll({
                  filters: { session_id: sessionId, type: assetType },
                });
                const match = existing.find(e =>
                  (!assetTitle && !e.title) || (assetTitle && e.title === assetTitle)
                );
                if (match) {
                  await tempAssetRepository.update(match.id, asset as Record<string, unknown>);
                  console.log(`[ReCode] 临时资产已去重更新: ${assetTitle || assetType}`);
                  deduped = true;
                }
              }

              if (!deduped) {
                await tempAssetRepository.create(asset);
                console.log(`[ReCode] 临时资产已实时保存: ${assetTitle || assetType}`);
              }
            } catch (err) {
              console.warn(`[ReCode] 保存临时资产失败:`, err);
            }
          }
          ctx.state.tempAssets.push(...result.tempAssets);
        }

        // 处理工具发给用户的消息
        if (result?.messagesToUser?.length) {
          yield {
            type: 'tool_message',
            nodeId: node.id,
            stage: stageNum,
            title: node.title,
            path,
            messages: result.messagesToUser,
          };
        }

        // 处理需要用户确认的情况 - 阻塞等待用户响应
        const output = result?.output as Record<string, unknown> | undefined;
        if (output?.action === 'awaiting_confirmation') {
          yield* this.handleAwaitingConfirmation(output as unknown as AwaitingConfirmationOutput, node, ctx, path, stageNum);
          return;
        }

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
    let childFailed = false;
    for (const child of node.children) {
      if (this.paused) {
        console.log(`[ReCode] 工作流已暂停，跳过子节点: ${child.title}`);
        return;
      }
      for await (const ev of this.runNode(child, ctx, path)) {
        yield ev;
        // 任何后代节点的 node_failed 事件都标记当前阶段失败
        // (不仅限于直接子节点是 tool 的情况，strategy 内嵌套的 tool 失败也需要传播)
        if (ev.type === 'node_failed') {
          childFailed = true;
        }
      }
    }

    if (this.paused) return;

    // 如果有子工具失败且当前是 stage 节点，标记阶段失败
    if (childFailed && stageNum) {
      console.log(`[ReCode] <<< 阶段失败: ${node.title} (有子工具执行失败)`);
      this.failedStages.add(stageNum);
      yield {
        type: 'node_failed',
        nodeId: node.id,
        stage: stageNum,
        title: node.title,
        path,
        error: '阶段内有关键工具执行失败',
      };
      return;
    }

    console.log(`[ReCode] <<< 完成节点: ${node.title}`);

    // 阶段完成时保存 checkpoint
    if (stageNum) {
      await this.saveCheckpoint(ctx, stageNum);
    }

    yield {
      type: 'node_completed',
      nodeId: node.id,
      stage: stageNum,
      title: node.title,
      path,
    };
  }

  // 处理用户确认交互（从 runNode 中抽取，保持逻辑清晰）
  private async *handleAwaitingConfirmation(
    output: AwaitingConfirmationOutput,
    node: ScriptNode,
    ctx: ExecutionContext,
    path: string[],
    stageNum: number | undefined,
  ): AsyncGenerator<EngineEvent> {
    const confirmationType = output.confirmationType;
    const currentStage = this.workflowState.currentStage || stageNum || 2;
    console.log(`[ReCode]   需要用户确认: ${confirmationType}`);

    // 保存待确认请求到工作流状态
    this.workflowState.pendingConfirmation = {
      confirmationType,
      message: output.message || '请选择操作',
      options: output.options || [],
      timeout: output.timeout,
      candidates: output.candidates,
      recommendedProjectId: output.recommendedProjectId,
      createdAt: new Date().toISOString(),
    };
    await this.saveWorkflowState();

    // 发送确认请求事件给前端
    yield {
      type: 'awaiting_confirmation',
      nodeId: node.id,
      stage: currentStage,
      title: node.title,
      path,
      confirmationType,
      message: output.message,
      options: output.options,
      timeout: output.timeout,
      candidates: output.candidates,
      recommendedProjectId: output.recommendedProjectId,
    };

    // 阻塞等待用户响应
    console.log(`[ReCode]   等待用户响应...`);
    const userResponse = await userResponseManager.waitForResponse(
      ctx.session.id,
      confirmationType,
      output.timeout || 5 * 60 * 1000,
    );

    console.log(`[ReCode]   用户选择: ${userResponse.selectedOption}`);

    // 清除中断标记和待确认请求
    this.workflowState.isInterrupted = false;
    this.workflowState.interruptedAt = undefined;
    this.workflowState.pendingConfirmation = undefined;
    await this.saveWorkflowState();

    // 将用户响应存入 ctx.state
    ctx.state.userConfirmation = {
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
        this.paused = true;
        this.pausedAtStage = stageNum ?? null;

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
        ctx.state.pendingProjectAction = {
          action: 'create_new',
          reason: 'user_choice',
        };
        console.log(`[ReCode]   用户选择创建新项目`);
      } else if (option.startsWith('select_')) {
        const projectId = option.replace('select_', '');
        ctx.projectId = projectId;
        await agentSessionRepository.update(ctx.session.id, { project_id: projectId });
        ctx.session.project_id = projectId;
        console.log(`[ReCode]   用户选择项目: ${projectId}`);
      }
    }

    yield {
      type: 'node_completed',
      nodeId: node.id,
      stage: stageNum,
      title: node.title,
      path,
      output: { action: 'user_confirmed', selection: userResponse.selectedOption },
      summary: `用户选择: ${userResponse.selectedOption}`,
    };
  }

  // --- 工具使用统计 ---

  printToolUsageSummary(): void {
    const allTools = listTools();
    const used = Array.from(this.usedTools);
    const unused = allTools.filter(t => !this.usedTools.has(t));

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

  // --- 主执行入口 ---

  async *run(tree: ScriptTree, ctx: ExecutionContext, options: RunOptions = {}): AsyncGenerator<EngineEvent> {
    // 注册活跃工作流
    activeWorkflows.set(this.sessionId, {
      startedAt: new Date(),
      lastActivity: new Date(),
    });

    // 尝试从数据库恢复工作流状态
    try {
      const session = await agentSessionRepository.findById(this.sessionId);
      if (session?.workflow_state) {
        const restored = session.workflow_state as WorkflowState;
        this.workflowState = {
          stages: restored.stages || [],
          currentStage: restored.currentStage ?? null,
          updatedAt: restored.updatedAt || new Date().toISOString(),
          checkpoint: restored.checkpoint,
          isInterrupted: restored.isInterrupted,
          interruptedAt: restored.interruptedAt,
        };

        if (options.resumeMode && restored.checkpoint?.lastCompletedStage) {
          this.isResumeMode = true;
          this.resumeFromStage = restored.checkpoint.lastCompletedStage + 1;
          console.log(`[ReCode] 恢复模式启用: 从 Stage ${this.resumeFromStage} 开始`);

          if (restored.checkpoint.executionState) {
            const es = restored.checkpoint.executionState;
            ctx.state.seenIds = new Set(es.seenIds || []);
            ctx.state.historyIds = new Set(es.historyIds || []);
            ctx.state.projectExistingIds = new Set(es.projectExistingIds || []);
            // 还原关键业务数据
            if (es.mergedRecords) {
              ctx.state.mergedRecords = es.mergedRecords as any;
            }
            if (es.queries) {
              ctx.state.queries = es.queries;
            }
            if (es.candidateLiterature) {
              ctx.state.candidateLiterature = es.candidateLiterature as any;
            }
            if (es.parsedDirection !== undefined) {
              ctx.state.parsedDirection = es.parsedDirection;
            }
            if (es.webSearchAnalysis !== undefined) {
              ctx.state.webSearchAnalysis = es.webSearchAnalysis;
            }
          }

          this.workflowState.isInterrupted = false;
          this.workflowState.interruptedAt = undefined;
        }
      }
    } catch (err) {
      console.warn('[ReCode] 恢复工作流状态失败:', err);
    }

    console.log('[ReCode] ========== 开始执行脚本树 ==========');
    console.log(`[ReCode] 研究主题: ${ctx.session.research_topic}`);
    console.log(`[ReCode] 项目ID: ${ctx.projectId || '未绑定'}`);
    console.log(`[ReCode] 用户ID: ctx.userId=${ctx.userId}, session.user_id=${ctx.session.user_id}`);
    console.log(`[ReCode] 恢复模式: ${this.isResumeMode ? `是 (从 Stage ${this.resumeFromStage} 开始)` : '否'}`);

    // SIGINT/SIGTERM 中断处理: 闭包引用 this，确保中断时操作正确的 execution 实例
    const handleInterrupt = async () => {
      console.log('[ReCode] 检测到中断信号，保存状态...');
      await this.markInterrupted();
    };

    process.on('SIGINT', handleInterrupt);
    process.on('SIGTERM', handleInterrupt);

    try {
      for await (const ev of this.runNode(tree.root, ctx, [])) {
        // 更新活动时间
        const workflow = activeWorkflows.get(this.sessionId);
        if (workflow) workflow.lastActivity = new Date();
        // 更新工作流阶段状态
        this.updateWorkflowStage(ev);
        yield ev;
      }
    } finally {
      process.off('SIGINT', handleInterrupt);
      process.off('SIGTERM', handleInterrupt);
      activeWorkflows.delete(this.sessionId);
    }

    // 生成最终输出
    const draft = ctx.state.tempAssets.find(a => a.type === 'draft');
    const framework = ctx.state.tempAssets.find(a => a.type === 'chapter_framework');

    const logs = ctx.state.logs || [];
    const mergedRecords = ctx.state.mergedRecords || [];

    if (this.paused) {
      console.log('[ReCode] ========== 工作流已暂停，等待用户确认 ==========');
      console.log(`[ReCode] 暂停位置: Stage ${this.pausedAtStage}`);
      return;
    }

    let content = '';

    if (draft?.content) {
      content = draft.content;
    } else if (framework?.content) {
      content = `## 研究框架\n\n${framework.content}`;
    }

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

    this.printToolUsageSummary();

    yield { type: 'final_result', content, tempAssets: ctx.state.tempAssets };
  }
}

// ============================================================
// 对外导出接口（签名完全不变，上下游零改动）
// ============================================================

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

    const canResume = !isActive && (
      state.isInterrupted ||
      (completedStages.length > 0 && hasRunningOrFailed) ||
      (hasCheckpoint && stages.length > 0)
    );

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

/**
 * 执行脚本树（对外接口不变）
 * 内部创建独立的 WorkflowExecution 实例，按 sessionId 隔离状态。
 */
export async function* runScriptTree(tree: ScriptTree, ctx: ExecutionContext, options: RunOptions = {}): AsyncGenerator<EngineEvent> {
  const execution = new WorkflowExecution(ctx.session.id);
  yield* execution.run(tree, ctx, options);
}
