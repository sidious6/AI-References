import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { config } from '../config/index.js';

let sqliteDb: Database.Database | null = null;

function resolveSqlitePath(): string {
  const configured = config.database.sqlitePath || './data/app.db';
  return path.resolve(config.dataDir, configured);
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username TEXT,
      avatar_url TEXT,
      status TEXT NOT NULL,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      domain TEXT,
      status TEXT NOT NULL,
      tags TEXT NOT NULL,
      literature_count INTEGER NOT NULL,
      document_count INTEGER NOT NULL,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL,
      depth INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS literature (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT,
      search_query_id TEXT,
      title TEXT NOT NULL,
      authors TEXT NOT NULL,
      year INTEGER,
      journal TEXT,
      volume TEXT,
      issue TEXT,
      pages TEXT,
      doi TEXT,
      abstract TEXT,
      keywords TEXT NOT NULL,
      source TEXT NOT NULL,
      source_database TEXT,
      status TEXT NOT NULL,
      ai_summary TEXT,
      ai_relevance_score REAL,
      ai_inclusion_reason TEXT,
      file_path TEXT,
      file_url TEXT,
      bibtex TEXT,
      raw_data TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      type TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      file_path TEXT,
      storage_url TEXT,
      processing_status TEXT NOT NULL,
      extracted_text TEXT,
      metadata TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      user_id TEXT,
      title TEXT,
      mode TEXT NOT NULL,
      model TEXT,
      status TEXT NOT NULL,
      research_topic TEXT,
      research_goal TEXT,
      message_count INTEGER NOT NULL,
      workflow_state TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      metadata TEXT NOT NULL,
      tokens_used INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS temp_assets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      content TEXT,
      data TEXT NOT NULL,
      synced_to_project INTEGER NOT NULL,
      synced_at TEXT,
      synced_project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(category, key)
    );

    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_project_id ON chapters(project_id);
    CREATE INDEX IF NOT EXISTS idx_literature_project_id ON literature(project_id);
    CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_temp_assets_session_id ON temp_assets(session_id);
  `);
}

export function getSqliteDb(): Database.Database {
  if (sqliteDb) return sqliteDb;

  const dbPath = resolveSqlitePath();
  ensureParentDir(dbPath);

  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = OFF');

  initSchema(sqliteDb);

  return sqliteDb;
}

export function getSqliteHealth(): { connected: boolean; path: string } {
  try {
    const db = getSqliteDb();
    db.prepare('SELECT 1').get();
    return { connected: true, path: resolveSqlitePath() };
  } catch {
    return { connected: false, path: resolveSqlitePath() };
  }
}
