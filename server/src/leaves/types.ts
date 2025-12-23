import type { ScriptNode, ExecutionContext } from '../services/deepreference/recode.types.js';
import type { CreateTempAsset } from '../types/database.js';

export interface ToolInput {
  node: ScriptNode;
  ctx: ExecutionContext;
}

export interface ToolResult {
  output?: unknown;
  tempAssets?: CreateTempAsset[];
  messagesToUser?: string[];
  pause?: boolean;
}

export type ToolFn = (input: ToolInput) => Promise<ToolResult>;
