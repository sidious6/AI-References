import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// 所有设置路由都需要认证
router.use(authMiddleware);

router.get('/', settingsController.getAll);
router.get('/general', settingsController.getGeneral);
router.put('/general', settingsController.updateGeneral);
router.get('/model', settingsController.getModel);
router.put('/model', settingsController.updateModel);
router.get('/datasource', settingsController.getDatasource);
router.put('/datasource', settingsController.updateDatasource);
router.get('/storage', settingsController.getStorage);
router.put('/storage', settingsController.updateStorage);
router.get('/environment', settingsController.getEnvironment);
router.post('/test-llm', settingsController.testLLM);

export default router;
