import crypto from 'crypto';
import type { AgentSession } from '../../types/database.js';
import type { ScriptTree } from './recode.types.js';

const shortId = () => crypto.randomUUID().slice(0, 8);

export function buildDefaultScriptTree(session: AgentSession): ScriptTree {
  const now = new Date().toISOString();
  const stageNode = (id: string, stage: number, title: string, children: any[]) => ({ id, kind: 'stage' as const, stage: stage as 1|2|3|4|5|6|7, title, children });
  const tool = (id: string, title: string, toolName: string) => ({ id, kind: 'tool' as const, title, toolName, children: [] });
  const strategy = (id: string, title: string, children: any[]) => ({ id, kind: 'strategy' as const, title, children });

  return {
    id: `script_${session.id || shortId()}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    root: {
      id: 'root',
      kind: 'root',
      title: 'Deep-reference 调研与综述任务',
      children: [
        stageNode('stage1', 1, '研究方向输入与澄清', [
          tool('parseDirection', '解析研究方向', 'stage1.parseResearchDirection'),
          strategy('clarify', '必要时澄清', [tool('askClarify', '澄清问题', 'stage1.askClarification')]),
        ]),
        stageNode('stage2', 2, '项目匹配/创建与上下文加载', [
          tool('matchProject', '匹配现有项目', 'stage2.matchExistingProject'),
          tool('askProjectSelect', '询问或自动选择项目', 'stage2.askProjectSelection'),
          tool('createProject', '创建新项目', 'stage2.createNewProject'),
          tool('loadProjectContext', '加载项目上下文', 'stage2.loadProjectContext'),
        ]),
        stageNode('stage3', 3, '课题分析与框架生成', [
          tool('webSearch', '上网搜索', 'stage3.webSearch'),
          tool('readDocs', '读取项目文档', 'stage3.readProjectDocuments'),
          tool('readImages', '读取项目图片', 'stage3.readProjectImages'),
          tool('genFramework', '生成初始框架', 'stage3.generateInitialFramework'),
          tool('refineFramework', '细化框架', 'stage3.refineFramework'),
        ]),
        stageNode('stage4', 4, '文献检索', [
          tool('genQuery', '按章节生成检索式', 'stage4.generateQueryBySection'),
          tool('refineQuery', '调整检索式', 'stage4.refineQuery'),
          tool('wos', '调用 Web of Science', 'stage4.callWosApi'),
          tool('scopus', '调用 Scopus', 'stage4.callScopusApi'),
          tool('aggregate', '聚合结果', 'stage4.aggregateResults'),
          tool('fetchAbstracts', '抓取 DOI 摘要', 'stage4.fetchDoiAbstracts'),
          tool('recordQuery', '记录检索式版本', 'stage4.recordQueryVersion'),
        ]),
        stageNode('stage5', 5, '文献整理与筛选', [
          tool('recordSeen', '记录已见 ID', 'stage5.recordSeenIds'),
          tool('dedupeHistory', '与历史去重', 'stage5.dedupeHistory'),
          tool('dedupeProject', '与项目去重', 'stage5.dedupeProject'),
          tool('coarse', '粗筛', 'stage5.coarseScreening'),
          tool('fine', '精筛', 'stage5.fineScreening'),
          tool('evaluate', '评估数量', 'stage5.evaluateCount'),
          tool('supplement', '触发补检', 'stage5.triggerSupplement'),
        ]),
        stageNode('stage6', 6, '文献入库', [
          tool('importSummary', '生成入库摘要', 'stage6.generateImportSummary'),
          tool('markStatus', '标注入库状态', 'stage6.markImportStatus'),
          tool('writeProject', '写入项目', 'stage6.writeToProject'),
          tool('importReport', '生成入库报告', 'stage6.generateImportReport'),
        ]),
        stageNode('stage7', 7, '文献综述撰写', [
          tool('outline', '生成综述大纲', 'stage7.generateOutline'),
          tool('draft', '按章节撰写草稿', 'stage7.writeSectionDraft'),
          tool('citations', '插入引用标记', 'stage7.insertCitations'),
          tool('revise', '修订段落', 'stage7.reviseParagraph'),
          tool('references', '生成参考文献列表', 'stage7.generateReferences'),
          tool('syncAssets', '同步临时资产', 'common.syncTempAssets'),
        ]),
      ],
    },
  };
}
