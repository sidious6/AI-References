// 数据库类型定义

export interface User {
  id: string;
  email: string;
  password_hash: string;
  username: string | null;
  avatar_url: string | null;
  status: 'active' | 'inactive' | 'banned';
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  domain: string | null;
  status: 'researching' | 'searching' | 'screening' | 'writing' | 'completed';
  tags: string[];
  literature_count: number;
  document_count: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  depth: number;
  created_at: string;
  updated_at: string;
}

export interface Literature {
  id: string;
  project_id: string;
  chapter_id: string | null;
  search_query_id: string | null;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  abstract: string | null;
  keywords: string[];
  source: 'ai' | 'user';
  source_database: string | null;
  status: 'approved' | 'rejected' | 'pending';
  ai_summary: string | null;
  ai_relevance_score: number | null;
  ai_inclusion_reason: string | null;
  file_path: string | null;
  file_url: string | null;
  bibtex: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  project_id: string;
  chapter_id: string | null;
  name: string;
  original_name: string;
  type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'image' | 'other';
  mime_type: string | null;
  size: number;
  file_path: string | null;
  storage_url: string | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  extracted_text: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStageStep {
  nodeId: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary?: string;
  error?: string;
}

export interface WorkflowStage {
  stage: number;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  nodeId?: string;
  summary?: string;
  error?: string;
  steps: WorkflowStageStep[];
}

export interface WorkflowCheckpoint {
  lastCompletedStage: number | null;
  tempAssetIds: string[];
  executionState: {
    seenIds: string[];
    historyIds: string[];
    projectExistingIds: string[];
    candidateLiteratureCount: number;
    queriesCount: number;
  };
  savedAt: string;
  pauseReason?: string;
}

// 待确认请求信息
export interface PendingConfirmation {
  confirmationType: string;
  message: string;
  options: { id: string; label: string; isDefault?: boolean }[];
  timeout?: number;
  candidates?: { id: string; name: string; score?: number }[];
  recommendedProjectId?: string;
  createdAt: string;
}

export interface WorkflowState {
  stages: WorkflowStage[];
  currentStage: number | null;
  updatedAt: string;
  checkpoint?: WorkflowCheckpoint;
  isInterrupted?: boolean;
  interruptedAt?: string;
  pendingConfirmation?: PendingConfirmation;  // 待确认请求
}

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
  workflow_state: WorkflowState | null;
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

export interface Setting {
  id: string;
  category: string;
  key: string;
  value: unknown;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// 创建/更新时的输入类型
export type CreateUser = Omit<User, 'id' | 'status' | 'last_login_at' | 'created_at' | 'updated_at'>;
export type UpdateUser = Partial<Omit<CreateUser, 'email' | 'password_hash'>>;

export type CreateProject = Omit<Project, 'id' | 'literature_count' | 'document_count' | 'created_at' | 'updated_at'>;
export type UpdateProject = Partial<CreateProject>;

export type CreateChapter = Omit<Chapter, 'id' | 'created_at' | 'updated_at'>;
export type UpdateChapter = Partial<Omit<CreateChapter, 'project_id'>>;

export type CreateLiterature = Omit<Literature, 'id' | 'created_at' | 'updated_at'>;
export type UpdateLiterature = Partial<Omit<CreateLiterature, 'project_id'>>;

export type CreateDocument = Omit<Document, 'id' | 'created_at' | 'updated_at'>;
export type UpdateDocument = Partial<Omit<CreateDocument, 'project_id'>>;

export type CreateAgentSession = Omit<AgentSession, 'id' | 'message_count' | 'created_at' | 'updated_at'>;
export type UpdateAgentSession = Partial<CreateAgentSession>;

export type CreateAgentMessage = Omit<AgentMessage, 'id' | 'created_at' | 'updated_at'>;

export type CreateTempAsset = Omit<TempAsset, 'id' | 'created_at' | 'updated_at'>;
export type UpdateTempAsset = Partial<Omit<CreateTempAsset, 'session_id'>>;

// 本地存储数据结构
export interface LocalDatabase {
  projects: Project[];
  chapters: Chapter[];
  literature: Literature[];
  documents: Document[];
  agent_sessions: AgentSession[];
  agent_messages: AgentMessage[];
  temp_assets: TempAsset[];
  settings: Setting[];
  _meta: {
    version: number;
    last_synced: string | null;
  };
}
