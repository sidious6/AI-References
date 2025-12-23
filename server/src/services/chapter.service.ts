import { chapterRepository, projectRepository, literatureRepository, documentRepository } from '../lib/repository.js';
import type { Chapter, CreateChapter, UpdateChapter } from '../types/database.js';

export interface ChapterTreeNode extends Chapter {
  children: ChapterTreeNode[];
  literature_count: number;
  document_count: number;
}

class ChapterService {
  async getByProject(projectId: string): Promise<Chapter[]> {
    return chapterRepository.findAll({
      filters: { project_id: projectId },
      orderBy: { column: 'sort_order', ascending: true },
    });
  }

  async getTree(projectId: string): Promise<ChapterTreeNode[]> {
    const chapters = await this.getByProject(projectId);
    const literature = await literatureRepository.findAll({ filters: { project_id: projectId } });
    const documents = await documentRepository.findAll({ filters: { project_id: projectId } });
    
    // 统计每个章节的文献和文档数量
    const litCountMap = new Map<string, number>();
    const docCountMap = new Map<string, number>();
    
    for (const lit of literature) {
      if (lit.chapter_id) {
        litCountMap.set(lit.chapter_id, (litCountMap.get(lit.chapter_id) || 0) + 1);
      }
    }
    
    for (const doc of documents) {
      if (doc.chapter_id) {
        docCountMap.set(doc.chapter_id, (docCountMap.get(doc.chapter_id) || 0) + 1);
      }
    }
    
    // 构建树形结构
    const nodeMap = new Map<string, ChapterTreeNode>();
    const roots: ChapterTreeNode[] = [];
    
    // 创建所有节点
    for (const chapter of chapters) {
      nodeMap.set(chapter.id, {
        ...chapter,
        children: [],
        literature_count: litCountMap.get(chapter.id) || 0,
        document_count: docCountMap.get(chapter.id) || 0,
      });
    }
    
    // 构建父子关系
    for (const chapter of chapters) {
      const node = nodeMap.get(chapter.id)!;
      if (chapter.parent_id && nodeMap.has(chapter.parent_id)) {
        nodeMap.get(chapter.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    
    // 排序子节点
    const sortChildren = (nodes: ChapterTreeNode[]) => {
      nodes.sort((a, b) => a.sort_order - b.sort_order);
      for (const node of nodes) {
        sortChildren(node.children);
      }
    };
    
    sortChildren(roots);
    
    return roots;
  }

  async getById(id: string): Promise<Chapter | null> {
    return chapterRepository.findById(id);
  }

  async create(data: CreateChapter): Promise<Chapter> {
    // 验证项目存在
    const project = await projectRepository.findById(data.project_id);
    if (!project) {
      throw new Error('Project not found');
    }
    
    // 如果有父节点，验证父节点存在且属于同一项目
    if (data.parent_id) {
      const parent = await chapterRepository.findById(data.parent_id);
      if (!parent || parent.project_id !== data.project_id) {
        throw new Error('Invalid parent chapter');
      }
      data.depth = parent.depth + 1;
    }
    
    // 获取同级最大排序值
    const siblings = await chapterRepository.findAll({
      filters: {
        project_id: data.project_id,
        parent_id: data.parent_id || null,
      },
    });
    
    const maxOrder = siblings.reduce((max, s) => Math.max(max, s.sort_order), -1);
    data.sort_order = maxOrder + 1;
    
    return chapterRepository.create(data);
  }

  async update(id: string, data: UpdateChapter): Promise<Chapter | null> {
    return chapterRepository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    const chapter = await chapterRepository.findById(id);
    if (!chapter) return false;
    
    // 递归删除子章节
    const children = await chapterRepository.findAll({
      filters: { parent_id: id },
    });
    
    for (const child of children) {
      await this.delete(child.id);
    }
    
    // 解除文献和文档的章节关联
    const literature = await literatureRepository.findAll({ filters: { chapter_id: id } });
    for (const lit of literature) {
      await literatureRepository.update(lit.id, { chapter_id: null });
    }
    
    const documents = await documentRepository.findAll({ filters: { chapter_id: id } });
    for (const doc of documents) {
      await documentRepository.update(doc.id, { chapter_id: null });
    }
    
    return chapterRepository.delete(id);
  }

  async reorder(id: string, newOrder: number, newParentId?: string | null): Promise<Chapter | null> {
    const chapter = await chapterRepository.findById(id);
    if (!chapter) return null;
    
    const updateData: UpdateChapter = { sort_order: newOrder };
    
    if (newParentId !== undefined) {
      updateData.parent_id = newParentId;
      
      if (newParentId) {
        const newParent = await chapterRepository.findById(newParentId);
        if (newParent) {
          updateData.depth = newParent.depth + 1;
        }
      } else {
        updateData.depth = 0;
      }
    }
    
    // 更新同级其他章节的排序
    const siblings = await chapterRepository.findAll({
      filters: {
        project_id: chapter.project_id,
        parent_id: updateData.parent_id ?? chapter.parent_id,
      },
    });
    
    for (const sibling of siblings) {
      if (sibling.id !== id && sibling.sort_order >= newOrder) {
        await chapterRepository.update(sibling.id, { sort_order: sibling.sort_order + 1 });
      }
    }
    
    return chapterRepository.update(id, updateData);
  }

  async getChapterWithAssets(id: string): Promise<{
    chapter: Chapter;
    literature: any[];
    documents: any[];
  } | null> {
    const chapter = await chapterRepository.findById(id);
    if (!chapter) return null;
    
    const literature = await literatureRepository.findAll({ filters: { chapter_id: id } });
    const documents = await documentRepository.findAll({ filters: { chapter_id: id } });
    
    return { chapter, literature, documents };
  }
}

export const chapterService = new ChapterService();
