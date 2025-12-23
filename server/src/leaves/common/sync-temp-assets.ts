/**
 * 同步临时资产
 * 将会话中的临时资产同步到项目
 */
import type { ToolInput, ToolResult } from '../types.js';
import { agentService } from '../../services/agent.service.js';

export async function syncTempAssets({ ctx }: ToolInput): Promise<ToolResult> {
  const projectId = ctx.projectId || ctx.session.project_id;
  if (!projectId) {
    ctx.state.logs.push('临时资产同步跳过: 未绑定项目');
    return { output: 0 };
  }
  
  let count = 0;
  const assets = await agentService.getTempAssets(ctx.session.id);
  
  for (const asset of assets) {
    const updated = await agentService.syncTempAssetToProject(asset.id, projectId);
    if (updated) count += 1;
  }
  
  ctx.state.logs.push(`临时资产同步: ${count} 个`);
  return { output: count };
}
