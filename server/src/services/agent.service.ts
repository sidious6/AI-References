import { agentSessionRepository, agentMessageRepository, tempAssetRepository, literatureRepository, chapterRepository } from '../lib/repository.js';
import { llmService } from './llm.service.js';
import { buildDefaultScriptTree } from './deepreference/recode.scriptTemplates.js';
import { runScriptTree, checkWorkflowResumable, userResponseManager, type WorkflowResumeInfo } from './deepreference/recode.engine.js';
import type { ExecutionContext } from './deepreference/recode.types.js';
import type { 
  AgentSession, CreateAgentSession, UpdateAgentSession,
  AgentMessage, CreateAgentMessage,
  TempAsset, CreateTempAsset,
  WorkflowState
} from '../types/database.js';
import type { LLMProvider, ChatMessage } from '../types/llm.js';

export interface SessionListOptions {
  userId?: string;
  projectId?: string;
  status?: AgentSession['status'];
  limit?: number;
  offset?: number;
}

export interface SessionWithMessages extends AgentSession {
  messages: AgentMessage[];
  temp_assets?: TempAsset[];
}

export interface ChatOptions {
  sessionId: string;
  content: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
}

export interface StreamChatOptions extends ChatOptions {
  onChunk?: (chunk: string) => void;
  onComplete?: (fullResponse: string, tokensUsed?: number) => void;
  onError?: (error: Error) => void;
}

class AgentService {
  // Session CRUD
  async listSessions(options: SessionListOptions = {}): Promise<{ data: AgentSession[]; total: number }> {
    const filters: Record<string, unknown> = {};
    
    if (options.userId) {
      filters.user_id = options.userId;
    }
    
    if (options.projectId) {
      filters.project_id = options.projectId;
    }
    
    if (options.status) {
      filters.status = options.status;
    }
    
    const sessions = await agentSessionRepository.findAll({
      filters,
      orderBy: { column: 'updated_at', ascending: false },
      limit: options.limit,
      offset: options.offset,
    });
    
    const total = await agentSessionRepository.count(filters);
    
    return { data: sessions, total };
  }

  async getSession(id: string, userId?: string): Promise<SessionWithMessages | null> {
    const session = await agentSessionRepository.findById(id);
    if (!session) return null;
    
    // 验证用户权限
    if (userId && session.user_id && session.user_id !== userId) {
      return null;
    }
    
    const messages = await agentMessageRepository.findAll({
      filters: { session_id: id },
      orderBy: { column: 'created_at', ascending: true },
    });
    
    const tempAssets = await tempAssetRepository.findAll({
      filters: { session_id: id },
      orderBy: { column: 'created_at', ascending: false },
    });
    
    return { ...session, messages, temp_assets: tempAssets };
  }

  async createSession(data: CreateAgentSession): Promise<AgentSession> {
    const session = await agentSessionRepository.create({
      ...data,
      message_count: 0,
    });
    
    // 如果有研究主题，自动生成标题
    if (data.research_topic && !data.title) {
      const title = data.research_topic.slice(0, 50) + (data.research_topic.length > 50 ? '...' : '');
      await agentSessionRepository.update(session.id, { title });
      session.title = title;
    }
    
    return session;
  }

  async updateSession(id: string, data: UpdateAgentSession, userId?: string): Promise<AgentSession | null> {
    const session = await agentSessionRepository.findById(id);
    if (!session) return null;
    
    if (userId && session.user_id && session.user_id !== userId) {
      return null;
    }
    
    return agentSessionRepository.update(id, data);
  }

  async deleteSession(id: string, userId?: string): Promise<boolean> {
    const session = await agentSessionRepository.findById(id);
    if (!session) return false;
    
    if (userId && session.user_id && session.user_id !== userId) {
      return false;
    }
    
    // 删除关联的消息和临时资产
    const messages = await agentMessageRepository.findAll({ filters: { session_id: id } });
    for (const msg of messages) {
      await agentMessageRepository.delete(msg.id);
    }
    
    const assets = await tempAssetRepository.findAll({ filters: { session_id: id } });
    for (const asset of assets) {
      await tempAssetRepository.delete(asset.id);
    }
    
    return agentSessionRepository.delete(id);
  }

  // Message operations
  async addMessage(data: CreateAgentMessage): Promise<AgentMessage> {
    return agentMessageRepository.create(data);
  }

  async getMessages(sessionId: string): Promise<AgentMessage[]> {
    return agentMessageRepository.findAll({
      filters: { session_id: sessionId },
      orderBy: { column: 'created_at', ascending: true },
    });
  }

  // Chat functionality
  async chat(options: ChatOptions): Promise<{ message: AgentMessage; response: string }> {
    const { sessionId, content, provider = 'ark', model, temperature, maxTokens } = options;
    
    // 获取会话
    const session = await agentSessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    // 保存用户消息
    await this.addMessage({
      session_id: sessionId,
      role: 'user',
      content,
      tool_calls: null,
      tool_call_id: null,
      metadata: {},
      tokens_used: null,
    });
    
    // 获取历史消息构建上下文
    const historyMessages = await this.getMessages(sessionId);
    const chatMessages: ChatMessage[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(session),
      },
      ...historyMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
    ];
    
    // 调用 LLM
    const response = await llmService.chat(provider, {
      model,
      messages: chatMessages,
      temperature,
      maxTokens,
    });
    
    // 保存助手回复
    const assistantMessage = await this.addMessage({
      session_id: sessionId,
      role: 'assistant',
      content: response.content,
      tool_calls: null,
      tool_call_id: null,
      metadata: {
        provider,
        model: response.model,
      },
      tokens_used: response.usage?.totalTokens || null,
    });
    
    // 更新会话标题（如果是第一条消息）
    if (session.message_count === 0 && !session.title) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await agentSessionRepository.update(sessionId, { title });
    }
    
    return { message: assistantMessage, response: response.content };
  }

  // Stream chat
  async *chatStream(options: StreamChatOptions): AsyncGenerator<{ type: 'chunk' | 'done' | 'status'; content: string; tokensUsed?: number }> {
    const { sessionId, content, provider = 'ark', model, temperature, maxTokens, userId } = options;
    
    const session = await agentSessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // 如果会话缺少研究主题，默认用本次输入填充
    if (!session.research_topic) {
      await agentSessionRepository.update(sessionId, { research_topic: content });
      session.research_topic = content;
    }
    
    // 保存用户消息
    await this.addMessage({
      session_id: sessionId,
      role: 'user',
      content,
      tool_calls: null,
      tool_call_id: null,
      metadata: {},
      tokens_used: null,
    });

    // 自动模式走 ReCode 工作流
    if (session.mode === 'agent') {
      console.info('[AgentService] Start ReCode workflow', { sessionId });
      const execCtx: ExecutionContext = {
        session,
        userId,
        projectId: session.project_id,
        mode: session.mode,
        preferences: {
          targetPaperCount: 50,
          provider,
          model: model || session.model,
        },
        state: {
          seenIds: new Set(),
          historyIds: new Set(),
          projectExistingIds: new Set(),
          candidateLiterature: [],
          queries: [],
          logs: [],
          tempAssets: [],
        },
      };
      const tree = buildDefaultScriptTree(session);

      for await (const ev of runScriptTree(tree, execCtx)) {
        if (ev.type === 'final_result') {
          // 临时资产已在执行过程中实时保存，这里跳过重复创建
          await this.addMessage({
            session_id: sessionId,
            role: 'assistant',
            content: ev.content,
            tool_calls: null,
            tool_call_id: null,
            metadata: { provider: provider || session.model, model: model || session.model },
            tokens_used: null,
          });
          yield { type: 'chunk', content: ev.content };
          yield { type: 'done', content: ev.content };
        } else {
          yield { type: 'status', content: JSON.stringify(ev) };
        }
      }
      return;
    }
    
    // Human-in-loop 保留原 LLM 流式
    const historyMessages = await this.getMessages(sessionId);
    const chatMessages: ChatMessage[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(session),
      },
      ...historyMessages.slice(0, -1).map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content,
      },
    ];
    
    let fullResponse = '';
    try {
      for await (const chunk of llmService.chatStream(provider, {
        model,
        messages: chatMessages,
        temperature,
        maxTokens,
      })) {
        if (chunk.content) {
          fullResponse += chunk.content;
          yield { type: 'chunk', content: chunk.content };
        }
      }
    } catch (llmError) {
      console.error('[AgentService] LLM error:', llmError);
      throw llmError;
    }
    
    await this.addMessage({
      session_id: sessionId,
      role: 'assistant',
      content: fullResponse,
      tool_calls: null,
      tool_call_id: null,
      metadata: {
        provider,
        model,
      },
      tokens_used: null,
    });
    
    if (session.message_count === 0 && !session.title) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await agentSessionRepository.update(sessionId, { title });
    }
    
    yield { type: 'done', content: fullResponse };
  }

  // Temp assets operations
  async addTempAsset(data: CreateTempAsset): Promise<TempAsset> {
    return tempAssetRepository.create(data);
  }

  async getTempAssets(sessionId: string, type?: TempAsset['type']): Promise<TempAsset[]> {
    const filters: Record<string, unknown> = { session_id: sessionId };
    if (type) {
      filters.type = type;
    }
    
    return tempAssetRepository.findAll({
      filters,
      orderBy: { column: 'created_at', ascending: false },
    });
  }

  async updateTempAsset(id: string, data: Partial<TempAsset>): Promise<TempAsset | null> {
    return tempAssetRepository.update(id, data);
  }

  async deleteTempAsset(id: string): Promise<boolean> {
    return tempAssetRepository.delete(id);
  }

  async syncTempAssetToProject(assetId: string, projectId: string): Promise<TempAsset | null> {
    const asset = await tempAssetRepository.findById(assetId);
    if (!asset) return null;
    
    try {
      // 根据资产类型执行不同的同步逻辑
      if (asset.type === 'chapter_framework') {
        await this.syncChapterFramework(asset, projectId);
      } else if (asset.type === 'candidate_literature') {
        await this.syncCandidateLiterature(asset, projectId);
      } else if (asset.type === 'search_query') {
        // 检索式只标记同步，不需要额外处理
        console.log(`[同步] 检索式已标记同步: ${asset.title}`);
      }
      
      // 标记为已同步
      return tempAssetRepository.update(assetId, {
        synced_to_project: true,
        synced_at: new Date().toISOString(),
        synced_project_id: projectId,
      });
    } catch (error) {
      console.error(`[同步] 同步资产失败: ${assetId}`, error);
      return null;
    }
  }
  
  // 同步章节框架到项目
  private async syncChapterFramework(asset: TempAsset, projectId: string): Promise<void> {
    const content = asset.content || '';
    const lines = content.split('\n').filter(l => l.trim());
    
    // 解析 markdown 格式的章节框架
    let sortOrder = 0;
    const chapterMap = new Map<number, string>(); // depth -> parentId
    
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) continue;
      
      const depth = match[1].length - 1; // # = depth 0, ## = depth 1
      const title = match[2].trim();
      
      // 获取父级 ID
      let parentId: string | null = null;
      if (depth > 0) {
        parentId = chapterMap.get(depth - 1) || null;
      }
      
      // 创建章节
      const chapter = await chapterRepository.create({
        project_id: projectId,
        parent_id: parentId,
        title,
        description: null,
        sort_order: sortOrder++,
        depth,
      });
      
      // 记录当前层级的 ID
      chapterMap.set(depth, chapter.id);
    }
    
    console.log(`[同步] 章节框架同步完成: ${sortOrder} 个章节`);
  }
  
  // 同步候选文献到项目
  private async syncCandidateLiterature(asset: TempAsset, projectId: string): Promise<void> {
    const data = asset.data as { 
      papers?: Array<{
        title: string;
        authors?: string[];
        year?: number;
        journal?: string;
        abstract?: string;
        keywords?: string[];
        doi?: string;
        source_database?: string;
        ai_relevance_score?: number;
        ai_inclusion_reason?: string;
        status?: string;
        scopus_id?: string;
        scopus_link?: string;
        wos_uid?: string;
        wos_link?: string;
        search_query?: string;
      }>;
      search_query_id?: string;
    };
    
    if (!data.papers || !Array.isArray(data.papers)) {
      console.log('[同步] 候选文献数据格式错误');
      return;
    }
    
    let count = 0;
    for (const paper of data.papers) {
      try {
        // 构建 DOI 链接
        const doiLink = paper.doi ? `https://doi.org/${paper.doi}` : null;
        
        await literatureRepository.create({
          project_id: projectId,
          chapter_id: null,
          search_query_id: data.search_query_id || null,
          title: paper.title,
          authors: paper.authors || [],
          year: paper.year || null,
          journal: paper.journal || null,
          volume: null,
          issue: null,
          pages: null,
          doi: paper.doi || null,
          abstract: paper.abstract || null,
          keywords: paper.keywords || [],
          source: 'ai',
          source_database: paper.source_database || null,
          status: (paper.status as 'approved' | 'rejected' | 'pending') || 'pending',
          ai_summary: null,
          ai_relevance_score: paper.ai_relevance_score || null,
          ai_inclusion_reason: paper.ai_inclusion_reason || null,
          file_path: null,
          file_url: doiLink || paper.scopus_link || paper.wos_link || null,
          bibtex: null,
          raw_data: paper as Record<string, unknown>,
        });
        count++;
      } catch (err) {
        console.error(`[同步] 文献入库失败: ${paper.title}`, err);
      }
    }
    
    console.log(`[同步] 候选文献同步完成: ${count} 篇`);
  }
  
  // 更新工作流状态
  async updateWorkflowState(sessionId: string, state: WorkflowState): Promise<AgentSession | null> {
    return agentSessionRepository.update(sessionId, {
      workflow_state: state as unknown as Record<string, unknown>,
    });
  }
  
  // 获取工作流状态
  async getWorkflowState(sessionId: string): Promise<WorkflowState | null> {
    const session = await agentSessionRepository.findById(sessionId);
    return session?.workflow_state || null;
  }
  
  // 确认项目选择（用于阻塞式交互）
  async confirmProjectSelection(
    sessionId: string, 
    userId: string,
    data: { confirmationType: string; selectedOption: string; recommendedProjectId?: string }
  ): Promise<{ projectId?: string; action: string }> {
    const { confirmationType, selectedOption } = data;
    
    // 检查是否有等待中的请求
    if (userResponseManager.hasPendingRequest(sessionId)) {
      // 通知 userResponseManager，让阻塞的工作流继续执行
      userResponseManager.submitResponse(sessionId, {
        selectedOption,
        data: { recommendedProjectId: data.recommendedProjectId },
      });
      
      // 返回初步结果，实际的项目创建/选择会在工作流中处理
      if (selectedOption === 'create') {
        return { action: 'pending_create' };
      } else if (selectedOption === 'cancel') {
        return { action: 'cancelled' };
      } else if (selectedOption.startsWith('select_')) {
        const projectId = selectedOption.replace('select_', '');
        return { projectId, action: 'pending_select' };
      }
      
      return { action: 'submitted' };
    }
    
    // 如果没有等待中的请求，使用旧的逻辑（兼容性）
    if (selectedOption === 'create') {
      const session = await agentSessionRepository.findById(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      const { projectService } = await import('./project.service.js');
      const project = await projectService.create({
        name: (session.research_topic || '未命名项目').slice(0, 100),
        description: session.research_goal || null,
        domain: null,
        status: 'researching',
        tags: [],
        literature_count: 0,
        document_count: 0,
        user_id: userId,
      });
      
      await agentSessionRepository.update(sessionId, { project_id: project.id });
      
      console.log(`[项目确认] 用户选择创建新项目: ${project.id}`);
      return { projectId: project.id, action: 'created' };
      
    } else if (selectedOption === 'cancel') {
      console.log(`[项目确认] 用户取消操作`);
      return { action: 'cancelled' };
      
    } else if (selectedOption.startsWith('select_')) {
      const projectId = selectedOption.replace('select_', '');
      await agentSessionRepository.update(sessionId, { project_id: projectId });
      
      console.log(`[项目确认] 用户选择现有项目: ${projectId}`);
      return { projectId, action: 'selected' };
    }
    
    throw new Error('Invalid selection option');
  }
  
  // 检查工作流是否可恢复
  async checkWorkflowResumable(sessionId: string): Promise<WorkflowResumeInfo> {
    return checkWorkflowResumable(sessionId);
  }
  
  // 恢复工作流执行
  async *resumeWorkflow(options: StreamChatOptions): AsyncGenerator<{ type: 'chunk' | 'done' | 'status'; content: string; tokensUsed?: number }> {
    const { sessionId, provider = 'ark', model, userId } = options;
    
    const session = await agentSessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    // 检查是否可恢复
    const resumeInfo = await checkWorkflowResumable(sessionId);
    if (!resumeInfo.canResume) {
      throw new Error('工作流无法恢复，没有可用的断点');
    }
    
    console.info('[AgentService] 恢复 ReCode 工作流', { 
      sessionId, 
      fromStage: resumeInfo.lastCompletedStage ? resumeInfo.lastCompletedStage + 1 : 1 
    });
    
    // 添加系统消息说明恢复
    await this.addMessage({
      session_id: sessionId,
      role: 'system',
      content: `工作流恢复执行，从阶段 ${resumeInfo.lastCompletedStage ? resumeInfo.lastCompletedStage + 1 : 1} 开始`,
      tool_calls: null,
      tool_call_id: null,
      metadata: { resumeInfo },
      tokens_used: null,
    });
    
    const execCtx: ExecutionContext = {
      session,
      userId,
      projectId: session.project_id,
      mode: session.mode,
      preferences: {
        targetPaperCount: 50,
        provider,
        model: model || session.model,
      },
      state: {
        seenIds: new Set(),
        historyIds: new Set(),
        projectExistingIds: new Set(),
        candidateLiterature: [],
        queries: [],
        logs: [],
        tempAssets: [],
      },
    };
    
    const tree = buildDefaultScriptTree(session);
    
    // 使用恢复模式执行
    for await (const ev of runScriptTree(tree, execCtx, { resumeMode: true })) {
      if (ev.type === 'final_result') {
        for (const asset of ev.tempAssets) {
          await tempAssetRepository.create(asset);
        }
        await this.addMessage({
          session_id: sessionId,
          role: 'assistant',
          content: ev.content,
          tool_calls: null,
          tool_call_id: null,
          metadata: { provider: provider || session.model, model: model || session.model, resumed: true },
          tokens_used: null,
        });
        yield { type: 'chunk', content: ev.content };
        yield { type: 'done', content: ev.content };
      } else {
        yield { type: 'status', content: JSON.stringify(ev) };
      }
    }
  }

  // Helper methods
  private buildSystemPrompt(session: AgentSession): string {
    let prompt = `你是一个专业的科研文献助手，名为 Deep-reference Agent。你的任务是帮助用户进行文献检索、筛选和综述撰写。

你的能力包括：
1. 分析用户的研究方向和目标
2. 生成文献检索策略
3. 筛选和评估文献
4. 生成文献综述框架
5. 撰写文献综述

请用专业、友好的语气与用户交流，并在必要时询问澄清问题。`;

    if (session.research_topic) {
      prompt += `\n\n当前研究主题：${session.research_topic}`;
    }
    
    if (session.research_goal) {
      prompt += `\n研究目标：${session.research_goal}`;
    }
    
    if (session.mode === 'agent') {
      prompt += `\n\n当前运行模式：自动模式（Agent）。你应该尽可能自主完成任务，减少与用户的交互。`;
    } else {
      prompt += `\n\n当前运行模式：Human-in-loop。在关键决策点需要征求用户意见。`;
    }
    
    return prompt;
  }

  // 获取会话统计
  async getSessionStats(userId: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    totalMessages: number;
  }> {
    const sessions = await agentSessionRepository.findAll({
      filters: { user_id: userId },
    });
    
    let totalMessages = 0;
    for (const session of sessions) {
      totalMessages += session.message_count;
    }
    
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'active').length,
      completedSessions: sessions.filter(s => s.status === 'completed').length,
      totalMessages,
    };
  }
}

export const agentService = new AgentService();
