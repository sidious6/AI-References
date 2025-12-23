import { Request, Response } from 'express';
import { chapterService } from '../services/chapter.service.js';
import type { CreateChapter, UpdateChapter } from '../types/database.js';

export const chapterController = {
  // GET /api/projects/:projectId/chapters
  async list(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const chapters = await chapterService.getByProject(projectId);
      res.json({ success: true, data: chapters });
    } catch (error) {
      console.error('Error listing chapters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list chapters',
      });
    }
  },

  // GET /api/projects/:projectId/chapters/tree
  async getTree(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const tree = await chapterService.getTree(projectId);
      res.json({ success: true, data: tree });
    } catch (error) {
      console.error('Error getting chapter tree:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get chapter tree',
      });
    }
  },

  // GET /api/chapters/:id
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const chapter = await chapterService.getById(id);
      
      if (!chapter) {
        return res.status(404).json({
          success: false,
          error: 'Chapter not found',
        });
      }
      
      res.json({ success: true, data: chapter });
    } catch (error) {
      console.error('Error getting chapter:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get chapter',
      });
    }
  },

  // GET /api/chapters/:id/assets
  async getAssets(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await chapterService.getChapterWithAssets(id);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Chapter not found',
        });
      }
      
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error getting chapter assets:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get chapter assets',
      });
    }
  },

  // POST /api/projects/:projectId/chapters
  async create(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const data: Omit<CreateChapter, 'project_id'> = req.body;
      
      if (!data.title) {
        return res.status(400).json({
          success: false,
          error: 'Chapter title is required',
        });
      }
      
      const chapter = await chapterService.create({
        ...data,
        project_id: projectId,
        parent_id: data.parent_id || null,
        description: data.description || null,
        sort_order: data.sort_order || 0,
        depth: data.depth || 0,
      });
      
      res.status(201).json({ success: true, data: chapter });
    } catch (error: any) {
      console.error('Error creating chapter:', error);
      if (error.message === 'Project not found') {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
        });
      }
      if (error.message === 'Invalid parent chapter') {
        return res.status(400).json({
          success: false,
          error: 'Invalid parent chapter',
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create chapter',
      });
    }
  },

  // PUT /api/chapters/:id
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateChapter = req.body;
      
      const chapter = await chapterService.update(id, data);
      
      if (!chapter) {
        return res.status(404).json({
          success: false,
          error: 'Chapter not found',
        });
      }
      
      res.json({ success: true, data: chapter });
    } catch (error) {
      console.error('Error updating chapter:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update chapter',
      });
    }
  },

  // PATCH /api/chapters/:id/reorder
  async reorder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { sort_order, parent_id } = req.body;
      
      if (typeof sort_order !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'sort_order is required',
        });
      }
      
      const chapter = await chapterService.reorder(id, sort_order, parent_id);
      
      if (!chapter) {
        return res.status(404).json({
          success: false,
          error: 'Chapter not found',
        });
      }
      
      res.json({ success: true, data: chapter });
    } catch (error) {
      console.error('Error reordering chapter:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reorder chapter',
      });
    }
  },

  // DELETE /api/chapters/:id
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const success = await chapterService.delete(id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Chapter not found',
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting chapter:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete chapter',
      });
    }
  },
};
