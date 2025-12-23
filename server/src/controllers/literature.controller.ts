import { Request, Response } from 'express';
import { literatureService } from '../services/literature.service.js';
import type { CreateLiterature, UpdateLiterature } from '../types/database.js';

export const literatureController = {
  // GET /api/projects/:projectId/literature
  async list(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const { chapter_id, source, status, search, orderBy, ascending, limit, offset } = req.query;
      
      const result = await literatureService.list({
        project_id: projectId,
        chapter_id: chapter_id as string,
        source: source as any,
        status: status as any,
        search: search as string,
        orderBy: orderBy as any,
        ascending: ascending === 'true',
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      
      res.json({
        success: true,
        data: result.data,
        total: result.total,
      });
    } catch (error) {
      console.error('Error listing literature:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list literature',
      });
    }
  },

  // GET /api/projects/:projectId/literature/stats
  async getStats(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const stats = await literatureService.getStatsByProject(projectId);
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('Error getting literature stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get literature stats',
      });
    }
  },

  // GET /api/literature/:id
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const literature = await literatureService.getById(id);
      
      if (!literature) {
        return res.status(404).json({
          success: false,
          error: 'Literature not found',
        });
      }
      
      res.json({ success: true, data: literature });
    } catch (error) {
      console.error('Error getting literature:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get literature',
      });
    }
  },

  // POST /api/projects/:projectId/literature
  async create(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const data: Omit<CreateLiterature, 'project_id'> = req.body;
      
      if (!data.title) {
        return res.status(400).json({
          success: false,
          error: 'Literature title is required',
        });
      }
      
      const literature = await literatureService.create({
        ...data,
        project_id: projectId,
        authors: data.authors || [],
        keywords: data.keywords || [],
        source: data.source || 'user',
        status: data.status || 'pending',
      });
      
      res.status(201).json({ success: true, data: literature });
    } catch (error: any) {
      console.error('Error creating literature:', error);
      if (error.message === 'Project not found') {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create literature',
      });
    }
  },

  // POST /api/projects/:projectId/literature/import
  async importBibtex(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const { bibtex } = req.body;
      
      if (!bibtex) {
        return res.status(400).json({
          success: false,
          error: 'BibTeX content is required',
        });
      }
      
      const parsed = literatureService.parseBibtex(bibtex);
      
      if (parsed.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid BibTeX entries found',
        });
      }
      
      const created = await literatureService.createMany(
        parsed.map(p => ({
          project_id: projectId,
          chapter_id: p.chapter_id ?? null,
          title: p.title || 'Untitled',
          authors: p.authors || [],
          year: p.year ?? null,
          journal: p.journal ?? null,
          volume: p.volume ?? null,
          issue: p.issue ?? null,
          pages: p.pages ?? null,
          doi: p.doi ?? null,
          abstract: p.abstract ?? null,
          keywords: p.keywords || [],
          source: 'user' as const,
          source_database: p.source_database ?? null,
          status: 'pending' as const,
          ai_summary: p.ai_summary ?? null,
          ai_relevance_score: p.ai_relevance_score ?? null,
          ai_inclusion_reason: p.ai_inclusion_reason ?? null,
          file_path: p.file_path ?? null,
          file_url: p.file_url ?? null,
          bibtex: p.bibtex ?? null,
          raw_data: p.raw_data ?? null,
        }))
      );
      
      res.status(201).json({
        success: true,
        data: created,
        imported: created.length,
      });
    } catch (error) {
      console.error('Error importing BibTeX:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import BibTeX',
      });
    }
  },

  // PUT /api/literature/:id
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateLiterature = req.body;
      
      const literature = await literatureService.update(id, data);
      
      if (!literature) {
        return res.status(404).json({
          success: false,
          error: 'Literature not found',
        });
      }
      
      res.json({ success: true, data: literature });
    } catch (error) {
      console.error('Error updating literature:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update literature',
      });
    }
  },

  // PATCH /api/literature/:id/status
  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status',
        });
      }
      
      const literature = await literatureService.updateStatus(id, status);
      
      if (!literature) {
        return res.status(404).json({
          success: false,
          error: 'Literature not found',
        });
      }
      
      res.json({ success: true, data: literature });
    } catch (error) {
      console.error('Error updating literature status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update literature status',
      });
    }
  },

  // PATCH /api/literature/:id/chapter
  async assignChapter(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { chapter_id } = req.body;
      
      const literature = await literatureService.assignToChapter(id, chapter_id || null);
      
      if (!literature) {
        return res.status(404).json({
          success: false,
          error: 'Literature not found',
        });
      }
      
      res.json({ success: true, data: literature });
    } catch (error) {
      console.error('Error assigning chapter:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to assign chapter',
      });
    }
  },

  // DELETE /api/literature/:id
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const success = await literatureService.delete(id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Literature not found',
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting literature:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete literature',
      });
    }
  },
};
