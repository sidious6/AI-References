import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { documentService } from '../services/document.service.js';
import type { UpdateDocument } from '../types/database.js';

export const documentController = {
  // GET /api/projects/:projectId/documents
  async list(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const { chapter_id, type, search, orderBy, ascending, limit, offset } = req.query;
      
      const result = await documentService.list({
        project_id: projectId,
        chapter_id: chapter_id as string,
        type: type as any,
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
      console.error('Error listing documents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list documents',
      });
    }
  },

  // GET /api/projects/:projectId/documents/stats
  async getStats(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const stats = await documentService.getStatsByProject(projectId);
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('Error getting document stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get document stats',
      });
    }
  },

  // GET /api/documents/:id
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const document = await documentService.getById(id);
      
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }
      
      res.json({ success: true, data: document });
    } catch (error) {
      console.error('Error getting document:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get document',
      });
    }
  },

  // GET /api/documents/:id/download
  async download(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const document = await documentService.getById(id);
      
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }
      
      const filePath = await documentService.getFilePath(id);
      
      if (!filePath) {
        return res.status(404).json({
          success: false,
          error: 'File not found',
        });
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.original_name)}"`);
      res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
      
      const fileBuffer = await fs.readFile(filePath);
      res.send(fileBuffer);
    } catch (error) {
      console.error('Error downloading document:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to download document',
      });
    }
  },

  // POST /api/projects/:projectId/documents/upload
  async upload(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
      }
      
      const document = await documentService.upload(projectId, {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        buffer: req.file.buffer,
        size: req.file.size,
      });
      
      res.status(201).json({ success: true, data: document });
    } catch (error: any) {
      console.error('Error uploading document:', error);
      if (error.message === 'Project not found') {
        return res.status(404).json({
          success: false,
          error: 'Project not found',
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to upload document',
      });
    }
  },

  // PUT /api/documents/:id
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateDocument = req.body;
      
      const document = await documentService.update(id, data);
      
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }
      
      res.json({ success: true, data: document });
    } catch (error) {
      console.error('Error updating document:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update document',
      });
    }
  },

  // PATCH /api/documents/:id/chapter
  async assignChapter(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { chapter_id } = req.body;
      
      const document = await documentService.assignToChapter(id, chapter_id || null);
      
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }
      
      res.json({ success: true, data: document });
    } catch (error) {
      console.error('Error assigning chapter:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to assign chapter',
      });
    }
  },

  // DELETE /api/documents/:id
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const success = await documentService.delete(id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete document',
      });
    }
  },
};
