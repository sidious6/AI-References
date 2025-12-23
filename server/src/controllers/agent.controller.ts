import { Request, Response } from 'express';
import { agentService } from '../services/agent.service.js';
import type { LLMProvider } from '../types/llm.js';

// 扩展 Request 类型以包含用户信息（与 auth.middleware 一致）
interface AuthenticatedRequest extends Request {
  userId?: string;
}

export const agentController = {
  // 获取会话列表
  async listSessions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { project_id, status, limit, offset } = req.query;
      
      const result = await agentService.listSessions({
        userId,
        projectId: project_id as string,
        status: status as 'active' | 'completed' | 'archived',
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      
      res.json({
        success: true,
        data: result.data,
        total: result.total,
      });
    } catch (error) {
      console.error('List sessions error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list sessions',
      });
    }
  },

  // 获取单个会话详情
  async getSession(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      
      const session = await agentService.getSession(id, userId);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session',
      });
    }
  },

  // 创建新会话
  async createSession(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { project_id, title, mode, model, research_topic, research_goal } = req.body;
      
      const session = await agentService.createSession({
        project_id: project_id || null,
        title: title || null,
        mode: mode || 'human-in-loop',
        model: model || null,
        status: 'active',
        research_topic: research_topic || null,
        research_goal: research_goal || null,
        user_id: userId || null,
      });
      
      res.status(201).json({
        success: true,
        data: session,
      });
    } catch (error) {
      console.error('Create session error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create session',
      });
    }
  },

  // 更新会话
  async updateSession(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { title, mode, model, status, research_topic, research_goal, project_id } = req.body;
      
      const session = await agentService.updateSession(id, {
        title,
        mode,
        model,
        status,
        research_topic,
        research_goal,
        project_id,
      }, userId);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      console.error('Update session error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update session',
      });
    }
  },

  // 删除会话
  async deleteSession(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      
      const success = await agentService.deleteSession(id, userId);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      res.json({
        success: true,
        message: 'Session deleted',
      });
    } catch (error) {
      console.error('Delete session error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete session',
      });
    }
  },

  // 发送消息（非流式）
  async chat(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { content, provider, model, temperature, max_tokens } = req.body;
      
      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'Content is required',
        });
      }
      
      // 验证会话权限
      const session = await agentService.getSession(id, userId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      const result = await agentService.chat({
        sessionId: id,
        content,
        provider: provider as LLMProvider,
        model,
        temperature,
        maxTokens: max_tokens,
        userId,
      });
      
      res.json({
        success: true,
        data: {
          message: result.message,
          response: result.response,
        },
      });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process chat',
      });
    }
  },

  // 发送消息（流式）
  async chatStream(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { content, provider, model, temperature, max_tokens } = req.body;
      
      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'Content is required',
        });
      }
      
      // 验证会话权限
      const session = await agentService.getSession(id, userId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      
      // 流式响应
      for await (const chunk of agentService.chatStream({
        sessionId: id,
        content,
        provider: provider as LLMProvider,
        model,
        temperature,
        maxTokens: max_tokens,
        userId,
      })) {
        if (chunk.type === 'chunk' || chunk.type === 'done') {
          res.write(`data: ${JSON.stringify({ type: chunk.type, content: chunk.content })}\n\n`);
        } else if (chunk.type === 'status') {
          res.write(`data: ${JSON.stringify({ type: 'status', content: chunk.content })}\n\n`);
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('Chat stream error:', error);
      // 如果还没开始流式响应，返回 JSON 错误
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process chat stream',
        });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Stream error' })}\n\n`);
        res.end();
      }
    }
  },

  // 获取会话消息历史
  async getMessages(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      
      // 验证会话权限
      const session = await agentService.getSession(id, userId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      const messages = await agentService.getMessages(id);
      
      res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get messages',
      });
    }
  },

  // 获取临时资产
  async getTempAssets(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { type } = req.query;
      
      // 验证会话权限
      const session = await agentService.getSession(id, userId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      const assets = await agentService.getTempAssets(
        id, 
        type as 'chapter_framework' | 'candidate_literature' | 'search_query' | 'draft'
      );
      
      res.json({
        success: true,
        data: assets,
      });
    } catch (error) {
      console.error('Get temp assets error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get temp assets',
      });
    }
  },

  // 同步临时资产到项目
  async syncTempAsset(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { id, assetId } = req.params;
      const { project_id } = req.body;
      
      if (!project_id) {
        return res.status(400).json({
          success: false,
          error: 'Project ID is required',
        });
      }
      
      // 验证会话权限
      const session = await agentService.getSession(id, userId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      const asset = await agentService.syncTempAssetToProject(assetId, project_id);
      
      if (!asset) {
        return res.status(404).json({
          success: false,
          error: 'Asset not found',
        });
      }
      
      res.json({
        success: true,
        data: asset,
      });
    } catch (error) {
      console.error('Sync temp asset error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync temp asset',
      });
    }
  },
  
  // 更新工作流状态
  async updateWorkflowState(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { workflow_state } = req.body;
      
      if (!workflow_state) {
        return res.status(400).json({
          success: false,
          error: 'Workflow state is required',
        });
      }
      
      const session = await agentService.updateWorkflowState(id, workflow_state);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      console.error('Update workflow state error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update workflow state',
      });
    }
  },
  
  // 获取工作流状态
  async getWorkflowState(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const state = await agentService.getWorkflowState(id);
      
      res.json({
        success: true,
        data: state,
      });
    } catch (error) {
      console.error('Get workflow state error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get workflow state',
      });
    }
  },
  
  // 确认项目选择
  async confirmProjectSelection(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { confirmationType, selectedOption, recommendedProjectId } = req.body;
      
      // 验证会话权限
      const session = await agentService.getSession(id, userId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      const result = await agentService.confirmProjectSelection(id, userId, {
        confirmationType,
        selectedOption,
        recommendedProjectId,
      });
      
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Confirm project selection error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to confirm project selection',
      });
    }
  },
  
  // 检查工作流是否可恢复
  async checkWorkflowResumable(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const resumeInfo = await agentService.checkWorkflowResumable(id);
      
      res.json({
        success: true,
        data: resumeInfo,
      });
    } catch (error) {
      console.error('Check workflow resumable error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check workflow resumable',
      });
    }
  },
  
  // 恢复工作流执行
  async resumeWorkflow(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { provider, model } = req.body;
      
      // 验证会话权限
      const session = await agentService.getSession(id, userId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }
      
      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      
      // 流式响应
      for await (const chunk of agentService.resumeWorkflow({
        sessionId: id,
        content: '', // 恢复模式不需要新内容
        provider: provider as any,
        model,
        userId,
      })) {
        if (chunk.type === 'chunk' || chunk.type === 'done') {
          res.write(`data: ${JSON.stringify({ type: chunk.type, content: chunk.content })}\n\n`);
        } else if (chunk.type === 'status') {
          res.write(`data: ${JSON.stringify({ type: 'status', content: chunk.content })}\n\n`);
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('Resume workflow error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to resume workflow',
        });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Resume error' })}\n\n`);
        res.end();
      }
    }
  },

  // 获取会话统计
  async getStats(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }
      
      const stats = await agentService.getSessionStats(userId);
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stats',
      });
    }
  },
};
