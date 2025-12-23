import { Router } from 'express';
import { chapterController } from '../controllers/chapter.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// 所有章节路由都需要认证
router.use(authMiddleware);

// 项目下的章节路由
router.get('/projects/:projectId/chapters', chapterController.list);
router.get('/projects/:projectId/chapters/tree', chapterController.getTree);
router.post('/projects/:projectId/chapters', chapterController.create);

// 单独章节路由
router.get('/chapters/:id', chapterController.getById);
router.get('/chapters/:id/assets', chapterController.getAssets);
router.put('/chapters/:id', chapterController.update);
router.patch('/chapters/:id/reorder', chapterController.reorder);
router.delete('/chapters/:id', chapterController.delete);

export default router;
