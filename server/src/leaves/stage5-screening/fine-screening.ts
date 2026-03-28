/**
 * 精筛文献
 * 对有摘要的文献进行精细筛选，基于摘要深度分析
 * 策略：分批调用LLM分析所有有摘要的文献
 */
import type { ToolInput, ToolResult } from '../types.js';
import { callLLM, getPrompt } from '../utils.js';
import type { ChatMessage } from '../../types/llm.js';
import type { LiteratureRecord } from '../../services/deepreference/recode.types.js';

interface ScreeningResult {
  id: string;
  decision: 'keep' | 'reject' | 'pending';
  confidence: number;
  reason: string;
  relevantSection?: string;
}

const BATCH_SIZE = 15;

export async function fineScreening({ ctx }: ToolInput): Promise<ToolResult> {
  const records: LiteratureRecord[] = ctx.state.mergedRecords || [];
  
  if (records.length === 0) {
    console.log('[精筛] 无候选文献，跳过');
    return { output: { screened: 0, skipped: true } };
  }
  
  // 只对待精筛（to_fine_screen）的文献进行精筛
  const candidates = records.filter(r => r.status === 'to_fine_screen');
  const pendingRecords = records.filter(r => r.status === 'pending');
  
  console.log(`[精筛] 待精筛文献: ${candidates.length}, 无摘要待定: ${pendingRecords.length}`);
  
  if (candidates.length === 0) {
    console.log('[精筛] 无待精筛文献，跳过LLM筛选');
    ctx.state.mergedRecords = records;
    return { 
      output: { 
        total: records.length,
        withAbstract: 0,
        pendingNoAbstract: pendingRecords.length,
        screened: 0 
      } 
    };
  }
  
  // 构建研究上下文
  const researchContext = {
    topic: ctx.session.research_topic || '未指定',
    goal: ctx.session.research_goal || '未指定',
  };
  
  // 获取章节框架（如果有）
  const frameworkAsset = ctx.state.tempAssets.find(a => a.type === 'chapter_framework');
  const framework = frameworkAsset?.content || '未生成';
  
  // 分批处理所有有摘要的文献
  const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);
  let processedCount = 0;
  let llmSuccessCount = 0;
  
  console.log(`[精筛] 共 ${candidates.length} 篇待筛选，分 ${totalBatches} 批处理`);
  console.log(`[精筛] 研究主题: ${researchContext.topic}`);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, candidates.length);
    const batch = candidates.slice(start, end);
    
    console.log(`[精筛] 处理第 ${batchIndex + 1}/${totalBatches} 批 (${batch.length} 篇)`);
    
    // 简化文献数据，使用合成索引 idx_N 作为稳定标识符
    // (LiteratureRecord.id 是可选的，WOS/Scopus 记录通常为 undefined)
    const simplifiedRecords = batch.map((r, i) => ({
      id: `idx_${start + i}`,
      title: r.title,
      authors: r.authors?.slice(0, 3)?.join(', ') || '未知',
      year: r.year || '未知',
      abstract: r.abstract?.slice(0, 800) || '',
      keywords: r.keywords?.slice(0, 5)?.join(', ') || '无关键词',
      journal: r.journal || '未知',
    }));
    
    const userContent = `研究主题：${researchContext.topic}
研究目标：${researchContext.goal}

论文框架：
${framework.slice(0, 1200)}

请对以下 ${simplifiedRecords.length} 篇文献进行精细筛选：

${JSON.stringify(simplifiedRecords, null, 2)}`;

    const messages: ChatMessage[] = [
      { 
        role: 'system', 
        content: `${getPrompt('FINE_SCREENING')}

你是学术文献精细筛选专家。请基于摘要内容进行深度分析：

精筛标准（按重要性排序）：
1. 【摘要深度匹配】摘要中的研究问题、方法论、主要发现是否与研究主题高度契合（最重要）
2. 【理论/方法贡献】摘要显示的研究是否能为论文提供理论支撑或方法借鉴
3. 【章节适配性】该文献最适合支撑论文框架中的哪个章节
4. 【研究质量】从摘要判断研究的科学性和严谨性
5. 【期刊权威性】发表期刊的学术影响力

决策说明：
- keep: 摘要显示与研究主题高度相关，有明确的理论或方法价值
- reject: 摘要显示与研究主题关联度低，或研究方向偏离
- pending: 摘要信息不足以判断，需要进一步查阅全文

输出格式：严格的JSON数组，不要包含任何其他内容
[{ "id": "文献ID", "decision": "keep/reject/pending", "confidence": 0.0-1.0, "reason": "基于摘要分析的具体理由", "relevantSection": "最适合的章节（可选）" }]` 
      },
      { role: 'user', content: userContent },
    ];
    
    try {
      const res = await callLLM(messages);
      
      // 解析LLM结果并更新记录状态
      const screeningResults = parseLLMResponse(res.content);
      
      if (screeningResults.length > 0) {
        for (const result of screeningResults) {
          // 用合成索引 idx_N 匹配回 candidates 数组中的记录
          let record: LiteratureRecord | undefined;
          if (result.id.startsWith('idx_')) {
            const idx = parseInt(result.id.replace('idx_', ''), 10);
            if (!isNaN(idx) && idx >= 0 && idx < candidates.length) {
              record = candidates[idx];
            }
          }
          // 降级：按标题模糊匹配
          if (!record) {
            const normalizedTitle = result.id.toLowerCase().trim();
            record = candidates.find(r => r.title.toLowerCase().trim() === normalizedTitle);
          }
          if (record) {
            if (result.decision === 'keep') {
              record.status = 'approved';
            } else if (result.decision === 'reject') {
              record.status = 'rejected';
            } else {
              record.status = 'pending';
            }
            record.screening_reason = result.reason;
            if (result.relevantSection) {
              record.relevant_section = result.relevantSection;
            }
            llmSuccessCount++;
          }
        }
        console.log(`[精筛] 第 ${batchIndex + 1} 批解析成功: ${screeningResults.length} 条`);
      } else {
        console.warn(`[精筛] 第 ${batchIndex + 1} 批解析失败，将这批文献标记为待定`);
        for (const record of batch) {
          record.status = 'pending';
          record.screening_reason = 'LLM筛选结果解析失败，标记为待定';
        }
      }
      
      processedCount += batch.length;
    } catch (err: any) {
      console.error(`[精筛] 第 ${batchIndex + 1} 批LLM调用失败:`, err.message);
      for (const record of batch) {
        record.status = 'pending';
        record.screening_reason = `LLM调用失败: ${err.message}`;
      }
      processedCount += batch.length;
    }
  }
  
  ctx.state.mergedRecords = records;
  
  const approved = records.filter(r => r.status === 'approved').length;
  const rejected = records.filter(r => r.status === 'rejected').length;
  const pending = records.filter(r => r.status === 'pending').length;
  
  console.log(`[精筛] 完成: 处理 ${processedCount} 篇, LLM成功解析 ${llmSuccessCount} 条`);
  console.log(`[精筛] 结果: 通过 ${approved}, 拒绝 ${rejected}, 待定 ${pending}`);
  
  return { 
    output: { 
      total: records.length,
      processed: processedCount,
      llmSuccess: llmSuccessCount,
      approved,
      rejected,
      pending,
    } 
  };
}

function parseLLMResponse(content: string): ScreeningResult[] {
  try {
    // 尝试直接解析
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => 
          item && 
          typeof item.id === 'string' && 
          ['keep', 'reject', 'pending'].includes(item.decision)
        );
      }
    }
  } catch (e1) {
    console.warn('[精筛] JSON直接解析失败，尝试修复...');
    
    // 尝试修复常见问题
    try {
      let fixed = content;
      // 移除可能的markdown代码块标记
      fixed = fixed.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      // 提取JSON数组
      const jsonMatch = fixed.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        // 修复可能的尾部逗号
        let jsonStr = jsonMatch[0].replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          return parsed.filter(item => 
            item && 
            typeof item.id === 'string' && 
            ['keep', 'reject', 'pending'].includes(item.decision)
          );
        }
      }
    } catch (e2) {
      console.error('[精筛] JSON修复解析也失败:', e2);
    }
  }
  
  return [];
}
