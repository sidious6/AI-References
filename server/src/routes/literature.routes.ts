import { Router } from 'express';
import { literatureController } from '../controllers/literature.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// 所有文献路由都需要认证
router.use(authMiddleware);

// 项目下的文献路由
router.get('/projects/:projectId/literature', literatureController.list);
router.get('/projects/:projectId/literature/stats', literatureController.getStats);
router.post('/projects/:projectId/literature', literatureController.create);
router.post('/projects/:projectId/literature/import', literatureController.importBibtex);

// 单独文献路由
router.get('/literature/:id', literatureController.getById);
router.put('/literature/:id', literatureController.update);
router.patch('/literature/:id/status', literatureController.updateStatus);
router.patch('/literature/:id/chapter', literatureController.assignChapter);
router.delete('/literature/:id', literatureController.delete);

export default router;
