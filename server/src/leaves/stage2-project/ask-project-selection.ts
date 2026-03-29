/**
 * 项目选择决策
 * 无论匹配结果如何，都让用户选择：使用现有项目 或 创建新项目
 */
import type { ToolInput, ToolResult } from '../types.js';
import { agentSessionRepository } from '../../lib/repository.js';
import { llmService } from '../../services/llm.service.js';
import { PROMPTS } from '../../prompts/index.js';
import type { ProjectCandidate } from '../../services/deepreference/recode.types.js';

interface LLMMatchResult {
  matched: boolean;
  matchedProjectId: string | null;
  confidence: number;
  reason: string;
}

// 调用大模型进行项目匹配分析（仅用于排序推荐，不自动绑定）
async function llmMatchProject(
  topic: string,
  candidates: ProjectCandidate[]
): Promise<LLMMatchResult | null> {
  try {
    const providers = await llmService.getAvailableProviders();
    if (providers.length === 0) {
      console.log('[项目匹配] 无可用 LLM，跳过语义分析');
      return null;
    }

    const candidatesInfo = candidates.map((c, i) => ({
      index: i + 1,
      id: c.id,
      name: c.name,
      description: c.description || '无描述',
      similarityScore: c._matchScore.toFixed(2),
    }));

    const userMessage = `用户输入的研究主题：
"${topic}"

候选项目列表（已按相似度排序）：
${JSON.stringify(candidatesInfo, null, 2)}

请分析用户输入与候选项目的匹配情况，判断是否应该绑定到某个已有项目。`;

    console.log('[项目匹配] 调用大模型进行语义分析...');
    
    const response = await llmService.chat(providers[0], {
      messages: [
        { role: 'system', content: PROMPTS.PROJECT_MATCHING },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      maxTokens: 500,
    });

    const content = response.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[项目匹配] LLM 响应格式错误:', content);
      return null;
    }

    const result = JSON.parse(jsonMatch[0]) as LLMMatchResult;
    console.log(`[项目匹配] LLM 分析结果: matched=${result.matched}, confidence=${result.confidence}, reason=${result.reason}`);
    
    return result;
  } catch (error) {
    console.error('[项目匹配] LLM 调用失败:', error);
    return null;
  }
}

export async function askProjectSelection({ ctx }: ToolInput): Promise<ToolResult> {
  // 如果已绑定项目，直接返回
  if (ctx.session.project_id) {
    console.log(`[项目选择] 已绑定: ${ctx.session.project_id}`);
    ctx.projectId = ctx.session.project_id;
    return { output: { action: 'already_bound', projectId: ctx.session.project_id } };
  }
  
  const matches: ProjectCandidate[] = ctx.state.projectMatches || [];
  const topic = ctx.session.research_topic || '';
  
  // 无候选项目，需要创建新项目
  if (matches.length === 0) {
    console.log('[项目选择] 无候选项目，等待用户确认创建');
    ctx.state.logs.push('无匹配项目，等待用户确认');
    
    ctx.state.pendingProjectAction = {
      action: 'create_new',
      reason: 'no_candidates',
      topic,
    };
    
    return { 
      output: { 
        action: 'awaiting_confirmation',
        confirmationType: 'create_project',
        message: '未找到相关项目，是否创建新项目？',
        options: [
          { id: 'create', label: '创建新项目', isDefault: true },
          { id: 'cancel', label: '取消' },
        ],
        timeout: 120000,
      },
    };
  }

  // 有候选项目，调用 LLM 分析（用于推荐排序）
  const filteredCandidates = matches.filter(m => m._matchScore >= 0.3);
  let recommendedProject: ProjectCandidate | null = null;
  let llmResult: LLMMatchResult | null = null;
  
  if (filteredCandidates.length > 0) {
    llmResult = await llmMatchProject(topic, filteredCandidates.slice(0, 5));
    
    if (llmResult?.matched && llmResult.matchedProjectId) {
      recommendedProject = filteredCandidates.find(c => c.id === llmResult!.matchedProjectId) || null;
    }
  }
  
  // 如果没有 LLM 推荐，使用相似度最高的
  if (!recommendedProject && filteredCandidates.length > 0) {
    recommendedProject = filteredCandidates[0];
  }
  
  // 构建选项列表：推荐项目放在前面
  const candidatesToShow = filteredCandidates.slice(0, 3);
  const options: { id: string; label: string; isDefault?: boolean }[] = [];
  
  if (recommendedProject) {
    // 推荐项目作为默认选项
    options.push({
      id: `select_${recommendedProject.id}`,
      label: `使用「${recommendedProject.name.slice(0, 30)}」`,
      isDefault: true,
    });
    
    // 其他候选项目
    for (const c of candidatesToShow) {
      if (c.id !== recommendedProject.id) {
        options.push({
          id: `select_${c.id}`,
          label: `使用「${c.name.slice(0, 30)}」`,
        });
      }
    }
  } else {
    // 没有推荐，按相似度排序
    for (const c of candidatesToShow) {
      options.push({
        id: `select_${c.id}`,
        label: `使用「${c.name.slice(0, 30)}」`,
        isDefault: options.length === 0,
      });
    }
  }
  
  // 创建新项目选项
  options.push({ id: 'create', label: '创建新项目' });
  
  console.log(`[项目选择] 等待用户选择，推荐: ${recommendedProject?.name || '无'}`);
  ctx.state.logs.push('等待用户选择项目');
  
  ctx.state.pendingProjectAction = {
    action: 'select_or_create',
    recommendedProjectId: recommendedProject?.id,
    candidates: candidatesToShow,
    llmAnalysis: llmResult,
    topic,
  };
  
  return { 
    output: { 
      action: 'awaiting_confirmation',
      confirmationType: 'select_or_create_project',
      message: recommendedProject 
        ? `找到相关项目「${recommendedProject.name}」，请选择：`
        : '找到以下相关项目，请选择：',
      candidates: candidatesToShow.map(m => ({ id: m.id, name: m.name, score: m._matchScore })),
      recommendedProjectId: recommendedProject?.id,
      options,
      timeout: 120000,
    },
  };
}
