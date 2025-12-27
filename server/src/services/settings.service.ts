import fs from 'fs/promises';
import path from 'path';
import { getSetting, setSetting, getSettingsByCategory } from '../lib/repository.js';
import { encrypt, decrypt, maskSecret } from '../lib/crypto.js';
import { config } from '../config/index.js';
import { testSupabaseConnection } from '../lib/supabase.js';

// 通用设置
export interface GeneralSettings {
  language: string;
  theme: 'light' | 'dark';
  density: 'compact' | 'standard' | 'comfortable';
}

// 模型端点配置
export interface ModelEndpoint {
  id: string;
  name: string;
  protocol: 'openai' | 'anthropic' | 'google';
  base_url: string;
  api_key: string;        // 加密存储，返回时掩码
  api_key_masked?: string; // 返回给前端的掩码
  default_model: string;
  is_preset: boolean;
  enabled: boolean;
}

// 模型配置
export interface ModelSettings {
  default_endpoint_id: string;
  endpoints: ModelEndpoint[];
}

// 数据源配置
export interface DatasourceSettings {
  wos: {
    enabled: boolean;
    api_key?: string;
    api_key_masked?: string;
  };
  scopus: {
    enabled: boolean;
    api_key?: string;
    api_key_masked?: string;
    insttoken?: string;
    insttoken_masked?: string;
  };
}

export interface StorageSettings {
  data_dir: string;
  auto_backup: boolean;
}

export interface EnvironmentInfo {
  node_version: string;
  platform: string;
  arch: string;
  data_dir: string;
  data_dir_exists: boolean;
  data_dir_size: string;
  supabase_connected: boolean;
  llm_configured: boolean;
  default_endpoint: string;
}

// 预设端点（不再预设模型列表，由用户自行输入）
const PRESET_ENDPOINTS: Omit<ModelEndpoint, 'api_key' | 'enabled'>[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    base_url: 'https://api.openai.com/v1',
    default_model: '',
    is_preset: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    base_url: 'https://api.anthropic.com',
    default_model: '',
    is_preset: true,
  },
  {
    id: 'google',
    name: 'Google Gemini',
    protocol: 'google',
    base_url: 'https://generativelanguage.googleapis.com',
    default_model: '',
    is_preset: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai',
    base_url: 'https://api.deepseek.com/v1',
    default_model: '',
    is_preset: true,
  },
  {
    id: 'qwen',
    name: '通义千问',
    protocol: 'openai',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: '',
    is_preset: true,
  },
  {
    id: 'ark',
    name: '火山引擎',
    protocol: 'openai',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    default_model: '',
    is_preset: true,
  },
  {
    id: 'bailian',
    name: '阿里云百炼',
    protocol: 'openai',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: '',
    is_preset: true,
  },
];

class SettingsService {
  // 通用设置
  async getGeneral(): Promise<GeneralSettings> {
    const settings = await getSettingsByCategory('general');
    return {
      language: (settings.language as string) || 'zh-CN',
      theme: (settings.theme as 'light' | 'dark') || 'light',
      density: (settings.density as 'compact' | 'standard' | 'comfortable') || 'standard',
    };
  }

  async updateGeneral(data: Partial<GeneralSettings>): Promise<GeneralSettings> {
    if (data.language !== undefined) {
      await setSetting('general', 'language', data.language, '界面语言');
    }
    if (data.theme !== undefined) {
      await setSetting('general', 'theme', data.theme, '主题模式');
    }
    if (data.density !== undefined) {
      await setSetting('general', 'density', data.density, '界面密度');
    }
    return this.getGeneral();
  }

  // 模型配置
  async getModel(): Promise<ModelSettings> {
    const settings = await getSettingsByCategory('model');
    const savedEndpoints = (settings.endpoints as ModelEndpoint[]) || [];
    
    // 合并预设端点和保存的配置
    const endpoints: ModelEndpoint[] = PRESET_ENDPOINTS.map(preset => {
      const saved = savedEndpoints.find(e => e.id === preset.id);
      const envKey = this.getEnvApiKey(preset.id);
      const apiKey = saved?.api_key ? decrypt(saved.api_key) : envKey;
      
      return {
        ...preset,
        api_key: '', // 不返回明文
        api_key_masked: apiKey ? maskSecret(apiKey) : '',
        enabled: saved?.enabled ?? !!envKey,
        default_model: saved?.default_model || preset.default_model || this.getEnvModel(preset.id),
      };
    });

    // 添加自定义端点
    const customEndpoints = savedEndpoints.filter(e => !e.is_preset);
    for (const custom of customEndpoints) {
      const apiKey = custom.api_key ? decrypt(custom.api_key) : '';
      endpoints.push({
        ...custom,
        api_key: '',
        api_key_masked: apiKey ? maskSecret(apiKey) : '',
      });
    }

    return {
      default_endpoint_id: (settings.default_endpoint_id as string) || this.getDefaultEndpointId(endpoints),
      endpoints,
    };
  }

  async updateModel(data: {
    default_endpoint_id?: string;
    endpoint?: Partial<ModelEndpoint> & { id: string };
    delete_endpoint_id?: string;
  }): Promise<ModelSettings> {
    const settings = await getSettingsByCategory('model');
    let endpoints = (settings.endpoints as ModelEndpoint[]) || [];

    if (data.default_endpoint_id !== undefined) {
      await setSetting('model', 'default_endpoint_id', data.default_endpoint_id, '默认模型端点');
    }

    if (data.endpoint) {
      const { id, api_key, ...rest } = data.endpoint;
      const existingIndex = endpoints.findIndex(e => e.id === id);
      
      const endpointData: Partial<ModelEndpoint> = { ...rest, id };
      if (api_key) {
        endpointData.api_key = encrypt(api_key);
      }

      if (existingIndex >= 0) {
        endpoints[existingIndex] = { ...endpoints[existingIndex], ...endpointData };
      } else {
        endpoints.push({
          id,
          name: rest.name || id,
          protocol: rest.protocol || 'openai',
          base_url: rest.base_url || '',
          api_key: api_key ? encrypt(api_key) : '',
          default_model: rest.default_model || '',
          is_preset: rest.is_preset ?? false,
          enabled: rest.enabled ?? true,
        });
      }
      await setSetting('model', 'endpoints', endpoints, '模型端点配置');
    }

    if (data.delete_endpoint_id) {
      endpoints = endpoints.filter(e => e.id !== data.delete_endpoint_id || e.is_preset);
      await setSetting('model', 'endpoints', endpoints, '模型端点配置');
    }

    return this.getModel();
  }

  // 数据源配置
  async getDatasource(): Promise<DatasourceSettings> {
    const settings = await getSettingsByCategory('datasource');
    
    // WOS
    const wosApiKey = settings.wos_api_key 
      ? decrypt(settings.wos_api_key as string) 
      : config.apis.wosApiKey;
    
    // Scopus
    const scopusApiKey = settings.scopus_api_key 
      ? decrypt(settings.scopus_api_key as string) 
      : config.apis.scopusApiKey;
    const scopusInsttoken = settings.scopus_insttoken 
      ? decrypt(settings.scopus_insttoken as string) 
      : config.apis.scopusInsttoken;

    return {
      wos: {
        enabled: (settings.wos_enabled as boolean) ?? !!wosApiKey,
        api_key_masked: wosApiKey ? maskSecret(wosApiKey) : '',
      },
      scopus: {
        enabled: (settings.scopus_enabled as boolean) ?? !!scopusApiKey,
        api_key_masked: scopusApiKey ? maskSecret(scopusApiKey) : '',
        insttoken_masked: scopusInsttoken ? maskSecret(scopusInsttoken) : '',
      },
    };
  }

  async updateDatasource(data: {
    wos?: { enabled?: boolean; api_key?: string };
    scopus?: { enabled?: boolean; api_key?: string; insttoken?: string };
  }): Promise<DatasourceSettings> {
    if (data.wos) {
      if (data.wos.enabled !== undefined) {
        await setSetting('datasource', 'wos_enabled', data.wos.enabled, 'WOS 启用状态');
      }
      if (data.wos.api_key !== undefined) {
        await setSetting('datasource', 'wos_api_key', encrypt(data.wos.api_key), 'WOS API Key');
      }
    }

    if (data.scopus) {
      if (data.scopus.enabled !== undefined) {
        await setSetting('datasource', 'scopus_enabled', data.scopus.enabled, 'Scopus 启用状态');
      }
      if (data.scopus.api_key !== undefined) {
        await setSetting('datasource', 'scopus_api_key', encrypt(data.scopus.api_key), 'Scopus API Key');
      }
      if (data.scopus.insttoken !== undefined) {
        await setSetting('datasource', 'scopus_insttoken', encrypt(data.scopus.insttoken), 'Scopus Insttoken');
      }
    }

    return this.getDatasource();
  }

  // 获取实际可用的 API Key（供内部使用）
  async getEffectiveApiKey(endpointId: string): Promise<{ apiKey: string; baseUrl: string; model: string } | null> {
    const settings = await getSettingsByCategory('model');
    const endpoints = (settings.endpoints as ModelEndpoint[]) || [];
    const saved = endpoints.find(e => e.id === endpointId);
    
    // 优先使用数据库配置
    if (saved?.api_key) {
      const apiKey = decrypt(saved.api_key);
      if (apiKey) {
        const preset = PRESET_ENDPOINTS.find(p => p.id === endpointId);
        return {
          apiKey,
          baseUrl: saved.base_url || preset?.base_url || '',
          model: saved.default_model || preset?.default_model || '',
        };
      }
    }

    // 回退到环境变量
    const envKey = this.getEnvApiKey(endpointId);
    if (envKey) {
      return {
        apiKey: envKey,
        baseUrl: this.getEnvBaseUrl(endpointId),
        model: this.getEnvModel(endpointId),
      };
    }

    return null;
  }

  async getEffectiveDatasourceConfig(): Promise<{
    wos: { apiKey: string };
    scopus: { apiKey: string; insttoken: string };
  }> {
    const settings = await getSettingsByCategory('datasource');
    
    const wosApiKey = settings.wos_api_key 
      ? decrypt(settings.wos_api_key as string) 
      : config.apis.wosApiKey;
    
    const scopusApiKey = settings.scopus_api_key 
      ? decrypt(settings.scopus_api_key as string) 
      : config.apis.scopusApiKey;
    const scopusInsttoken = settings.scopus_insttoken 
      ? decrypt(settings.scopus_insttoken as string) 
      : config.apis.scopusInsttoken;

    return {
      wos: { apiKey: wosApiKey },
      scopus: { apiKey: scopusApiKey, insttoken: scopusInsttoken },
    };
  }

  // 存储设置
  async getStorage(): Promise<StorageSettings> {
    const settings = await getSettingsByCategory('storage');
    return {
      data_dir: (settings.data_dir as string) || config.dataDir,
      auto_backup: (settings.auto_backup as boolean) ?? true,
    };
  }

  async updateStorage(data: Partial<StorageSettings>): Promise<StorageSettings> {
    if (data.data_dir !== undefined) {
      await setSetting('storage', 'data_dir', data.data_dir, '本地数据存储目录');
    }
    if (data.auto_backup !== undefined) {
      await setSetting('storage', 'auto_backup', data.auto_backup, '自动备份');
    }
    return this.getStorage();
  }

  // 环境信息
  async getEnvironmentInfo(): Promise<EnvironmentInfo> {
    const dataDir = path.resolve(config.dataDir);
    let dataDirExists = false;
    let dataDirSize = '0 B';
    
    try {
      await fs.access(dataDir);
      dataDirExists = true;
      const totalSize = await this.calculateDirSize(dataDir);
      dataDirSize = this.formatSize(totalSize);
    } catch {
      // 目录不存在
    }
    
    const supabaseConnected = await testSupabaseConnection();
    const modelSettings = await this.getModel();
    const defaultEndpoint = modelSettings.endpoints.find(e => e.id === modelSettings.default_endpoint_id);
    
    return {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      data_dir: dataDir,
      data_dir_exists: dataDirExists,
      data_dir_size: dataDirSize,
      supabase_connected: supabaseConnected,
      llm_configured: !!defaultEndpoint?.api_key_masked,
      default_endpoint: defaultEndpoint?.name || '未配置',
    };
  }

  async testLLMConnection(endpointId?: string): Promise<{ success: boolean; message: string }> {
    const modelSettings = await this.getModel();
    const targetId = endpointId || modelSettings.default_endpoint_id;
    const endpoint = modelSettings.endpoints.find(e => e.id === targetId);
    
    if (!endpoint) {
      return { success: false, message: '未找到指定的模型端点' };
    }

    const effectiveConfig = await this.getEffectiveApiKey(targetId);
    if (!effectiveConfig?.apiKey) {
      return { success: false, message: `${endpoint.name} API Key 未配置` };
    }

    return { success: true, message: `${endpoint.name} 配置有效` };
  }

  async getAllSettings() {
    const [general, model, datasource, storage, environment] = await Promise.all([
      this.getGeneral(),
      this.getModel(),
      this.getDatasource(),
      this.getStorage(),
      this.getEnvironmentInfo(),
    ]);
    return { general, model, datasource, storage, environment };
  }

  // 辅助方法
  private getEnvApiKey(endpointId: string): string {
    const map: Record<string, string> = {
      openai: config.llm.openai.apiKey,
      anthropic: config.llm.anthropic.apiKey,
      google: config.llm.google.apiKey,
      ark: config.llm.ark.apiKey,
      deepseek: '', // 需要用户配置
      qwen: '',
      bailian: '',
    };
    return map[endpointId] || '';
  }

  private getEnvBaseUrl(endpointId: string): string {
    const map: Record<string, string> = {
      openai: config.llm.openai.baseUrl,
      ark: config.llm.ark.baseUrl,
    };
    return map[endpointId] || PRESET_ENDPOINTS.find(p => p.id === endpointId)?.base_url || '';
  }

  private getEnvModel(endpointId: string): string {
    const map: Record<string, string> = {
      openai: config.llm.openai.model,
      anthropic: config.llm.anthropic.model,
      google: config.llm.google.model,
      ark: config.llm.ark.model,
    };
    return map[endpointId] || '';
  }

  private getDefaultEndpointId(endpoints: ModelEndpoint[]): string {
    // 优先使用环境变量配置的默认提供商
    if (config.llm.defaultProvider) {
      const envDefault = endpoints.find(e => e.id === config.llm.defaultProvider && e.api_key_masked);
      if (envDefault) return envDefault.id;
    }
    // 否则使用第一个有配置的端点
    const configured = endpoints.find(e => e.api_key_masked);
    return configured?.id || 'openai';
  }

  private async calculateDirSize(dir: string): Promise<number> {
    let size = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          size += await this.calculateDirSize(fullPath);
        } else {
          const stat = await fs.stat(fullPath);
          size += stat.size;
        }
      }
    } catch {
      // 忽略权限错误
    }
    return size;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

export const settingsService = new SettingsService();
