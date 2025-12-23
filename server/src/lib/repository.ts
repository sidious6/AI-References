import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from './supabase.js';
import { readLocalDatabase, writeLocalDatabase, getLocalTable } from './local-storage.js';
import type {
  Project, CreateProject, UpdateProject,
  Chapter, CreateChapter, UpdateChapter,
  Literature, CreateLiterature, UpdateLiterature,
  Document, CreateDocument, UpdateDocument,
  AgentSession, CreateAgentSession, UpdateAgentSession,
  AgentMessage, CreateAgentMessage,
  TempAsset, CreateTempAsset, UpdateTempAsset,
  Setting,
} from '../types/database.js';

type TableName = 'projects' | 'chapters' | 'literature' | 'documents' | 'agent_sessions' | 'agent_messages' | 'temp_assets' | 'settings';

interface QueryOptions {
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
}

function shouldFallbackToLocal(error: unknown): boolean {
  if (!error) return false;
  const message = typeof error === 'string'
    ? error.toLowerCase()
    : (error as { message?: string }).message?.toLowerCase();
  if (!message) return false;
  const networkIndicators = [
    'fetch failed', 
    'network error', 
    'timeout', 
    'etimedout',
    'cannot coerce',  // 记录不存在时的错误
  ];
  return networkIndicators.some(indicator => message.includes(indicator));
}

// 通用双写存储仓库
class DualWriteRepository<T extends { id: string }> {
  constructor(private tableName: TableName) {}

  // 读取：优先 Supabase，失败降级本地
  async findAll(options?: QueryOptions): Promise<T[]> {
    const supabase = getSupabaseClient();
    
    if (supabase) {
      try {
        let query = supabase.from(this.tableName).select('*');
        
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
        
        if (options?.limit) {
          query = query.limit(options.limit);
        }
        
        if (options?.offset) {
          query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
        }
        
        const { data, error } = await query;
        
        if (!error && data) {
          return data as T[];
        }
        console.warn(`Supabase query failed for ${this.tableName}, falling back to local:`, error?.message);
      } catch (err) {
        console.warn(`Supabase error for ${this.tableName}, falling back to local:`, err);
      }
    }
    
    // 降级到本地
    let items = (await getLocalTable(this.tableName)) as unknown as T[];
    
    if (options?.filters) {
      items = items.filter(item => {
        for (const [key, value] of Object.entries(options.filters!)) {
          if (value !== undefined && value !== null && (item as Record<string, unknown>)[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }
    
    if (options?.orderBy) {
      const { column, ascending = true } = options.orderBy;
      items.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[column] as string | number;
        const bVal = (b as Record<string, unknown>)[column] as string | number;
        if (aVal < bVal) return ascending ? -1 : 1;
        if (aVal > bVal) return ascending ? 1 : -1;
        return 0;
      });
    }
    
    if (options?.offset) {
      items = items.slice(options.offset);
    }
    
    if (options?.limit) {
      items = items.slice(0, options.limit);
    }
    
    return items;
  }

  async findById(id: string): Promise<T | null> {
    const supabase = getSupabaseClient();
    
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from(this.tableName)
          .select('*')
          .eq('id', id)
          .single();
        
        if (!error && data) {
          return data as T;
        }
      } catch (err) {
        console.warn(`Supabase findById failed for ${this.tableName}, falling back to local:`, err);
      }
    }
    
    const items = (await getLocalTable(this.tableName)) as unknown as T[];
    return items.find(item => item.id === id) || null;
  }

  // 创建：先写 Supabase，成功后同步本地
  async create(data: Partial<T> & Record<string, unknown>): Promise<T> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const record = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    } as unknown as T;

    const supabase = getSupabaseClient();
    
    if (supabase) {
      try {
        const { data: created, error } = await supabase
          .from(this.tableName)
          .insert(record)
          .select()
          .single();
        
        if (error) {
          if (!shouldFallbackToLocal(error.message)) {
            throw new Error(`Supabase insert failed: ${error.message}`);
          }
          console.warn(`Supabase insert failed for ${this.tableName}, falling back to local:`, error.message);
        } else if (created) {
          await this.syncToLocal(created as T);
          return created as T;
        }
      } catch (err) {
        if (!shouldFallbackToLocal(err)) {
          console.error(`Failed to create in Supabase for ${this.tableName}:`, err);
          throw err;
        }
        console.warn(`Supabase create error for ${this.tableName}, falling back to local:`, err);
      }
    }
    
    // 降级到本地
    await this.syncToLocal(record);
    return record;
  }

  // 更新：先写 Supabase，成功后同步本地
  async update(id: string, data: Partial<T>): Promise<T | null> {
    const now = new Date().toISOString();
    const updateData = { ...data, updated_at: now };
    delete (updateData as Record<string, unknown>).id;
    delete (updateData as Record<string, unknown>).created_at;

    const supabase = getSupabaseClient();
    
    if (supabase) {
      try {
        const { data: updated, error } = await supabase
          .from(this.tableName)
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (error) {
          if (!shouldFallbackToLocal(error.message)) {
            throw new Error(`Supabase update failed: ${error.message}`);
          }
          console.warn(`Supabase update failed for ${this.tableName}, falling back to local:`, error.message);
        } else if (updated) {
          await this.updateLocal(id, updated as T);
          return updated as T;
        }
      } catch (err) {
        if (!shouldFallbackToLocal(err)) {
          console.error(`Failed to update in Supabase for ${this.tableName}:`, err);
          throw err;
        }
        console.warn(`Supabase update error for ${this.tableName}, falling back to local:`, err);
      }
    }
    
    // 降级到本地
    return this.updateLocal(id, updateData as Partial<T>);
  }

  // 删除：先删 Supabase，成功后同步本地
  async delete(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    
    if (supabase) {
      try {
        const { error } = await supabase
          .from(this.tableName)
          .delete()
          .eq('id', id);
        
        if (error) {
          if (!shouldFallbackToLocal(error.message)) {
            throw new Error(`Supabase delete failed: ${error.message}`);
          }
          console.warn(`Supabase delete failed for ${this.tableName}, falling back to local:`, error.message);
        } else {
          await this.deleteLocal(id);
          return true;
        }
      } catch (err) {
        if (!shouldFallbackToLocal(err)) {
          console.error(`Failed to delete in Supabase for ${this.tableName}:`, err);
          throw err;
        }
        console.warn(`Supabase delete error for ${this.tableName}, falling back to local:`, err);
      }
    }
    
    // 降级到本地
    await this.deleteLocal(id);
    return true;
  }

  // 本地同步方法
  private async syncToLocal(record: T): Promise<void> {
    const db = await readLocalDatabase();
    const items = db[this.tableName] as unknown as T[];
    const existingIndex = items.findIndex(item => item.id === record.id);
    
    if (existingIndex >= 0) {
      items[existingIndex] = record;
    } else {
      items.push(record);
    }
    
    await writeLocalDatabase(db);
  }

  private async updateLocal(id: string, data: Partial<T>): Promise<T | null> {
    const db = await readLocalDatabase();
    const items = db[this.tableName] as unknown as T[];
    const index = items.findIndex(item => item.id === id);
    
    if (index < 0) return null;
    
    items[index] = { ...items[index], ...data };
    await writeLocalDatabase(db);
    return items[index];
  }

  private async deleteLocal(id: string): Promise<void> {
    const db = await readLocalDatabase();
    const items = db[this.tableName] as unknown as T[];
    const index = items.findIndex(item => item.id === id);
    
    if (index >= 0) {
      items.splice(index, 1);
      await writeLocalDatabase(db);
    }
  }

  // 批量操作
  async createMany(records: Array<Partial<T> & Record<string, unknown>>): Promise<T[]> {
    const results: T[] = [];
    for (const record of records) {
      results.push(await this.create(record));
    }
    return results;
  }

  // 批量删除 - 按条件
  async deleteMany(filters: Record<string, unknown>): Promise<number> {
    const supabase = getSupabaseClient();
    let deletedCount = 0;
    
    if (supabase) {
      try {
        let query = supabase.from(this.tableName).delete();
        
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        }
        
        const { error, count } = await query.select('id');
        
        if (error) {
          if (!shouldFallbackToLocal(error.message)) {
            throw new Error(`Supabase deleteMany failed: ${error.message}`);
          }
          console.warn(`Supabase deleteMany failed for ${this.tableName}, falling back to local:`, error.message);
        } else {
          deletedCount = count || 0;
          // 同步删除本地数据
          await this.deleteManyLocal(filters);
          return deletedCount;
        }
      } catch (err) {
        if (!shouldFallbackToLocal(err)) {
          console.error(`Failed to deleteMany in Supabase for ${this.tableName}:`, err);
          throw err;
        }
        console.warn(`Supabase deleteMany error for ${this.tableName}, falling back to local:`, err);
      }
    }
    
    // 降级到本地
    return this.deleteManyLocal(filters);
  }

  // 本地批量删除
  private async deleteManyLocal(filters: Record<string, unknown>): Promise<number> {
    const db = await readLocalDatabase();
    const items = db[this.tableName] as unknown as T[];
    const originalLength = items.length;
    
    const remaining = items.filter(item => {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && (item as Record<string, unknown>)[key] === value) {
          return false;
        }
      }
      return true;
    });
    
    (db[this.tableName] as unknown as T[]).length = 0;
    (db[this.tableName] as unknown as T[]).push(...remaining);
    await writeLocalDatabase(db);
    
    return originalLength - remaining.length;
  }

  async count(filters?: Record<string, unknown>): Promise<number> {
    const supabase = getSupabaseClient();
    
    if (supabase) {
      try {
        let query = supabase.from(this.tableName).select('*', { count: 'exact', head: true });
        
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null) {
              query = query.eq(key, value);
            }
          }
        }
        
        const { count, error } = await query;
        
        if (!error && count !== null) {
          return count;
        }
      } catch (err) {
        console.warn(`Supabase count failed for ${this.tableName}, falling back to local:`, err);
      }
    }
    
    const items = await this.findAll({ filters });
    return items.length;
  }
}

// 导出各表的仓库实例
export const projectRepository = new DualWriteRepository<Project>('projects');
export const chapterRepository = new DualWriteRepository<Chapter>('chapters');
export const literatureRepository = new DualWriteRepository<Literature>('literature');
export const documentRepository = new DualWriteRepository<Document>('documents');
export const agentSessionRepository = new DualWriteRepository<AgentSession>('agent_sessions');
export const agentMessageRepository = new DualWriteRepository<AgentMessage>('agent_messages');
export const tempAssetRepository = new DualWriteRepository<TempAsset>('temp_assets');
export const settingRepository = new DualWriteRepository<Setting>('settings');

// 设置专用方法
export async function getSetting(category: string, key: string): Promise<unknown> {
  const supabase = getSupabaseClient();
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('category', category)
        .eq('key', key)
        .single();
      
      if (!error && data) {
        return data.value;
      }
    } catch {
      // 降级到本地
    }
  }
  
  const settings = await getLocalTable('settings');
  const setting = settings.find(s => s.category === category && s.key === key);
  return setting?.value;
}

export async function setSetting(category: string, key: string, value: unknown, description?: string): Promise<void> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  if (supabase) {
    const { error } = await supabase
      .from('settings')
      .upsert({
        category,
        key,
        value,
        description,
        updated_at: now,
      }, {
        onConflict: 'category,key',
      });
    
    if (error) {
      throw new Error(`Failed to save setting: ${error.message}`);
    }
  }
  
  // 同步到本地
  const db = await readLocalDatabase();
  const index = db.settings.findIndex(s => s.category === category && s.key === key);
  
  const setting: Setting = {
    id: index >= 0 ? db.settings[index].id : uuidv4(),
    category,
    key,
    value,
    description: description || null,
    created_at: index >= 0 ? db.settings[index].created_at : now,
    updated_at: now,
  };
  
  if (index >= 0) {
    db.settings[index] = setting;
  } else {
    db.settings.push(setting);
  }
  
  await writeLocalDatabase(db);
}

export async function getSettingsByCategory(category: string): Promise<Record<string, unknown>> {
  const supabase = getSupabaseClient();
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .eq('category', category);
      
      if (!error && data) {
        return data.reduce((acc, item) => {
          acc[item.key] = item.value;
          return acc;
        }, {} as Record<string, unknown>);
      }
    } catch {
      // 降级到本地
    }
  }
  
  const settings = await getLocalTable('settings');
  return settings
    .filter(s => s.category === category)
    .reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {} as Record<string, unknown>);
}
