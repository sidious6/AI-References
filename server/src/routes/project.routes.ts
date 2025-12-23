import { Router } from 'express';
import { projectController } from '../controllers/project.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// 所有项目路由都需要认证
router.use(authMiddleware);

router.get('/', projectController.list);
router.get('/domains', projectController.getDomains);
router.get('/:id', projectController.getById);
router.get('/:id/stats', projectController.getStats);
router.post('/', projectController.create);
router.put('/:id', projectController.update);
router.delete('/:id', projectController.delete);

export default router;
