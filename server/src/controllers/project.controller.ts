import { Response } from 'express';
import { projectService } from '../services/project.service.js';
import type { CreateProject, UpdateProject } from '../types/database.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';

export const projectController = {
  // GET /api/projects
  async list(req: AuthRequest, res: Response) {
    try {
      const { domain, status, search, orderBy, ascending, limit, offset } = req.query;
      
      const result = await projectService.list({
        userId: req.userId,
        domain: domain as string,
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
      console.error('Error listing projects:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list projects',
      });
    }
  },

  // GET /api/projects/domains
  async getDomains(req: AuthRequest, res: Response) {
    try {
      const domains = await projectService.getDomains(req.userId);
      res.json({ success: true, data: domains });
    } catch (error) {
      console.error('Error getting domains:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get domains',
      });
    }
  },

  // GET /api/projects/:id
  async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const project = await projectService.getById(id, req.userId);
      
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
        });
      }
      
      res.json({ success: true, data: project });
    } catch (error) {
      console.error('Error getting project:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get project',
      });
    }
  },

  // GET /api/projects/:id/stats
  async getStats(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const stats = await projectService.getStats(id, req.userId);
      
      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
        });
      }
      
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('Error getting project stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get project stats',
      });
    }
  },

  // POST /api/projects
  async create(req: AuthRequest, res: Response) {
    try {
      const data: CreateProject = req.body;
      
      if (!data.name) {
        return res.status(400).json({
          success: false,
          error: 'Project name is required',
        });
      }
      
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
      }
      
      const project = await projectService.create({
        name: data.name,
        description: data.description || null,
        domain: data.domain || null,
        status: data.status || 'researching',
        tags: data.tags || [],
        user_id: req.userId,
      });
      
      res.status(201).json({ success: true, data: project });
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create project',
      });
    }
  },

  // PUT /api/projects/:id
  async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateProject = req.body;
      
      const project = await projectService.update(id, data, req.userId);
      
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
        });
      }
      
      res.json({ success: true, data: project });
    } catch (error) {
      console.error('Error updating project:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update project',
      });
    }
  },

  // DELETE /api/projects/:id
  async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const success = await projectService.delete(id, req.userId);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting project:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete project',
      });
    }
  },
};
