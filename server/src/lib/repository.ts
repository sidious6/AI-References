import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config/index.js';
import { getSupabaseClient } from './supabase.js';
import { getSqliteDb, type CompatDatabase } from './sqlite.js';
import type {
  User, CreateUser, UpdateUser,
  Project, CreateProject, UpdateProject,
  Chapter, CreateChapter, UpdateChapter,
  Literature, CreateLiterature, UpdateLiterature,
  Document, CreateDocument, UpdateDocument,
  AgentSession, CreateAgentSession, UpdateAgentSession,
  AgentMessage, CreateAgentMessage,
  TempAsset, CreateTempAsset, UpdateTempAsset,
  Setting,
} from '../types/database.js';

// 请求上下文: 用于在请求生命周期内标记当前用户, 以便 repository 动态路由
interface RequestContext {
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

// 判断当前请求是否应使用本地 SQLite 存储
function shouldUseSqlite(): boolean {
  if (STORAGE_PROVIDER === 'sqlite' || STORAGE_PROVIDER === 'local') {
    return true;
  }
  const ctx = requestContext.getStore();
  return ctx?.userId === 'local-user';
}

type TableName =
  | 'users'
  | 'projects'
  | 'chapters'
  | 'literature'
  | 'documents'
  | 'agent_sessions'
  | 'agent_messages'
  | 'temp_assets'
  | 'settings';

interface QueryOptions {
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
}

interface Repository<T extends { id: string }> {
  findAll(options?: QueryOptions): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(data: Partial<T> & Record<string, unknown>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  createMany(records: Array<Partial<T> & Record<string, unknown>>): Promise<T[]>;
  deleteMany(filters: Record<string, unknown>): Promise<number>;
  count(filters?: Record<string, unknown>): Promise<number>;
}

const STORAGE_PROVIDER = (config.database.provider || 'supabase').toLowerCase();

const JSON_COLUMNS: Partial<Record<TableName, string[]>> = {
  projects: ['tags'],
  literature: ['authors', 'keywords', 'raw_data'],
  documents: ['metadata'],
  agent_sessions: ['workflow_state'],
  agent_messages: ['tool_calls', 'metadata'],
  temp_assets: ['data'],
  settings: ['value'],
};

function serializeValue(table: TableName, key: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if ((JSON_COLUMNS[table] || []).includes(key)) {
    if (value === null) return null;
    return JSON.stringify(value);
  }
  if (table === 'temp_assets' && key === 'synced_to_project') {
    return value ? 1 : 0;
  }
  return value;
}

function deserializeValue(table: TableName, key: string, value: unknown): unknown {
  if (value === undefined || value === null) {
    if (table === 'temp_assets' && key === 'synced_to_project') return false;
    return value;
  }

  if ((JSON_COLUMNS[table] || []).includes(key) && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (table === 'temp_assets' && key === 'synced_to_project') {
    return value === 1 || value === true;
  }

  return value;
}

function serializeRecord(table: TableName, data: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const serialized = serializeValue(table, key, value);
    if (serialized !== undefined) output[key] = serialized;
  }
  return output;
}

function deserializeRecord<T>(table: TableName, data: Record<string, unknown>): T {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    output[key] = deserializeValue(table, key, value);
  }
  return output as T;
}

function buildWhere(filters?: Record<string, unknown>): { clause: string; values: unknown[] } {
  if (!filters || Object.keys(filters).length === 0) {
    return { clause: '', values: [] };
  }

  const clauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (value === null) {
      clauses.push(`${key} IS NULL`);
    } else {
      clauses.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (clauses.length === 0) return { clause: '', values: [] };
  return { clause: `WHERE ${clauses.join(' AND ')}`, values };
}

class SupabaseRepository<T extends { id: string }> implements Repository<T> {
  constructor(private tableName: TableName) {}

  private client() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase 未启用或配置缺失（当前存储模式不是 supabase）');
    }
    return client;
  }

  async findAll(options?: QueryOptions): Promise<T[]> {
    let query = this.client().from(this.tableName).select('*');

    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }
    }

    if (options?.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
    }

    if (options?.offset !== undefined) {
      if (options.limit !== undefined) {
        query = query.range(options.offset, options.offset + options.limit - 1);
      } else {
        query = query.range(options.offset, options.offset + 9999);
      }
    } else if (options?.limit !== undefined) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase query failed(${this.tableName}): ${error.message}`);
    return ((data || []) as Record<string, unknown>[]).map((row) => deserializeRecord<T>(this.tableName, row));
  }

  async findById(id: string): Promise<T | null> {
    const { data, error } = await this.client()
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Supabase findById failed(${this.tableName}): ${error.message}`);
    return data ? deserializeRecord<T>(this.tableName, data as Record<string, unknown>) : null;
  }

  async create(data: Partial<T> & Record<string, unknown>): Promise<T> {
    const now = new Date().toISOString();
    const payload = serializeRecord(this.tableName, {
      id: uuidv4(),
      created_at: now,
      updated_at: now,
      ...data,
    });

    const { data: created, error } = await this.client()
      .from(this.tableName)
      .insert(payload)
      .select()
      .single();

    if (error || !created) {
      throw new Error(`Supabase create failed(${this.tableName}): ${error?.message || 'unknown'}`);
    }

    return deserializeRecord<T>(this.tableName, created as Record<string, unknown>);
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const payload = serializeRecord(this.tableName, {
      ...data,
      updated_at: new Date().toISOString(),
    });

    delete (payload as Record<string, unknown>).id;
    delete (payload as Record<string, unknown>).created_at;

    const { data: updated, error } = await this.client()
      .from(this.tableName)
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Supabase update failed(${this.tableName}): ${error.message}`);
    return updated ? deserializeRecord<T>(this.tableName, updated as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.client().from(this.tableName).delete().eq('id', id);
    if (error) throw new Error(`Supabase delete failed(${this.tableName}): ${error.message}`);
    return true;
  }

  async createMany(records: Array<Partial<T> & Record<string, unknown>>): Promise<T[]> {
    if (records.length === 0) return [];
    const now = new Date().toISOString();
    const payload = records.map((record) => serializeRecord(this.tableName, {
      ...record,
      id: uuidv4(),
      created_at: now,
      updated_at: now,
    }));

    const { data, error } = await this.client().from(this.tableName).insert(payload).select();
    if (error) throw new Error(`Supabase createMany failed(${this.tableName}): ${error.message}`);
    return ((data || []) as Record<string, unknown>[]).map((row) => deserializeRecord<T>(this.tableName, row));
  }

  async deleteMany(filters: Record<string, unknown>): Promise<number> {
    const rows = await this.findAll({ filters });
    if (rows.length === 0) return 0;

    for (const row of rows) {
      await this.delete(row.id);
    }

    return rows.length;
  }

  async count(filters?: Record<string, unknown>): Promise<number> {
    let query = this.client().from(this.tableName).select('*', { count: 'exact', head: true });
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) query = query.eq(key, value);
      }
    }

    const { count, error } = await query;
    if (error) throw new Error(`Supabase count failed(${this.tableName}): ${error.message}`);
    return count || 0;
  }
}

export class SqliteRepository<T extends { id: string }> implements Repository<T> {
  constructor(private tableName: TableName) {}

  async findAll(options?: QueryOptions): Promise<T[]> {
    const db = getSqliteDb();
    const { clause, values } = buildWhere(options?.filters);

    const orderClause = options?.orderBy
      ? `ORDER BY ${options.orderBy.column} ${(options.orderBy.ascending ?? true) ? 'ASC' : 'DESC'}`
      : '';

    const limitClause = options?.limit !== undefined ? `LIMIT ${options.limit}` : '';
    const offsetClause = options?.offset !== undefined ? `OFFSET ${options.offset}` : '';

    const sql = `SELECT * FROM ${this.tableName} ${clause} ${orderClause} ${limitClause} ${offsetClause}`.trim();
    const rows = db.prepare(sql).all(...values) as Record<string, unknown>[];
    return rows.map((row) => deserializeRecord<T>(this.tableName, row));
  }

  async findById(id: string): Promise<T | null> {
    const db = getSqliteDb();
    const row = db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`).get(id) as Record<string, unknown> | undefined;
    return row ? deserializeRecord<T>(this.tableName, row) : null;
  }

  async create(data: Partial<T> & Record<string, unknown>): Promise<T> {
    const db = getSqliteDb();
    const now = new Date().toISOString();
    const record = serializeRecord(this.tableName, {
      id: uuidv4(),
      created_at: now,
      updated_at: now,
      ...data,
    });

    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((key) => record[key]);

    db.prepare(`INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);

    return deserializeRecord<T>(this.tableName, record);
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const db = getSqliteDb();
    const payload = serializeRecord(this.tableName, {
      ...data,
      updated_at: new Date().toISOString(),
    });

    delete (payload as Record<string, unknown>).id;
    delete (payload as Record<string, unknown>).created_at;

    const keys = Object.keys(payload);
    if (keys.length === 0) return this.findById(id);

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => payload[key]);

    const result = db.prepare(`UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`).run(...values, id);
    if (result.changes === 0) return null;

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const db = getSqliteDb();
    const result = db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  async createMany(records: Array<Partial<T> & Record<string, unknown>>): Promise<T[]> {
    const output: T[] = [];
    for (const record of records) {
      output.push(await this.create(record));
    }
    return output;
  }

  async deleteMany(filters: Record<string, unknown>): Promise<number> {
    const db = getSqliteDb();
    const { clause, values } = buildWhere(filters);
    const sql = `DELETE FROM ${this.tableName} ${clause}`.trim();
    const result = db.prepare(sql).run(...values);
    return result.changes;
  }

  async count(filters?: Record<string, unknown>): Promise<number> {
    const db = getSqliteDb();
    const { clause, values } = buildWhere(filters);
    const row = db.prepare(`SELECT COUNT(1) as count FROM ${this.tableName} ${clause}`.trim()).get(...values) as { count: number };
    return row?.count || 0;
  }
}

// DynamicRepository: 根据请求上下文动态路由到 SQLite 或 Supabase
class DynamicRepository<T extends { id: string }> implements Repository<T> {
  private sqlite: SqliteRepository<T>;
  private supabase: SupabaseRepository<T>;

  constructor(tableName: TableName) {
    this.sqlite = new SqliteRepository<T>(tableName);
    this.supabase = new SupabaseRepository<T>(tableName);
  }

  private get repo(): Repository<T> {
    return shouldUseSqlite() ? this.sqlite : this.supabase;
  }

  findAll(options?: QueryOptions) { return this.repo.findAll(options); }
  findById(id: string) { return this.repo.findById(id); }
  create(data: Partial<T> & Record<string, unknown>) { return this.repo.create(data); }
  update(id: string, data: Partial<T>) { return this.repo.update(id, data); }
  delete(id: string) { return this.repo.delete(id); }
  createMany(records: Array<Partial<T> & Record<string, unknown>>) { return this.repo.createMany(records); }
  deleteMany(filters: Record<string, unknown>) { return this.repo.deleteMany(filters); }
  count(filters?: Record<string, unknown>) { return this.repo.count(filters); }
}

function createRepository<T extends { id: string }>(tableName: TableName): Repository<T> {
  // 始终创建 DynamicRepository, 运行时根据上下文路由
  return new DynamicRepository<T>(tableName);
}

export const userRepository = createRepository<User>('users');
export const projectRepository = createRepository<Project>('projects');
export const chapterRepository = createRepository<Chapter>('chapters');
export const literatureRepository = createRepository<Literature>('literature');
export const documentRepository = createRepository<Document>('documents');
export const agentSessionRepository = createRepository<AgentSession>('agent_sessions');
export const agentMessageRepository = createRepository<AgentMessage>('agent_messages');
export const tempAssetRepository = createRepository<TempAsset>('temp_assets');
export const settingRepository = createRepository<Setting>('settings');

export async function getSetting(category: string, key: string): Promise<unknown> {
  const rows = await settingRepository.findAll({
    filters: { category, key },
    limit: 1,
  });
  return rows[0]?.value;
}

export async function setSetting(category: string, key: string, value: unknown, description?: string): Promise<void> {
  const now = new Date().toISOString();
  const rows = await settingRepository.findAll({
    filters: { category, key },
    limit: 1,
  });

  if (rows.length > 0) {
    await settingRepository.update(rows[0].id, {
      value,
      description: description || rows[0].description,
      updated_at: now,
    } as Partial<Setting>);
    return;
  }

  await settingRepository.create({
    category,
    key,
    value,
    description: description || null,
    created_at: now,
    updated_at: now,
  } as Partial<Setting> & Record<string, unknown>);
}

export async function getSettingsByCategory(category: string): Promise<Record<string, unknown>> {
  const rows = await settingRepository.findAll({ filters: { category } });
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {} as Record<string, unknown>);
}

export type {
  User, CreateUser, UpdateUser,
  Project, CreateProject, UpdateProject,
  Chapter, CreateChapter, UpdateChapter,
  Literature, CreateLiterature, UpdateLiterature,
  Document, CreateDocument, UpdateDocument,
  AgentSession, CreateAgentSession, UpdateAgentSession,
  AgentMessage, CreateAgentMessage,
  TempAsset, CreateTempAsset, UpdateTempAsset,
  Setting,
};
