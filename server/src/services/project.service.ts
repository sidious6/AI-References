import { projectRepository, chapterRepository, literatureRepository, documentRepository } from '../lib/repository.js';
import type { Project, CreateProject, UpdateProject, Chapter, Literature, Document } from '../types/database.js';

export interface ProjectListOptions {
  userId?: string;
  domain?: string;
  status?: Project['status'];
  search?: string;
  orderBy?: 'created_at' | 'updated_at' | 'name' | 'literature_count';
  ascending?: boolean;
  limit?: number;
  offset?: number;
}

export interface ProjectWithStats extends Project {
  chapters?: Chapter[];
}

class ProjectService {
  async list(options: ProjectListOptions = {}): Promise<{ data: Project[]; total: number }> {
    const filters: Record<string, unknown> = {};
    
    if (options.userId) {
      filters.user_id = options.userId;
    }
    
    if (options.domain) {
      filters.domain = options.domain;
    }
    
    if (options.status) {
      filters.status = options.status;
    }
    
    let projects = await projectRepository.findAll({
      filters,
      orderBy: options.orderBy ? {
        column: options.orderBy,
        ascending: options.ascending ?? (options.orderBy === 'name'),
      } : { column: 'updated_at', ascending: false },
    });
    
    // 搜索过滤
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      projects = projects.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        (p.description && p.description.toLowerCase().includes(searchLower)) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    
    const total = projects.length;
    
    // 分页
    if (options.offset) {
      projects = projects.slice(options.offset);
    }
    if (options.limit) {
      projects = projects.slice(0, options.limit);
    }
    
    return { data: projects, total };
  }

  async getById(id: string, userId?: string): Promise<ProjectWithStats | null> {
    const project = await projectRepository.findById(id);
    if (!project) return null;
    
    // 验证用户权限
    if (userId && project.user_id && project.user_id !== userId) {
      return null;
    }
    
    const chapters = await chapterRepository.findAll({
      filters: { project_id: id },
      orderBy: { column: 'sort_order', ascending: true },
    });
    
    return { ...project, chapters };
  }

  async create(data: CreateProject & { user_id?: string }): Promise<Project> {
    return projectRepository.create(data);
  }

  async update(id: string, data: UpdateProject, userId?: string): Promise<Project | null> {
    // 验证用户权限
    const project = await projectRepository.findById(id);
    if (!project) return null;
    if (userId && project.user_id && project.user_id !== userId) {
      return null;
    }
    return projectRepository.update(id, data);
  }

  async delete(id: string, userId?: string): Promise<boolean> {
    // 验证用户权限
    const project = await projectRepository.findById(id);
    if (!project) return false;
    if (userId && project.user_id && project.user_id !== userId) {
      return false;
    }
    
    // 批量删除相关数据（并行执行提升性能）
    await Promise.all([
      chapterRepository.deleteMany({ project_id: id }),
      literatureRepository.deleteMany({ project_id: id }),
      documentRepository.deleteMany({ project_id: id }),
    ]);
    
    return projectRepository.delete(id);
  }

  async getDomains(userId?: string): Promise<string[]> {
    const filters: Record<string, unknown> = {};
    if (userId) {
      filters.user_id = userId;
    }
    const projects = await projectRepository.findAll({ filters });
    const domains = new Set<string>();
    
    for (const project of projects) {
      if (project.domain) {
        domains.add(project.domain);
      }
    }
    
    return Array.from(domains).sort();
  }

  async getStats(id: string, userId?: string): Promise<{
    literatureCount: number;
    documentCount: number;
    chapterCount: number;
    aiLiteratureCount: number;
    userLiteratureCount: number;
  } | null> {
    const project = await projectRepository.findById(id);
    if (!project) return null;
    
    // 验证用户权限
    if (userId && project.user_id && project.user_id !== userId) {
      return null;
    }
    
    const literature = await literatureRepository.findAll({ filters: { project_id: id } });
    const documents = await documentRepository.findAll({ filters: { project_id: id } });
    const chapters = await chapterRepository.findAll({ filters: { project_id: id } });
    
    return {
      literatureCount: literature.length,
      documentCount: documents.length,
      chapterCount: chapters.length,
      aiLiteratureCount: literature.filter(l => l.source === 'ai').length,
      userLiteratureCount: literature.filter(l => l.source === 'user').length,
    };
  }
}

export const projectService = new ProjectService();
