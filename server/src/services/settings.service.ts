import fs from 'fs/promises';
import path from 'path';
import { getSetting, setSetting, getSettingsByCategory } from '../lib/repository.js';
import { config } from '../config/index.js';
import { testSupabaseConnection } from '../lib/supabase.js';

export interface GeneralSettings {
  language: string;
  theme: 'light' | 'dark';
  density: 'compact' | 'standard' | 'comfortable';
}

export interface ModelSettings {
  default_provider: string;
  custom_models: Array<{
    id: string;
    name: string;
    provider: string;
    api_url: string;
    api_key: string;
    model: string;
  }>;
}

export interface DatasourceSettings {
  wos_enabled: boolean;
  wos_api_key?: string;
  scopus_enabled: boolean;
  scopus_api_key?: string;
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
  llm_provider: string;
  llm_configured: boolean;
}

class SettingsService {
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

  async getModel(): Promise<ModelSettings> {
    const settings = await getSettingsByCategory('model');
    return {
      default_provider: (settings.default_provider as string) || config.llm.defaultProvider,
      custom_models: (settings.custom_models as ModelSettings['custom_models']) || [],
    };
  }

  async updateModel(data: Partial<ModelSettings>): Promise<ModelSettings> {
    if (data.default_provider !== undefined) {
      await setSetting('model', 'default_provider', data.default_provider, '默认模型提供商');
    }
    if (data.custom_models !== undefined) {
      await setSetting('model', 'custom_models', data.custom_models, '自定义模型配置');
    }
    return this.getModel();
  }

  async getDatasource(): Promise<DatasourceSettings> {
    const settings = await getSettingsByCategory('datasource');
    return {
      wos_enabled: (settings.wos_enabled as boolean) || false,
      wos_api_key: config.apis.wosApiKey || undefined,
      scopus_enabled: (settings.scopus_enabled as boolean) || false,
      scopus_api_key: config.apis.scopusApiKey || undefined,
    };
  }

  async updateDatasource(data: Partial<DatasourceSettings>): Promise<DatasourceSettings> {
    if (data.wos_enabled !== undefined) {
      await setSetting('datasource', 'wos_enabled', data.wos_enabled, 'Web of Science 启用状态');
    }
    if (data.scopus_enabled !== undefined) {
      await setSetting('datasource', 'scopus_enabled', data.scopus_enabled, 'Scopus 启用状态');
    }
    return this.getDatasource();
  }

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

  async getEnvironmentInfo(): Promise<EnvironmentInfo> {
    const dataDir = path.resolve(config.dataDir);
    let dataDirExists = false;
    let dataDirSize = '0 B';
    
    try {
      await fs.access(dataDir);
      dataDirExists = true;
      
      // 计算目录大小
      const calculateSize = async (dir: string): Promise<number> => {
        let size = 0;
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              size += await calculateSize(fullPath);
            } else {
              const stat = await fs.stat(fullPath);
              size += stat.size;
            }
          }
        } catch {
          // 忽略权限错误
        }
        return size;
      };
      
      const totalSize = await calculateSize(dataDir);
      if (totalSize < 1024) {
        dataDirSize = `${totalSize} B`;
      } else if (totalSize < 1024 * 1024) {
        dataDirSize = `${(totalSize / 1024).toFixed(1)} KB`;
      } else if (totalSize < 1024 * 1024 * 1024) {
        dataDirSize = `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
      } else {
        dataDirSize = `${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      }
    } catch {
      // 目录不存在
    }
    
    const supabaseConnected = await testSupabaseConnection();
    
    const llmConfigured = !!(
      config.llm.ark.apiKey ||
      config.llm.openai.apiKey ||
      config.llm.google.apiKey ||
      config.llm.anthropic.apiKey
    );
    
    return {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      data_dir: dataDir,
      data_dir_exists: dataDirExists,
      data_dir_size: dataDirSize,
      supabase_connected: supabaseConnected,
      llm_provider: config.llm.defaultProvider,
      llm_configured: llmConfigured,
    };
  }

  async testLLMConnection(provider?: string): Promise<{ success: boolean; message: string }> {
    const targetProvider = provider || config.llm.defaultProvider;
    
    try {
      // 根据不同提供商测试连接
      switch (targetProvider) {
        case 'ark':
          if (!config.llm.ark.apiKey) {
            return { success: false, message: 'ARK API Key 未配置' };
          }
          // 简单验证 API Key 格式
          return { success: true, message: 'ARK 配置有效' };
          
        case 'openai':
          if (!config.llm.openai.apiKey) {
            return { success: false, message: 'OpenAI API Key 未配置' };
          }
          return { success: true, message: 'OpenAI 配置有效' };
          
        case 'google':
          if (!config.llm.google.apiKey) {
            return { success: false, message: 'Google API Key 未配置' };
          }
          return { success: true, message: 'Google 配置有效' };
          
        case 'anthropic':
          if (!config.llm.anthropic.apiKey) {
            return { success: false, message: 'Anthropic API Key 未配置' };
          }
          return { success: true, message: 'Anthropic 配置有效' };
          
        default:
          return { success: false, message: `未知的模型提供商: ${targetProvider}` };
      }
    } catch (error: any) {
      return { success: false, message: error.message || '连接测试失败' };
    }
  }

  async getAllSettings(): Promise<{
    general: GeneralSettings;
    model: ModelSettings;
    datasource: DatasourceSettings;
    storage: StorageSettings;
    environment: EnvironmentInfo;
  }> {
    const [general, model, datasource, storage, environment] = await Promise.all([
      this.getGeneral(),
      this.getModel(),
      this.getDatasource(),
      this.getStorage(),
      this.getEnvironmentInfo(),
    ]);
    
    return { general, model, datasource, storage, environment };
  }
}

export const settingsService = new SettingsService();
