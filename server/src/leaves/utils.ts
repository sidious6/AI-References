/**
 * Leaves 工具函数
 * 提供 LLM 调用和 Prompt 加载功能
 */
import { llmService } from '../services/llm.service.js';
import type { ChatMessage } from '../types/llm.js';
import { config } from '../config/index.js';
import { PROMPTS, type PromptKey } from '../prompts/index.js';

/**
 * 获取集中管理的 Prompt
 * @param key Prompt 键名
 * @returns Prompt 内容
 */
export function getPrompt(key: PromptKey): string {
  return PROMPTS[key];
}

/**
 * 调用 LLM 服务
 * @param messages 消息列表
 * @param model 可选的模型名称
 * @returns LLM 响应
 */
export async function callLLM(messages: ChatMessage[], model?: string) {
  const provider = (config.llm.defaultProvider || 'ark') as any;
  return llmService.chat(provider, { model, messages });
}
