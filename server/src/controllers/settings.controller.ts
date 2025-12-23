import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service.js';

export const settingsController = {
  // GET /api/settings
  async getAll(_req: Request, res: Response) {
    try {
      const settings = await settingsService.getAllSettings();
      res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error getting settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get settings',
      });
    }
  },

  // GET /api/settings/general
  async getGeneral(_req: Request, res: Response) {
    try {
      const settings = await settingsService.getGeneral();
      res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error getting general settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get general settings',
      });
    }
  },

  // PUT /api/settings/general
  async updateGeneral(req: Request, res: Response) {
    try {
      const settings = await settingsService.updateGeneral(req.body);
      res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error updating general settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update general settings',
      });
    }
  },

  // GET /api/settings/model
  async getModel(_req: Request, res: Response) {
    try {
      const settings = await settingsService.getModel();
      res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error getting model settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get model settings',
      });
    }
  },

  // PUT /api/settings/model
  async updateModel(req: Request, res: Response) {
    try {
      const settings = await settingsService.updateModel(req.body);
      res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error updating model settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update model settings',
      });
    }
  },

  // GET /api/settings/datasource
  async getDatasource(_req: Request, res: Response) {
    try {
      const settings = await settingsService.getDatasource();
      res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error getting datasource settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get datasource settings',
      });
    }
  },

  // PUT /api/settings/datasource
  async updateDatasource(req: Request, res: Response) {
    try {
      const settings = await settingsService.updateDatasource(req.body);
      res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error updating datasource settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update datasource settings',
      });
    }
  },

  // GET /api/settings/storage
  async getStorage(_req: Request, res: Response) {
    try {
      const settings = await settingsService.getStorage();
      res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error getting storage settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get storage settings',
      });
    }
  },

  // PUT /api/settings/storage
  async updateStorage(req: Request, res: Response) {
    try {
      const settings = await settingsService.updateStorage(req.body);
      res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error updating storage settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update storage settings',
      });
    }
  },

  // GET /api/settings/environment
  async getEnvironment(_req: Request, res: Response) {
    try {
      const info = await settingsService.getEnvironmentInfo();
      res.json({ success: true, data: info });
    } catch (error) {
      console.error('Error getting environment info:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get environment info',
      });
    }
  },

  // POST /api/settings/test-llm
  async testLLM(req: Request, res: Response) {
    try {
      const { provider } = req.body;
      const result = await settingsService.testLLMConnection(provider);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error testing LLM connection:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test LLM connection',
      });
    }
  },
};
