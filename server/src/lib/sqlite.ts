/**
 * SQLite 数据库封装（基于 sql.js / WASM）
 * 提供与 better-sqlite3 兼容的 prepare/exec 接口，零原生依赖
 */
import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { config } from '../config/index.js';

// 持久化防抖：避免高频写操作时频繁刷盘
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 200;

// better-sqlite3 兼容的 prepare().run() 返回值
interface RunResult {
  changes: number;
}

// better-sqlite3 兼容的 Statement 接口
interface CompatStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): RunResult;
}

// 对外暴露的数据库接口，兼容 repository.ts 的调用方式
export interface CompatDatabase {
  prepare(sql: string): CompatStatement;
  exec(sql: string): void;
  close(): void;
}

let sqliteDb: CompatDatabase | null = null;
let rawDb: SqlJsDatabase | null = null;
let dbFilePath: string = '';

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

// 将数据库内容持久化到文件（防抖）
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (rawDb && dbFilePath) {
      try {
        const data = rawDb.export();
        const buffer = Buffer.from(data);
        ensureParentDir(dbFilePath);
        const tmpPath = dbFilePath + '.tmp.' + Date.now();
        fs.writeFileSync(tmpPath, buffer);
        fs.renameSync(tmpPath, dbFilePath);
      } catch (err) {
        console.warn('[SQLite] 持久化失败:', err);
      }
    }
  }, SAVE_DEBOUNCE_MS);
}

// 立即持久化（用于关键写操作后的同步保存）
function saveNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (rawDb && dbFilePath) {
    try {
      const data = rawDb.export();
      const buffer = Buffer.from(data);
      ensureParentDir(dbFilePath);
      const tmpPath = dbFilePath + '.tmp.' + Date.now();
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, dbFilePath);
    } catch (err) {
      console.warn('[SQLite] 持久化失败:', err);
    }
  }
}

// 将 sql.js 的结果行转为普通对象
function stmtToObjects(db: SqlJsDatabase, sql: string, params: unknown[]): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params as any[]);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Record<string, unknown>);
  }
  stmt.free();
  return rows;
}

// 创建 better-sqlite3 兼容的数据库包装
function createCompatDb(db: SqlJsDatabase): CompatDatabase {
  return {
    prepare(sql: string): CompatStatement {
      return {
        all(...params: unknown[]): Record<string, unknown>[] {
          return stmtToObjects(db, sql, params);
        },
        get(...params: unknown[]): Record<string, unknown> | undefined {
          const rows = stmtToObjects(db, sql, params);
          return rows[0];
        },
        run(...params: unknown[]): RunResult {
          db.run(sql, params as any[]);
          const changes = db.getRowsModified();
          scheduleSave();
          return { changes };
        },
      };
    },
    exec(sql: string): void {
      db.exec(sql);
      scheduleSave();
    },
    close(): void {
      saveNow();
      db.close();
    },
  };
}

function initSchema(db: CompatDatabase): void {
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

// sql.js 需要异步初始化，使用 Promise 缓存确保只初始化一次
let initPromise: Promise<CompatDatabase> | null = null;

async function initSqliteDb(): Promise<CompatDatabase> {
  const SQL = await initSqlJs();
  dbFilePath = resolveSqlitePath();
  ensureParentDir(dbFilePath);

  let db: SqlJsDatabase;
  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  rawDb = db;
  const compatDb = createCompatDb(db);
  initSchema(compatDb);
  // 建表后立即持久化，确保文件存在
  saveNow();
  return compatDb;
}

export function getSqliteDb(): CompatDatabase {
  if (sqliteDb) return sqliteDb;

  // 同步返回：首次调用通过 initSqlJs 的同步路径
  // sql.js 在 Node 环境下 initSqlJs() 实际可同步解析（WASM 从本地加载）
  // 但为安全起见使用 ensureInitialized 预热机制
  if (!initPromise) {
    initPromise = initSqliteDb().then((db) => {
      sqliteDb = db;
      return db;
    });
    // 阻塞式等待（仅首次，后续直接返回缓存）
    // 使用 deasync 模式的替代：抛出提示让调用方先调用 ensureInitialized
    throw new Error(
      'SQLite 尚未初始化完成，请先在应用启动时调用 await ensureInitialized()'
    );
  }

  if (!sqliteDb) {
    throw new Error(
      'SQLite 尚未初始化完成，请先在应用启动时调用 await ensureInitialized()'
    );
  }

  return sqliteDb;
}

// 应用启动时调用，确保 sql.js WASM 已加载完毕
export async function ensureInitialized(): Promise<void> {
  if (sqliteDb) return;
  if (!initPromise) {
    initPromise = initSqliteDb().then((db) => {
      sqliteDb = db;
      return db;
    });
  }
  await initPromise;
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

// 进程退出时确保数据写入磁盘
process.on('exit', () => saveNow());
process.on('SIGINT', () => { saveNow(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); process.exit(0); });
