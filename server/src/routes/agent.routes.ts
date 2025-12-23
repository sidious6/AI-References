import { Router } from 'express';
import { agentController } from '../controllers/agent.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 会话管理
router.get('/sessions', agentController.listSessions);
router.get('/sessions/stats', agentController.getStats);
router.post('/sessions', agentController.createSession);
router.get('/sessions/:id', agentController.getSession);
router.put('/sessions/:id', agentController.updateSession);
router.delete('/sessions/:id', agentController.deleteSession);

// 消息和对话
router.get('/sessions/:id/messages', agentController.getMessages);
router.post('/sessions/:id/chat', agentController.chat);
router.post('/sessions/:id/chat/stream', agentController.chatStream);

// 临时资产
router.get('/sessions/:id/assets', agentController.getTempAssets);
router.post('/sessions/:id/assets/:assetId/sync', agentController.syncTempAsset);

// 工作流状态
router.get('/sessions/:id/workflow', agentController.getWorkflowState);
router.put('/sessions/:id/workflow', agentController.updateWorkflowState);

// 项目选择确认
router.post('/sessions/:id/confirm-project', agentController.confirmProjectSelection);

// 工作流恢复
router.get('/sessions/:id/workflow/resumable', agentController.checkWorkflowResumable);
router.post('/sessions/:id/workflow/resume', agentController.resumeWorkflow);

export default router;
