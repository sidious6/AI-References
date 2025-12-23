/**
 * 更新项目配置
 * 返回当前会话的偏好设置
 */
import type { ToolInput, ToolResult } from '../types.js';

export async function updateProjectConfig({ ctx }: ToolInput): Promise<ToolResult> {
  ctx.state.logs.push('获取项目配置');
  return { output: ctx.preferences };
}
