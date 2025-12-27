import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';
import type { LocalDatabase } from '../types/database.js';

const DB_VERSION = 1;

// 写入锁，防止并发写入冲突
let writeLock: Promise<void> = Promise.resolve();

function getDataDir(): string {
  return path.resolve(config.dataDir);
}

function getDbPath(): string {
  return path.join(getDataDir(), 'database.json');
}

async function ensureDataDir(): Promise<void> {
  const dataDir = getDataDir();
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

function createEmptyDatabase(): LocalDatabase {
  return {
    projects: [],
    chapters: [],
    literature: [],
    documents: [],
    agent_sessions: [],
    agent_messages: [],
    temp_assets: [],
    settings: [],
    _meta: {
      version: DB_VERSION,
      last_synced: null,
    },
  };
}

export async function readLocalDatabase(): Promise<LocalDatabase> {
  await ensureDataDir();
  const dbPath = getDbPath();

  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    let db: LocalDatabase;
    
    try {
      db = JSON.parse(data) as LocalDatabase;
    } catch (parseError) {
      console.error('[LocalStorage] JSON 解析失败，尝试修复...');
      const fixedData = tryFixJson(data);
      if (fixedData) {
        db = JSON.parse(fixedData) as LocalDatabase;
        console.log('[LocalStorage] JSON 修复成功');
        await fs.writeFile(dbPath, fixedData, 'utf-8');
      } else {
        console.error('[LocalStorage] JSON 无法修复，创建新数据库');
        const backupPath = dbPath + '.corrupted.' + Date.now();
        await fs.writeFile(backupPath, data, 'utf-8');
        console.log(`[LocalStorage] 已备份损坏文件到: ${backupPath}`);
        return createEmptyDatabase();
      }
    }
    
    if (!db._meta || db._meta.version !== DB_VERSION) {
      console.log('Local database version mismatch, creating new database');
      return createEmptyDatabase();
    }
    
    return db;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptyDatabase();
    }
    throw error;
  }
}

function tryFixJson(data: string): string | null {
  try {
    let fixed = data;
    fixed = fixed.replace(/[\x00-\x1F\x7F]/g, (char) => {
      if (char === '\n' || char === '\r' || char === '\t') return char;
      return '';
    });
    const lastBrace = fixed.lastIndexOf('}');
    if (lastBrace > 0 && lastBrace < fixed.length - 1) {
      fixed = fixed.slice(0, lastBrace + 1);
    }
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (const char of fixed) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
      }
    }
    
    while (bracketCount > 0) {
      fixed += ']';
      bracketCount--;
    }
    while (braceCount > 0) {
      fixed += '}';
      braceCount--;
    }
    
    JSON.parse(fixed);
    return fixed;
  } catch {
    return null;
  }
}

export async function writeLocalDatabase(db: LocalDatabase): Promise<void> {
  // 使用锁确保顺序写入
  const previousLock = writeLock;
  let resolve: () => void;
  writeLock = new Promise<void>((r) => { resolve = r; });
  
  try {
    await previousLock;
    await ensureDataDir();
    const dbPath = getDbPath();
    
    db._meta.last_synced = new Date().toISOString();
    
    // 先序列化验证 JSON 有效性
    const jsonContent = JSON.stringify(db, null, 2);
    
    // 验证序列化后的内容可以被解析
    try {
      JSON.parse(jsonContent);
    } catch (e) {
      console.error('[LocalStorage] 序列化验证失败，跳过写入');
      return;
    }
    
    // 使用临时文件+重命名确保原子写入
    const tempPath = dbPath + '.tmp.' + Date.now();
    await fs.writeFile(tempPath, jsonContent, 'utf-8');
    await fs.rename(tempPath, dbPath);
  } catch (err) {
    console.error('[LocalStorage] 写入失败:', err);
  } finally {
    resolve!();
  }
}

export async function updateLocalTable<K extends keyof Omit<LocalDatabase, '_meta'>>(
  tableName: K,
  updater: (items: LocalDatabase[K]) => LocalDatabase[K]
): Promise<LocalDatabase[K]> {
  const db = await readLocalDatabase();
  db[tableName] = updater(db[tableName]);
  await writeLocalDatabase(db);
  return db[tableName];
}

export async function getLocalTable<K extends keyof Omit<LocalDatabase, '_meta'>>(
  tableName: K
): Promise<LocalDatabase[K]> {
  const db = await readLocalDatabase();
  return db[tableName];
}
