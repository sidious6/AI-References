# AI-References 数据库文档

本文档用于帮助用户在本地快速搭建数据库。

## 环境要求

- Supabase 账号 (https://supabase.com)
- Node.js 20+ (推荐，18及以下版本已废弃)

## 快速开始

### 1. 创建 Supabase 项目

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 点击 "New Project" 创建新项目
3. 记录以下信息：
   - Project URL
   - anon/public API Key

### 2. 配置环境变量

在 `server/.env` 文件中配置：

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. 执行数据库迁移

按顺序执行以下 SQL 语句来创建数据库表结构。

---

## 数据库表结构

### 表关系图

```
users (用户)
└── projects (项目)
    ├── chapters (章节) - 支持树形结构
    │   ├── literature (文献)
    │   └── documents (文档)
    ├── literature (文献)
    ├── documents (文档)
    └── agent_sessions (Agent会话)
        ├── agent_messages (消息)
        └── temp_assets (临时资产)

settings (设置) - 支持用户级别
```

---

## 迁移脚本

### Migration 0: 创建用户表 (2024-12-08 新增)

```sql
-- 20251208_create_users_table.sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  username VARCHAR(100),
  avatar_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'banned')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 为现有表添加 user_id 字段
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

-- 为 users 表添加 updated_at 触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Migration 1: 创建项目表

```sql
-- 20251208153025_create_projects_table.sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  domain VARCHAR(100),
  status VARCHAR(50) DEFAULT 'researching' CHECK (status IN ('researching', 'searching', 'screening', 'writing', 'completed')),
  tags TEXT[] DEFAULT '{}',
  literature_count INTEGER DEFAULT 0,
  document_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);
```

### Migration 2: 创建章节表

```sql
-- 20251208153036_create_chapters_table.sql
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  depth INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chapters_project_id ON chapters(project_id);
CREATE INDEX idx_chapters_parent_id ON chapters(parent_id);
CREATE INDEX idx_chapters_sort_order ON chapters(project_id, sort_order);
```

### Migration 3: 创建文献表

```sql
-- 20251208153049_create_literature_table.sql
CREATE TABLE IF NOT EXISTS literature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  authors TEXT[] DEFAULT '{}',
  year INTEGER,
  journal VARCHAR(255),
  volume VARCHAR(50),
  issue VARCHAR(50),
  pages VARCHAR(50),
  doi VARCHAR(255),
  abstract TEXT,
  keywords TEXT[] DEFAULT '{}',
  source VARCHAR(20) DEFAULT 'user' CHECK (source IN ('ai', 'user')),
  source_database VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('approved', 'rejected', 'pending')),
  ai_summary TEXT,
  ai_relevance_score DECIMAL(3,2),
  ai_inclusion_reason TEXT,
  file_path VARCHAR(500),
  file_url TEXT,
  bibtex TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_literature_project_id ON literature(project_id);
CREATE INDEX idx_literature_chapter_id ON literature(chapter_id);
CREATE INDEX idx_literature_status ON literature(status);
CREATE INDEX idx_literature_source ON literature(source);
CREATE INDEX idx_literature_doi ON literature(doi);
```

### Migration 4: 创建文档表

```sql
-- 20251208153100_create_documents_table.sql
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('pdf', 'docx', 'pptx', 'xlsx', 'image', 'other')),
  mime_type VARCHAR(100),
  size BIGINT NOT NULL,
  file_path VARCHAR(500),
  storage_url TEXT,
  processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  extracted_text TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_chapter_id ON documents(chapter_id);
CREATE INDEX idx_documents_type ON documents(type);
CREATE INDEX idx_documents_processing_status ON documents(processing_status);
```

### Migration 5: 创建 Agent 表

```sql
-- 20251208153111_create_agent_tables.sql
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title VARCHAR(255),
  mode VARCHAR(20) DEFAULT 'human-in-loop' CHECK (mode IN ('human-in-loop', 'agent')),
  model VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  research_topic TEXT,
  research_goal TEXT,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_call_id VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_sessions_project_id ON agent_sessions(project_id);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX idx_agent_sessions_created_at ON agent_sessions(created_at DESC);
CREATE INDEX idx_agent_messages_session_id ON agent_messages(session_id);
CREATE INDEX idx_agent_messages_created_at ON agent_messages(created_at);
```

### Migration 6: 创建临时资产表

```sql
-- 20251208153122_create_temp_assets_table.sql
CREATE TABLE IF NOT EXISTS temp_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('chapter_framework', 'candidate_literature', 'search_query', 'draft')),
  title VARCHAR(255),
  content TEXT,
  data JSONB DEFAULT '{}',
  synced_to_project BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ,
  synced_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_temp_assets_session_id ON temp_assets(session_id);
CREATE INDEX idx_temp_assets_type ON temp_assets(type);
CREATE INDEX idx_temp_assets_synced ON temp_assets(synced_to_project);
```

### Migration 7: 创建设置表

```sql
-- 20251208153134_create_settings_table.sql
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, key)
);

CREATE INDEX idx_settings_category ON settings(category);
CREATE INDEX idx_settings_category_key ON settings(category, key);

-- 插入默认设置
INSERT INTO settings (category, key, value, description) VALUES
  ('llm', 'provider', '"openai"', 'LLM服务提供商'),
  ('llm', 'model', '"gpt-4"', '默认模型'),
  ('llm', 'api_key', '""', 'API密钥'),
  ('llm', 'base_url', '""', '自定义API地址'),
  ('llm', 'temperature', '0.7', '温度参数'),
  ('llm', 'max_tokens', '4096', '最大token数'),
  ('search', 'default_databases', '["pubmed", "semantic_scholar"]', '默认搜索数据库'),
  ('search', 'max_results', '50', '最大搜索结果数'),
  ('general', 'language', '"zh-CN"', '界面语言')
ON CONFLICT (category, key) DO NOTHING;
```

### Migration 8: 创建触发器

```sql
-- 20251208153146_create_count_triggers.sql

-- updated_at 自动更新函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为所有表添加 updated_at 触发器
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_literature_updated_at BEFORE UPDATE ON literature
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_sessions_updated_at BEFORE UPDATE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_temp_assets_updated_at BEFORE UPDATE ON temp_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 文献计数触发器
CREATE OR REPLACE FUNCTION update_literature_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE projects SET literature_count = literature_count + 1 WHERE id = NEW.project_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE projects SET literature_count = literature_count - 1 WHERE id = OLD.project_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_literature_count
AFTER INSERT OR DELETE ON literature
FOR EACH ROW EXECUTE FUNCTION update_literature_count();

-- 文档计数触发器
CREATE OR REPLACE FUNCTION update_document_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE projects SET document_count = document_count + 1 WHERE id = NEW.project_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE projects SET document_count = document_count - 1 WHERE id = OLD.project_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_document_count
AFTER INSERT OR DELETE ON documents
FOR EACH ROW EXECUTE FUNCTION update_document_count();

-- 消息计数触发器
CREATE OR REPLACE FUNCTION update_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE agent_sessions SET message_count = message_count + 1 WHERE id = NEW.session_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE agent_sessions SET message_count = message_count - 1 WHERE id = OLD.session_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_message_count
AFTER INSERT OR DELETE ON agent_messages
FOR EACH ROW EXECUTE FUNCTION update_message_count();
```

---

## 一键初始化脚本

将以上所有 SQL 合并执行，或在 Supabase SQL Editor 中依次执行各迁移脚本。

```sql
-- 完整初始化脚本
-- 按顺序执行 Migration 1-8 的所有 SQL 语句
```

---

## 本地 JSON 备份

系统支持 Supabase + 本地 JSON 双写机制，本地数据存储在：

```
server/data/database.json
```

数据结构：
```json
{
  "projects": [],
  "chapters": [],
  "literature": [],
  "documents": [],
  "agent_sessions": [],
  "agent_messages": [],
  "temp_assets": [],
  "settings": []
}
```

---

## 更新日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2024-12-08 | 1.0.0 | 初始数据库结构，包含8个业务表和自动触发器 |
| 2024-12-08 | 1.1.0 | 新增用户表(users)，为 projects/agent_sessions/settings 添加 user_id 字段支持多用户 |
