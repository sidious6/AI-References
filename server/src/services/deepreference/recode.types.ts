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

export interface ExecutionState {
  seenIds: Set<string>;
  historyIds: Set<string>;
  projectExistingIds: Set<string>;
  candidateLiterature: any[];
  queries: { section: string; query: string; source: string }[];
  logs: string[];
  tempAssets: CreateTempAsset[];
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
  | { type: 'user_confirmation_required'; nodeId: string; stage?: number; title: string; message: string; options: UserConfirmationOption[]; timeout?: number }
  | { type: 'awaiting_confirmation'; nodeId: string; stage?: number; title: string; path: string[]; confirmationType: string; message?: string; options?: UserConfirmationOption[]; timeout?: number; candidates?: any[]; recommendedProjectId?: string }
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
