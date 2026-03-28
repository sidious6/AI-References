/**
 * 匹配现有项目
 * 使用多维度相似度算法在用户的项目列表中查找匹配的项目
 * 返回匹配结果供后续节点使用，不直接绑定项目
 */
import type { ToolInput, ToolResult } from '../types.js';
import { projectService } from '../../services/project.service.js';

// 提取中文关键词（简单分词）
function extractKeywords(text: string): string[] {
  if (!text) return [];
  const stopWords = ['的', '和', '与', '及', '在', '对', '为', '是', '了', '等', '中', '上', '下', '面向', '基于', '研究', '技术', '方法', '分析'];
  const segments = text.split(/[，,。.、；;：:！!？?\s]+/).filter(Boolean);
  const keywords: string[] = [];
  for (const seg of segments) {
    if (seg.length >= 2 && seg.length <= 10 && !stopWords.includes(seg)) {
      keywords.push(seg.toLowerCase());
    }
  }
  return keywords;
}

// 计算相似度
function calculateSimilarity(input: string, target: string): number {
  if (!input || !target) return 0;
  
  const inputLower = input.toLowerCase();
  const targetLower = target.toLowerCase();
  
  if (inputLower === targetLower) return 1.0;
  if (targetLower.includes(inputLower)) return 0.85;
  if (inputLower.includes(targetLower)) return 0.75;
  
  const inputKeywords = extractKeywords(input);
  const targetKeywords = extractKeywords(target);
  
  if (inputKeywords.length === 0) return 0;
  
  let matchCount = 0;
  for (const kw of inputKeywords) {
    if (targetLower.includes(kw)) {
      matchCount++;
    } else {
      for (const tkw of targetKeywords) {
        if (tkw.includes(kw) || kw.includes(tkw)) {
          matchCount += 0.5;
          break;
        }
      }
    }
  }
  
  return Math.min(matchCount / inputKeywords.length, 1.0);
}

export async function matchExistingProject({ ctx }: ToolInput): Promise<ToolResult> {
  // 如果已绑定项目，直接返回
  if (ctx.session.project_id) {
    console.log(`[匹配项目] 已绑定项目: ${ctx.session.project_id}`);
    ctx.projectId = ctx.session.project_id;
    return { output: { bound: true, projectId: ctx.session.project_id } };
  }
  
  // 优先使用 session 中的 user_id，其次使用 ctx.userId
  const userId = ctx.session.user_id || ctx.userId;
  
  if (!userId) {
    console.log('[匹配项目] 跳过: 用户未登录 (session.user_id 和 ctx.userId 均为空)');
    return { output: { matches: [], hasUser: false } };
  }
  
  console.log(`[匹配项目] 用户ID: ${userId}`);
  
  const { data } = await projectService.list({ userId, limit: 200 });
  const topic = ctx.session.research_topic || '';
  
  if (!topic) {
    console.log('[匹配项目] 跳过: 研究主题为空');
    return { output: { matches: [], topic: '' } };
  }
  
  console.log(`[匹配项目] 用户输入: "${topic}"`);
  console.log(`[匹配项目] 候选项目: ${data.length} 个`);
  
  const matches = data
    .map(p => {
      const nameScore = calculateSimilarity(topic, p.name || '');
      const descScore = calculateSimilarity(topic, p.description || '') * 0.6;
      const score = Math.max(nameScore, descScore);
      return { project: p, score };
    })
    .filter(x => x.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // 最多返回 5 个匹配
  
  matches.forEach(m => {
    console.log(`[匹配项目] "${m.project.name}" 得分: ${m.score.toFixed(2)}`);
  });
  
  // 保存匹配结果到状态
  ctx.state.projectMatches = matches.map(m => ({
    ...m.project,
    _matchScore: m.score,
  }));
  
  ctx.state.logs.push(`找到 ${matches.length} 个匹配项目`);
  
  return { 
    output: { 
      matches: matches.map(m => ({ id: m.project.id, name: m.project.name, score: m.score })),
      bestMatch: matches[0] ? { id: matches[0].project.id, name: matches[0].project.name, score: matches[0].score } : null,
    } 
  };
}
