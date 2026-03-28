import type { AgentSession, TempAsset, CreateTempAsset } from '../../types/database.js';
import type { ChatMessage } from '../../types/llm.js';

export type NodeKind = 'root' | 'stage' | 'goal' | 'strategy' | 'tool';
export type NodeStatus = 'idle' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ScriptNode {
  id: string;
  kind: NodeKind;
  stage?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  title: string;
  description?: string;
  toolName?: string;
  children: ScriptNode[];
  status?: NodeStatus;
  error?: string | null;
  meta?: Record<string, unknown>;
}

export interface ScriptTree {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  root: ScriptNode;
}

export interface ExecutionPreferences {
  targetPaperCount: number;
  timeRange?: { from?: number; to?: number };
  language?: string;
  provider?: string;
  model?: string | null;
}

export interface LiteratureRecord {
  id?: string;
  title: string;
  doi?: string | null;
  authors?: string[];
  year?: number | null;
  abstract?: string;
  keywords?: string[];
  journal?: string;
  source_database?: string;
  uid?: string;
  scopus_id?: string | null;
  search_query?: string;
  citation_count?: number | null;
  document_type?: string | null;
  wos_link?: string | null;
  doi_link?: string | null;
  scopus_link?: string | null;
  full_text_link?: string | null;
  issn?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  affiliation?: string | null;
  source?: string;
  // 筛选阶段添加的字段
  status?: 'approved' | 'rejected' | 'pending' | 'to_fine_screen';
  screening_reason?: string;
  relevant_section?: string;
  ai_relevance_score?: number | null;
  ai_inclusion_reason?: string | null;
  ai_summary?: string | null;
  raw_data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProjectCandidate {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  _matchScore: number;
}

export interface UserConfirmationData {
  confirmationType: string;
  selectedOption: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface PendingProjectAction {
  action: 'create_new' | 'select_existing' | 'select_or_create';
  reason?: string;
  projectId?: string;
  topic?: string;
  recommendedProjectId?: string;
  candidates?: ProjectCandidate[];
  llmAnalysis?: unknown;
}

// handleAwaitingConfirmation 中 result.output 的类型
export interface AwaitingConfirmationOutput {
  action: 'awaiting_confirmation';
  confirmationType: string;
  message?: string;
  options?: { id: string; label: string; isDefault?: boolean }[];
  timeout?: number;
  candidates?: { id: string; name: string; score?: number }[];
  recommendedProjectId?: string;
}

export interface QueryItem {
  section: string;
  query: string;
  source?: string;
  keywords_en?: string[];
}

export interface ParsedDirection {
  research_topic?: string;
  keywords?: string[];
  domain?: string;
  constraints?: string;
}

export interface ExecutionState {
  seenIds: Set<string>;
  historyIds: Set<string>;
  projectExistingIds: Set<string>;
  candidateLiterature: LiteratureRecord[];
  queries: QueryItem[];
  logs: string[];
  tempAssets: CreateTempAsset[];
  // Stage 1: 研究方向解析
  parsedDirection: ParsedDirection | null;
  // Stage 2: 项目匹配
  projectMatches: ProjectCandidate[];
  pendingProjectAction: PendingProjectAction | null;
  userConfirmation: UserConfirmationData | null;
  // Stage 3: 课题分析
  projectDocuments: { id: string; name: string; type?: string; snippet: string | null }[];
  projectImages: { id: string; name: string }[];
  webSearchResults: unknown[];
  webSearchAnalysis: string | null;
  // Stage 4: 文献检索（各 API 原始结果）
  latestRecords: LiteratureRecord[];
  // Stage 4-7: 合并后的文献记录（贯穿筛选、入库、撰写）
  mergedRecords: LiteratureRecord[];
}

export interface ExecutionContext {
  session: AgentSession;
  userId?: string;
  projectId?: string | null;
  preferences: ExecutionPreferences;
  mode: 'human-in-loop' | 'agent';
  state: ExecutionState;
  requestMessages?: ChatMessage[];
}

export type EngineEvent =
  | { type: 'node_started'; nodeId: string; stage?: number; title: string; path: string[] }
  | { type: 'node_completed'; nodeId: string; stage?: number; title: string; path: string[]; output?: unknown; summary?: string }
  | { type: 'node_failed'; nodeId: string; stage?: number; title: string; path: string[]; error: string }
  | { type: 'tool_message'; nodeId: string; stage?: number; title: string; path: string[]; messages: string[] }
  | { type: 'awaiting_confirmation'; nodeId: string; stage?: number; title: string; path: string[]; confirmationType: string; message?: string; options?: UserConfirmationOption[]; timeout?: number; candidates?: { id: string; name: string; score?: number }[]; recommendedProjectId?: string }
  | { type: 'workflow_paused'; nodeId: string; stage?: number; title: string; path: string[]; reason: string }
  | { type: 'final_result'; content: string; tempAssets: CreateTempAsset[] };

export interface UserConfirmationOption {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
}

export interface ToolContext {
  node: ScriptNode;
  ctx: ExecutionContext;
}

export interface ToolResult {
  output?: unknown;
  tempAssets?: CreateTempAsset[];
  messagesToUser?: string[];
  pause?: boolean;
}
