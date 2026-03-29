import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { testSupabaseConnection } from './lib/supabase.js';
import { ensureInitialized, getSqliteHealth } from './lib/sqlite.js';
import authRoutes from './routes/auth.routes.js';
import llmRoutes from './routes/llm.routes.js';
import projectRoutes from './routes/project.routes.js';
import literatureRoutes from './routes/literature.routes.js';
import documentRoutes from './routes/document.routes.js';
import chapterRoutes from './routes/chapter.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import agentRoutes from './routes/agent.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 首次启动时自动从 .env.example 创建 .env
function ensureEnvFile(): void {
  const rootDir = path.resolve(__dirname, '../../');
  const envPath = path.join(rootDir, '.env');
  const examplePath = path.join(rootDir, '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('[Init] .env 文件不存在，已从 .env.example 自动创建');
  }
}

async function bootstrap() {
  ensureEnvFile();

  // 预热 sql.js WASM，确保后续同步调用 getSqliteDb() 可用
  await ensureInitialized();

  const app = express();

  // 中间件
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 健康检查
  app.get('/health', async (_req, res) => {
    const supabaseConnected = await testSupabaseConnection();
    const sqlite = getSqliteHealth();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      storage_provider: config.database.provider,
      supabase: supabaseConnected ? 'connected' : 'disconnected',
      sqlite: sqlite.connected ? 'connected' : 'disconnected',
      sqlite_path: sqlite.path,
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

  // 启动服务器，端口被占用时自动尝试下一个
  const MAX_PORT_ATTEMPTS = 10;

  function tryListen(port: number, attempt: number): void {
    const server = app.listen(port, () => {
      if (port !== config.port) {
        console.log(`[Init] 端口 ${config.port} 被占用，已切换到 ${port}`);
      }
      console.log(`Server running at http://localhost:${port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Data directory: ${config.dataDir}`);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
        console.log(`Port ${port} is in use, trying ${port + 1}...`);
        tryListen(port + 1, attempt + 1);
      } else {
        console.error('Failed to start server:', err);
        process.exit(1);
      }
    });
  }

  tryListen(config.port, 1);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
