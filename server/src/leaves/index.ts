/**
 * Leaves 工具注册中心
 * 集中管理所有 ReCode 工作流中可用的工具函数
 */
import type { ToolFn } from './types.js';

// Stage 1: 输入理解
import { parseResearchDirection } from './stage1-input/parse-research-direction.js';
import { askClarification } from './stage1-input/ask-clarification.js';

// Stage 2: 项目匹配
import { matchExistingProject } from './stage2-project/match-existing-project.js';
import { createNewProject } from './stage2-project/create-new-project.js';
import { askProjectSelection } from './stage2-project/ask-project-selection.js';
import { loadProjectContext } from './stage2-project/load-project-context.js';

// Stage 3: 课题分析
import { webSearch } from './stage3-analysis/web-search.js';
import { readProjectDocuments } from './stage3-analysis/read-project-documents.js';
import { readProjectImages } from './stage3-analysis/read-project-images.js';
import { generateInitialFramework } from './stage3-analysis/generate-initial-framework.js';
import { refineFramework } from './stage3-analysis/refine-framework.js';

// Stage 4: 文献检索
import { generateQueryBySection } from './stage4-retrieval/generate-query-by-section.js';
import { refineQuery } from './stage4-retrieval/refine-query.js';
import { callWosApi } from './stage4-retrieval/call-wos-api.js';
import { callScopusApi } from './stage4-retrieval/call-scopus-api.js';
import { aggregateResults } from './stage4-retrieval/aggregate-results.js';
import { fetchDoiAbstracts } from './stage4-retrieval/fetch-doi-abstracts.js';
import { recordQueryVersion } from './stage4-retrieval/record-query-version.js';

// Stage 5: 文献筛选
import { recordSeenIds } from './stage5-screening/record-seen-ids.js';
import { dedupeHistory } from './stage5-screening/dedupe-history.js';
import { dedupeProject } from './stage5-screening/dedupe-project.js';
import { coarseScreening } from './stage5-screening/coarse-screening.js';
import { fineScreening } from './stage5-screening/fine-screening.js';
import { evaluateCount } from './stage5-screening/evaluate-count.js';
import { triggerSupplement } from './stage5-screening/trigger-supplement.js';

// Stage 6: 文献入库
import { generateImportSummary } from './stage6-import/generate-import-summary.js';
import { markImportStatus } from './stage6-import/mark-import-status.js';
import { writeToProject } from './stage6-import/write-to-project.js';
import { generateImportReport } from './stage6-import/generate-import-report.js';

// Stage 7: 写作辅助
import { generateOutline } from './stage7-writing/generate-outline.js';
import { writeSectionDraft } from './stage7-writing/write-section-draft.js';
import { insertCitations } from './stage7-writing/insert-citations.js';
import { reviseParagraph } from './stage7-writing/revise-paragraph.js';
import { generateReferences } from './stage7-writing/generate-references.js';

// Common: 通用工具
import { updateProjectConfig } from './common/update-project-config.js';
import { searchProjectKnowledge } from './common/search-project-knowledge.js';
import { syncTempAssets } from './common/sync-temp-assets.js';

/**
 * 工具描述信息，用于日志和调试
 */
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  // Stage 1
  'stage1.parseResearchDirection': '解析研究方向',
  'stage1.askClarification': '询问澄清问题',
  // Stage 2
  'stage2.matchExistingProject': '匹配现有项目',
  'stage2.createNewProject': '创建新项目',
  'stage2.askProjectSelection': '项目选择',
  'stage2.loadProjectContext': '加载项目上下文',
  // Stage 3
  'stage3.webSearch': '网络搜索',
  'stage3.readProjectDocuments': '读取项目文档',
  'stage3.readProjectImages': '读取项目图片',
  'stage3.generateInitialFramework': '生成初始框架',
  'stage3.refineFramework': '优化框架',
  // Stage 4
  'stage4.generateQueryBySection': '生成检索式',
  'stage4.refineQuery': '优化检索式',
  'stage4.callWosApi': '调用 WOS API',
  'stage4.callScopusApi': '调用 Scopus API',
  'stage4.aggregateResults': '聚合检索结果',
  'stage4.fetchDoiAbstracts': '抓取 DOI 摘要',
  'stage4.recordQueryVersion': '记录检索式版本',
  // Stage 5
  'stage5.recordSeenIds': '记录已见文献',
  'stage5.dedupeHistory': '历史去重',
  'stage5.dedupeProject': '项目去重',
  'stage5.coarseScreening': '粗筛文献',
  'stage5.fineScreening': '精筛文献',
  'stage5.evaluateCount': '评估文献数量',
  'stage5.triggerSupplement': '触发补充检索',
  // Stage 6
  'stage6.generateImportSummary': '生成入库摘要',
  'stage6.markImportStatus': '标记入库状态',
  'stage6.writeToProject': '写入项目',
  'stage6.generateImportReport': '生成入库报告',
  // Stage 7
  'stage7.generateOutline': '生成写作大纲',
  'stage7.writeSectionDraft': '撰写章节草稿',
  'stage7.insertCitations': '插入引用标记',
  'stage7.reviseParagraph': '润色段落',
  'stage7.generateReferences': '生成参考文献',
  // Common
  'common.updateProjectConfig': '更新项目配置',
  'common.searchProjectKnowledge': '搜索项目知识库',
  'common.syncTempAssets': '同步临时资产',
};

const tools: Record<string, ToolFn> = {
  'stage1.parseResearchDirection': parseResearchDirection,
  'stage1.askClarification': askClarification,
  'stage2.matchExistingProject': matchExistingProject,
  'stage2.createNewProject': createNewProject,
  'stage2.askProjectSelection': askProjectSelection,
  'stage2.loadProjectContext': loadProjectContext,
  'stage3.webSearch': webSearch,
  'stage3.readProjectDocuments': readProjectDocuments,
  'stage3.readProjectImages': readProjectImages,
  'stage3.generateInitialFramework': generateInitialFramework,
  'stage3.refineFramework': refineFramework,
  'stage4.generateQueryBySection': generateQueryBySection,
  'stage4.refineQuery': refineQuery,
  'stage4.callWosApi': callWosApi,
  'stage4.callScopusApi': callScopusApi,
  'stage4.aggregateResults': aggregateResults,
  'stage4.fetchDoiAbstracts': fetchDoiAbstracts,
  'stage4.recordQueryVersion': recordQueryVersion,
  'stage5.recordSeenIds': recordSeenIds,
  'stage5.dedupeHistory': dedupeHistory,
  'stage5.dedupeProject': dedupeProject,
  'stage5.coarseScreening': coarseScreening,
  'stage5.fineScreening': fineScreening,
  'stage5.evaluateCount': evaluateCount,
  'stage5.triggerSupplement': triggerSupplement,
  'stage6.generateImportSummary': generateImportSummary,
  'stage6.markImportStatus': markImportStatus,
  'stage6.writeToProject': writeToProject,
  'stage6.generateImportReport': generateImportReport,
  'stage7.generateOutline': generateOutline,
  'stage7.writeSectionDraft': writeSectionDraft,
  'stage7.insertCitations': insertCitations,
  'stage7.reviseParagraph': reviseParagraph,
  'stage7.generateReferences': generateReferences,
  'common.updateProjectConfig': updateProjectConfig,
  'common.searchProjectKnowledge': searchProjectKnowledge,
  'common.syncTempAssets': syncTempAssets,
};

export function getTool(name: string): ToolFn {
  const tool = tools[name];
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  return tool;
}

export function listTools() {
  return Object.keys(tools);
}

export function getToolDescription(name: string): string {
  return TOOL_DESCRIPTIONS[name] || name;
}
