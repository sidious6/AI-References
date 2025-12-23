import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { testSupabaseConnection } from './lib/supabase.js';
import authRoutes from './routes/auth.routes.js';
import llmRoutes from './routes/llm.routes.js';
import projectRoutes from './routes/project.routes.js';
import literatureRoutes from './routes/literature.routes.js';
import documentRoutes from './routes/document.routes.js';
import chapterRoutes from './routes/chapter.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import agentRoutes from './routes/agent.routes.js';

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 健康检查
app.get('/health', async (_req, res) => {
  const supabaseConnected = await testSupabaseConnection();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: supabaseConnected ? 'connected' : 'disconnected',
  });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', literatureRoutes);
app.use('/api', documentRoutes);
app.use('/api', chapterRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/agent', agentRoutes);

// 错误处理
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// 启动服务器
app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Data directory: ${config.dataDir}`);
});

export default app;
