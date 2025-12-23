/**
 * 按章节生成检索式
 * 根据章节框架为每个章节生成专业的英文学术检索式
 * 关键：必须生成英文检索式，因为 WOS/Scopus 主要收录英文文献
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';

const QUERY_GENERATION_PROMPT = `你是一个学术文献检索专家，精通 Web of Science 和 Scopus 数据库的检索语法。

## 任务
根据用户的研究主题和章节框架，为每个章节生成专业的英文检索式。

## 重要要求
1. **必须使用英文关键词**（WOS/Scopus 主要收录英文文献）
2. 将中文研究主题翻译成准确的英文学术术语
3. 使用布尔运算符：AND, OR, NOT
4. 使用通配符 * 扩展词根（如 detect* 匹配 detection, detecting）
5. 使用引号 "" 精确匹配短语
6. 每个章节生成 1-2 条检索式

## 检索式语法示例
- 简单检索: machine learning AND fraud detection
- 短语检索: "illegal behavior" AND "data mining"
- 通配符: anomal* AND detect* AND multi-source
- 组合检索: (deep learning OR neural network) AND (fraud OR illegal) AND detection

## 输出格式
严格输出 JSON 数组，不要有其他内容：
[
  {
    "section": "章节名（中文）",
    "query": "英文检索式",
    "keywords_en": ["英文关键词1", "英文关键词2"],
    "keywords_cn": ["中文关键词1", "中文关键词2"]
  }
]`;

export async function generateQueryBySection({ ctx }: ToolInput): Promise<ToolResult> {
  const framework = ctx.state.tempAssets.find(a => a.type === 'chapter_framework');
  const topic = ctx.session.research_topic || '';
  
  console.log(`[生成检索式] 研究主题: ${topic}`);
  
  const messages: ChatMessage[] = [
    { role: 'system', content: QUERY_GENERATION_PROMPT },
    { role: 'user', content: `## 研究主题（中文）
${topic}

## 章节框架
${framework?.content || topic}

请为每个主要章节生成英文检索式。` },
  ];
  
  const res = await callLLM(messages);
  ctx.state.logs.push('生成英文检索式');
  
  try {
    // 提取 JSON 部分
    let jsonStr = res.content;
    const jsonMatch = res.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);
    (ctx.state as any).queries = parsed;
    
    console.log(`[生成检索式] 成功生成 ${parsed.length} 条检索式`);
    parsed.forEach((q: any, i: number) => {
      console.log(`[生成检索式] ${i + 1}. ${q.section}: ${q.query?.slice(0, 60)}...`);
    });
    
    // 保存检索式到临时资产
    ctx.state.tempAssets.push({
      id: `query-${Date.now()}`,
      session_id: ctx.session.id,
      type: 'search_query',
      title: '检索式 v1',
      content: JSON.stringify(parsed, null, 2),
      data: { queries: parsed, version: 1 },
      created_at: new Date().toISOString(),
    });
    
  } catch (err) {
    console.error('[生成检索式] JSON 解析失败:', err);
    (ctx.state as any).queries = [];
  }
  
  return { output: res.content };
}
