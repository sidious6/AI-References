import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 兼容的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从 server/src/config 向上三级到项目根目录
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: process.env.DATA_DIR || './data',
  logLevel: process.env.LOG_LEVEL || 'info',

  llm: {
    defaultProvider: process.env.DEFAULT_LLM_PROVIDER || 'ark',
    
    ark: {
      apiKey: process.env.ARK_API_KEY || '',
      baseUrl: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      model: process.env.ARK_MODEL || 'ep-20251207150153-m8xqp',
    },
    
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
    },
    
    google: {
      apiKey: process.env.GOOGLE_API_KEY || '',
      model: process.env.GOOGLE_MODEL || 'gemini-pro',
    },
    
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    },
  },

  database: {
    provider: (process.env.STORAGE_PROVIDER || 'supabase').toLowerCase(), // supabase | sqlite
    sqlitePath: process.env.SQLITE_DB_PATH || 'app.db',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseTimeoutMs: parseInt(process.env.SUPABASE_TIMEOUT_MS || '15000', 10),
  },

  apis: {
    wosApiKey: process.env.WOS_API_KEY || '',
    wosBaseUrl: process.env.WOS_BASE_URL || 'https://api.clarivate.com/api/woslite',
    scopusApiKey: process.env.SCOPUS_API_KEY || '',
    scopusInsttoken: process.env.SCOPUS_INSTTOKEN || '',
    scopusBaseUrl: process.env.SCOPUS_BASE_URL || 'https://api.elsevier.com/content/search/scopus',
    googleCseApiKey: process.env.GOOGLE_CSE_API_KEY || '',
    googleCseCx: process.env.GOOGLE_CSE_CX || '',
    googleCseBaseUrl: process.env.GOOGLE_CSE_BASE_URL || 'https://www.googleapis.com/customsearch/v1',
  },

  // DOI 摘要抓取配置
  doiAbstract: {
    concurrency: parseInt(process.env.DOI_ABSTRACT_CONCURRENCY || '15', 10),
    perHost: parseInt(process.env.DOI_ABSTRACT_PER_HOST || '3', 10),
    timeoutMs: parseInt(process.env.DOI_ABSTRACT_TIMEOUT_MS || '12000', 10),
  },
};
