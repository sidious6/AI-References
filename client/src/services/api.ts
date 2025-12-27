const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

// 获取存储的 token
function getAuthToken(): string | null {
  try {
    const storage = localStorage.getItem('auth-storage');
    if (storage) {
      const parsed = JSON.parse(storage);
      return parsed.state?.token || null;
    }
  } catch {
    // ignore
  }
  return null;
}

// 清除认证信息并跳转到登录页
function handleUnauthorized() {
  try {
    const storage = localStorage.getItem('auth-storage');
    if (storage) {
      const parsed = JSON.parse(storage);
      parsed.state = { user: null, token: null, isAuthenticated: false };
      localStorage.setItem('auth-storage', JSON.stringify(parsed));
    }
  } catch {
    localStorage.removeItem('auth-storage');
  }
  // 跳转到登录页
  if (window.location.pathname !== '/auth') {
    window.location.href = '/auth';
  }
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${endpoint}`;
  const token = getAuthToken();
  
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      // 处理 401 未授权错误
      if (response.status === 401) {
        handleUnauthorized();
      }
      return {
        success: false,
        error: data.error || data.message || `HTTP ${response.status}`,
      };
    }
    
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// Project API
export interface Project {
  id: string;
  name: string;
  description?: string;
  domain?: string;
  status: 'researching' | 'searching' | 'screening' | 'writing' | 'completed';
  tags: string[];
  literature_count: number;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  domain?: string;
  tags?: string[];
}

export const projectApi = {
  list: (params?: { status?: string; domain?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.domain) query.set('domain', params.domain);
    if (params?.search) query.set('search', params.search);
    const queryStr = query.toString();
    return request<Project[]>(`/projects${queryStr ? `?${queryStr}` : ''}`);
  },
  
  getById: (id: string) => request<Project>(`/projects/${id}`),
  
  getStats: (id: string) => request<{
    literature_count: number;
    document_count: number;
    chapter_count: number;
    ai_literature_count: number;
    user_literature_count: number;
  }>(`/projects/${id}/stats`),
  
  getDomains: () => request<string[]>('/projects/domains'),
  
  create: (data: CreateProjectInput) => 
    request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: Partial<CreateProjectInput>) =>
    request<Project>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),
};

// Literature API
export interface Literature {
  id: string;
  project_id: string;
  chapter_id?: string;
  search_query_id?: string;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  abstract?: string;
  keywords: string[];
  source: 'ai' | 'user';
  source_database?: string;
  status: 'approved' | 'rejected' | 'pending';
  ai_summary?: string;
  ai_relevance_score?: number;
  ai_inclusion_reason?: string;
  file_path?: string;
  file_url?: string;
  bibtex?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateLiteratureInput {
  title: string;
  authors?: string[];
  year?: number;
  journal?: string;
  doi?: string;
  abstract?: string;
  keywords?: string[];
  source?: 'ai' | 'user';
  bibtex?: string;
}

export const literatureApi = {
  list: (projectId: string, params?: { 
    source?: string; 
    status?: string; 
    chapter_id?: string;
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.source) query.set('source', params.source);
    if (params?.status) query.set('status', params.status);
    if (params?.chapter_id) query.set('chapter_id', params.chapter_id);
    if (params?.search) query.set('search', params.search);
    const queryStr = query.toString();
    return request<Literature[]>(`/projects/${projectId}/literature${queryStr ? `?${queryStr}` : ''}`);
  },
  
  getById: (id: string) => request<Literature>(`/literature/${id}`),
  
  getStats: (projectId: string) => request<{
    total: number;
    by_source: { ai: number; user: number };
    by_status: { approved: number; rejected: number; pending: number };
  }>(`/projects/${projectId}/literature/stats`),
  
  create: (projectId: string, data: CreateLiteratureInput) =>
    request<Literature>(`/projects/${projectId}/literature`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  importBibtex: (projectId: string, bibtex: string) =>
    request<{ imported: number; failed: number }>(`/projects/${projectId}/literature/import`, {
      method: 'POST',
      body: JSON.stringify({ bibtex }),
    }),
  
  update: (id: string, data: Partial<CreateLiteratureInput>) =>
    request<Literature>(`/literature/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  updateStatus: (id: string, status: 'approved' | 'rejected' | 'pending') =>
    request<Literature>(`/literature/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  
  assignChapter: (id: string, chapterId: string | null) =>
    request<Literature>(`/literature/${id}/chapter`, {
      method: 'PATCH',
      body: JSON.stringify({ chapter_id: chapterId }),
    }),
  
  delete: (id: string) =>
    request<void>(`/literature/${id}`, { method: 'DELETE' }),
};

// Document API
export interface Document {
  id: string;
  project_id: string;
  chapter_id?: string;
  name: string;
  original_name: string;
  type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'image' | 'other';
  mime_type?: string;
  size: number;
  file_path?: string;
  storage_url?: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  extracted_text?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const documentApi = {
  list: (projectId: string, params?: { 
    type?: string; 
    chapter_id?: string;
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.chapter_id) query.set('chapter_id', params.chapter_id);
    if (params?.search) query.set('search', params.search);
    const queryStr = query.toString();
    return request<Document[]>(`/projects/${projectId}/documents${queryStr ? `?${queryStr}` : ''}`);
  },
  
  getById: (id: string) => request<Document>(`/documents/${id}`),
  
  getStats: (projectId: string) => request<{
    total: number;
    by_type: Record<string, number>;
    total_size: number;
  }>(`/projects/${projectId}/documents/stats`),
  
  upload: async (projectId: string, file: File, chapterId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (chapterId) formData.append('chapter_id', chapterId);
    
    const url = `${API_BASE}/projects/${projectId}/documents/upload`;
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  },
  
  download: async (id: string) => {
    const url = `${API_BASE}/documents/${id}/download`;
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'download';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^;\n"']+)/i);
        if (match) {
          filename = decodeURIComponent(match[1]);
        }
      }
      // 创建下载链接
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  },
  
  update: (id: string, data: { name?: string }) =>
    request<Document>(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  assignChapter: (id: string, chapterId: string | null) =>
    request<Document>(`/documents/${id}/chapter`, {
      method: 'PATCH',
      body: JSON.stringify({ chapter_id: chapterId }),
    }),
  
  delete: (id: string) =>
    request<void>(`/documents/${id}`, { method: 'DELETE' }),
};

// Chapter API
export interface Chapter {
  id: string;
  project_id: string;
  parent_id?: string;
  title: string;
  description?: string;
  sort_order: number;
  depth: number;
  created_at: string;
  updated_at: string;
  children?: Chapter[];
}

export interface CreateChapterInput {
  title: string;
  description?: string;
  parent_id?: string;
  sort_order?: number;
}

export const chapterApi = {
  getTree: (projectId: string) => 
    request<Chapter[]>(`/projects/${projectId}/chapters/tree`),
  
  list: (projectId: string) =>
    request<Chapter[]>(`/projects/${projectId}/chapters`),
  
  getById: (id: string) => request<Chapter>(`/chapters/${id}`),
  
  create: (projectId: string, data: CreateChapterInput) =>
    request<Chapter>(`/projects/${projectId}/chapters`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: Partial<CreateChapterInput>) =>
    request<Chapter>(`/chapters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  reorder: (id: string, sortOrder: number, parentId?: string | null) =>
    request<Chapter>(`/chapters/${id}/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ sort_order: sortOrder, parent_id: parentId }),
    }),
  
  delete: (id: string) =>
    request<void>(`/chapters/${id}`, { method: 'DELETE' }),
};

// Settings API
export interface ModelEndpoint {
  id: string;
  name: string;
  protocol: 'openai' | 'anthropic' | 'google';
  base_url: string;
  api_key: string;
  api_key_masked?: string;
  default_model: string;
  is_preset: boolean;
  enabled: boolean;
}

export interface ModelSettings {
  default_endpoint_id: string;
  endpoints: ModelEndpoint[];
}

export interface DatasourceSettings {
  wos: {
    enabled: boolean;
    api_key_masked?: string;
  };
  scopus: {
    enabled: boolean;
    api_key_masked?: string;
    insttoken_masked?: string;
  };
}

export interface GeneralSettings {
  language: string;
  theme: string;
}

export interface StorageSettings {
  data_path: string;
}

export const settingsApi = {
  getAll: () => request<Record<string, any>>('/settings'),
  
  getGeneral: () => request<GeneralSettings>('/settings/general'),
  updateGeneral: (data: Partial<GeneralSettings>) =>
    request<GeneralSettings>('/settings/general', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  getModel: () => request<ModelSettings>('/settings/model'),
  updateModel: (data: {
    default_endpoint_id?: string;
    endpoint?: Partial<ModelEndpoint> & { id: string };
    delete_endpoint_id?: string;
  }) =>
    request<ModelSettings>('/settings/model', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  getDatasource: () => request<DatasourceSettings>('/settings/datasource'),
  updateDatasource: (data: {
    wos?: { enabled?: boolean; api_key?: string };
    scopus?: { enabled?: boolean; api_key?: string; insttoken?: string };
  }) =>
    request<DatasourceSettings>('/settings/datasource', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  getStorage: () => request<StorageSettings>('/settings/storage'),
  updateStorage: (data: Partial<StorageSettings>) =>
    request<StorageSettings>('/settings/storage', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  getEnvironment: () => request<{
    node_version: string;
    platform: string;
    arch: string;
    data_dir: string;
    data_dir_exists: boolean;
    data_dir_size: string;
    supabase_connected: boolean;
    llm_configured: boolean;
    default_endpoint: string;
  }>('/settings/environment'),
  
  testLLM: (endpointId?: string) =>
    request<{ success: boolean; message: string }>('/settings/test-llm', {
      method: 'POST',
      body: JSON.stringify({ endpoint_id: endpointId }),
    }),
};

// Health check
export const healthApi = {
  check: () => request<{ status: string; supabase: string }>('/health'.replace('/api', '')),
};

// Auth API
export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResult {
  user: AuthUser;
  token: string;
}

export const authApi = {
  register: (data: { email: string; password: string; username?: string }) =>
    request<AuthResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMe: () => request<AuthUser>('/auth/me'),

  updateProfile: (data: { username?: string; avatar_url?: string }) =>
    request<AuthUser>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// Agent API
export interface AgentSession {
  id: string;
  project_id: string | null;
  user_id: string | null;
  title: string | null;
  mode: 'human-in-loop' | 'agent';
  model: string | null;
  status: 'active' | 'completed' | 'archived';
  research_topic: string | null;
  research_goal: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface AgentMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls: Record<string, unknown>[] | null;
  tool_call_id: string | null;
  metadata: Record<string, unknown>;
  tokens_used: number | null;
  created_at: string;
  updated_at: string;
}

export interface TempAsset {
  id: string;
  session_id: string;
  type: 'chapter_framework' | 'candidate_literature' | 'search_query' | 'draft';
  title: string | null;
  content: string | null;
  data: Record<string, unknown>;
  synced_to_project: boolean;
  synced_at: string | null;
  synced_project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionWithMessages extends AgentSession {
  messages: AgentMessage[];
  temp_assets?: TempAsset[];
}

export interface CreateSessionInput {
  project_id?: string;
  title?: string;
  mode?: 'human-in-loop' | 'agent';
  model?: string;
  research_topic?: string;
  research_goal?: string;
}

export interface ChatInput {
  content: string;
  provider?: 'ark' | 'openai' | 'google' | 'anthropic';
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export type ChatStreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'status'; content: string }
  | { type: 'done'; content: string }
  | { type: 'error'; error: string };

export const agentApi = {
  // 会话管理
  listSessions: (params?: { project_id?: string; status?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.project_id) query.set('project_id', params.project_id);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.offset) query.set('offset', params.offset.toString());
    const queryStr = query.toString();
    return request<AgentSession[]>(`/agent/sessions${queryStr ? `?${queryStr}` : ''}`);
  },

  getSession: (id: string) => request<SessionWithMessages>(`/agent/sessions/${id}`),

  createSession: (data: CreateSessionInput) =>
    request<AgentSession>('/agent/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSession: (id: string, data: Partial<CreateSessionInput> & { status?: 'active' | 'completed' | 'archived' }) =>
    request<AgentSession>(`/agent/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSession: (id: string) =>
    request<void>(`/agent/sessions/${id}`, { method: 'DELETE' }),

  // 统计
  getStats: () => request<{
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    totalMessages: number;
  }>('/agent/sessions/stats'),

  // 消息
  getMessages: (sessionId: string) =>
    request<AgentMessage[]>(`/agent/sessions/${sessionId}/messages`),

  // 对话（非流式）
  chat: (sessionId: string, data: ChatInput) =>
    request<{ message: AgentMessage; response: string }>(`/agent/sessions/${sessionId}/chat`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 对话（流式）
  chatStream: async function* (sessionId: string, data: ChatInput): AsyncGenerator<ChatStreamEvent> {
    const url = `${API_BASE}/agent/sessions/${sessionId}/chat/stream`;
    const token = getAuthToken();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Stream request failed');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch {
            // ignore parse errors
          }
        }
      }
    }
  },

  // 临时资产
  getTempAssets: (sessionId: string, type?: TempAsset['type']) => {
    const query = type ? `?type=${type}` : '';
    return request<TempAsset[]>(`/agent/sessions/${sessionId}/assets${query}`);
  },

  syncTempAsset: (sessionId: string, assetId: string, projectId: string) =>
    request<TempAsset>(`/agent/sessions/${sessionId}/assets/${assetId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    }),
    
  // 工作流状态
  getWorkflowState: (sessionId: string) =>
    request<WorkflowState>(`/agent/sessions/${sessionId}/workflow`),
    
  updateWorkflowState: (sessionId: string, state: WorkflowState) =>
    request<AgentSession>(`/agent/sessions/${sessionId}/workflow`, {
      method: 'PUT',
      body: JSON.stringify({ workflow_state: state }),
    }),
    
  // 项目选择确认
  confirmProjectSelection: (sessionId: string, data: { 
    confirmationType: string; 
    selectedOption: string; 
    recommendedProjectId?: string;
  }) =>
    request<{ projectId?: string; action: string }>(`/agent/sessions/${sessionId}/confirm-project`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
  // 工作流恢复
  checkWorkflowResumable: (sessionId: string) =>
    request<WorkflowResumeInfo>(`/agent/sessions/${sessionId}/workflow/resumable`),
    
  resumeWorkflow: async function* (sessionId: string, data?: { provider?: string; model?: string }): AsyncGenerator<ChatStreamEvent> {
    const url = `${API_BASE}/agent/sessions/${sessionId}/workflow/resume`;
    const token = getAuthToken();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data || {}),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Resume request failed');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch {
            // ignore parse errors
          }
        }
      }
    }
  },
};

// 工作流恢复信息类型
export interface WorkflowResumeInfo {
  canResume: boolean;
  isActive: boolean;
  lastCompletedStage: number | null;
  lastCompletedStageTitle: string | null;
  interruptedAt: string | null;
  totalStages: number;
  completedStages: number;
  pendingConfirmation?: {
    confirmationType: string;
    message: string;
    options: { id: string; label: string; isDefault?: boolean }[];
    timeout?: number;
    candidates?: { id: string; name: string; score?: number }[];
    recommendedProjectId?: string;
  };
}

// 工作流状态类型
export interface WorkflowState {
  stages: {
    stage: number;
    title: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    nodeId?: string;
    summary?: string;
    error?: string;
    steps: {
      nodeId: string;
      title: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      summary?: string;
      error?: string;
    }[];
  }[];
  currentStage: number | null;
  updatedAt: string;
}
