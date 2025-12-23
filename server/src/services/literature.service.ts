import { literatureRepository, projectRepository } from '../lib/repository.js';
import type { Literature, CreateLiterature, UpdateLiterature } from '../types/database.js';

export interface LiteratureListOptions {
  project_id: string;
  chapter_id?: string;
  source?: 'ai' | 'user';
  status?: 'approved' | 'rejected' | 'pending';
  search?: string;
  orderBy?: 'created_at' | 'year' | 'title';
  ascending?: boolean;
  limit?: number;
  offset?: number;
}

class LiteratureService {
  async list(options: LiteratureListOptions): Promise<{ data: Literature[]; total: number }> {
    const filters: Record<string, unknown> = {
      project_id: options.project_id,
    };
    
    if (options.chapter_id) {
      filters.chapter_id = options.chapter_id;
    }
    
    if (options.source) {
      filters.source = options.source;
    }
    
    if (options.status) {
      filters.status = options.status;
    }
    
    let literature = await literatureRepository.findAll({
      filters,
      orderBy: options.orderBy ? {
        column: options.orderBy,
        ascending: options.ascending ?? false,
      } : { column: 'created_at', ascending: false },
    });
    
    // 搜索过滤
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      literature = literature.filter(l => 
        l.title.toLowerCase().includes(searchLower) ||
        l.authors.some(a => a.toLowerCase().includes(searchLower)) ||
        (l.journal && l.journal.toLowerCase().includes(searchLower)) ||
        (l.abstract && l.abstract.toLowerCase().includes(searchLower)) ||
        l.keywords.some(k => k.toLowerCase().includes(searchLower))
      );
    }
    
    const total = literature.length;
    
    if (options.offset) {
      literature = literature.slice(options.offset);
    }
    if (options.limit) {
      literature = literature.slice(0, options.limit);
    }
    
    return { data: literature, total };
  }

  async getById(id: string): Promise<Literature | null> {
    return literatureRepository.findById(id);
  }

  async create(data: CreateLiterature): Promise<Literature> {
    // 验证项目存在
    const project = await projectRepository.findById(data.project_id);
    if (!project) {
      throw new Error('Project not found');
    }
    
    return literatureRepository.create(data);
  }

  async createMany(items: CreateLiterature[]): Promise<Literature[]> {
    const results: Literature[] = [];
    for (const item of items) {
      results.push(await this.create(item));
    }
    return results;
  }

  async update(id: string, data: UpdateLiterature): Promise<Literature | null> {
    return literatureRepository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return literatureRepository.delete(id);
  }

  async updateStatus(id: string, status: 'approved' | 'rejected' | 'pending'): Promise<Literature | null> {
    return literatureRepository.update(id, { status });
  }

  async assignToChapter(id: string, chapter_id: string | null): Promise<Literature | null> {
    return literatureRepository.update(id, { chapter_id });
  }

  async getStatsByProject(project_id: string): Promise<{
    total: number;
    bySource: { ai: number; user: number };
    byStatus: { approved: number; rejected: number; pending: number };
    byYear: Record<number, number>;
  }> {
    const literature = await literatureRepository.findAll({ filters: { project_id } });
    
    const bySource = { ai: 0, user: 0 };
    const byStatus = { approved: 0, rejected: 0, pending: 0 };
    const byYear: Record<number, number> = {};
    
    for (const lit of literature) {
      bySource[lit.source]++;
      byStatus[lit.status]++;
      if (lit.year) {
        byYear[lit.year] = (byYear[lit.year] || 0) + 1;
      }
    }
    
    return {
      total: literature.length,
      bySource,
      byStatus,
      byYear,
    };
  }

  // 解析 BibTeX 格式
  parseBibtex(bibtex: string): Partial<CreateLiterature>[] {
    const entries: Partial<CreateLiterature>[] = [];
    const entryRegex = /@(\w+)\s*\{([^,]*),([^@]*)\}/g;
    
    let match;
    while ((match = entryRegex.exec(bibtex)) !== null) {
      const fields: Record<string, string> = {};
      const fieldRegex = /(\w+)\s*=\s*[{"]([^}"]*)[}"]/g;
      let fieldMatch;
      
      while ((fieldMatch = fieldRegex.exec(match[3])) !== null) {
        fields[fieldMatch[1].toLowerCase()] = fieldMatch[2].trim();
      }
      
      entries.push({
        title: fields.title || 'Untitled',
        authors: fields.author ? fields.author.split(' and ').map(a => a.trim()) : [],
        year: fields.year ? parseInt(fields.year, 10) : null,
        journal: fields.journal || fields.booktitle || null,
        volume: fields.volume || null,
        issue: fields.number || null,
        pages: fields.pages || null,
        doi: fields.doi || null,
        abstract: fields.abstract || null,
        keywords: fields.keywords ? fields.keywords.split(',').map(k => k.trim()) : [],
        bibtex: match[0],
        source: 'user',
        status: 'pending',
      });
    }
    
    return entries;
  }
}

export const literatureService = new LiteratureService();
