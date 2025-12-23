import { Router } from 'express';
import multer from 'multer';
import { documentController } from '../controllers/document.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// 配置 multer 用于文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (_req, file, cb) => {
    // 修复中文文件名编码问题
    if (file.originalname) {
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    }
    cb(null, true);
  },
});

// 所有文档路由都需要认证
router.use(authMiddleware);

// 项目下的文档路由
router.get('/projects/:projectId/documents', documentController.list);
router.get('/projects/:projectId/documents/stats', documentController.getStats);
router.post('/projects/:projectId/documents/upload', upload.single('file'), documentController.upload);

// 单独文档路由
router.get('/documents/:id', documentController.getById);
router.get('/documents/:id/download', documentController.download);
router.put('/documents/:id', documentController.update);
router.patch('/documents/:id/chapter', documentController.assignChapter);
router.delete('/documents/:id', documentController.delete);

export default router;
