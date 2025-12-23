import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { documentRepository, projectRepository } from '../lib/repository.js';
import { config } from '../config/index.js';
import type { Document, CreateDocument, UpdateDocument } from '../types/database.js';

export interface DocumentListOptions {
  project_id: string;
  chapter_id?: string;
  type?: Document['type'];
  search?: string;
  orderBy?: 'created_at' | 'name' | 'size';
  ascending?: boolean;
  limit?: number;
  offset?: number;
}

function getDocumentType(mimeType: string, filename: string): Document['type'] {
  const ext = path.extname(filename).toLowerCase();
  
  if (mimeType === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (mimeType.includes('word') || ext === '.docx' || ext === '.doc') return 'docx';
  if (mimeType.includes('presentation') || ext === '.pptx' || ext === '.ppt') return 'pptx';
  if (mimeType.includes('spreadsheet') || ext === '.xlsx' || ext === '.xls') return 'xlsx';
  if (mimeType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
  
  return 'other';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

class DocumentService {
  private getUploadDir(projectId: string): string {
    return path.resolve(config.dataDir, 'uploads', projectId);
  }

  async ensureUploadDir(projectId: string): Promise<string> {
    const uploadDir = this.getUploadDir(projectId);
    await fs.mkdir(uploadDir, { recursive: true });
    return uploadDir;
  }

  async list(options: DocumentListOptions): Promise<{ data: Document[]; total: number }> {
    const filters: Record<string, unknown> = {
      project_id: options.project_id,
    };
    
    if (options.chapter_id) {
      filters.chapter_id = options.chapter_id;
    }
    
    if (options.type) {
      filters.type = options.type;
    }
    
    let documents = await documentRepository.findAll({
      filters,
      orderBy: options.orderBy ? {
        column: options.orderBy,
        ascending: options.ascending ?? false,
      } : { column: 'created_at', ascending: false },
    });
    
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      documents = documents.filter(d => 
        d.name.toLowerCase().includes(searchLower) ||
        d.original_name.toLowerCase().includes(searchLower)
      );
    }
    
    const total = documents.length;
    
    if (options.offset) {
      documents = documents.slice(options.offset);
    }
    if (options.limit) {
      documents = documents.slice(0, options.limit);
    }
    
    return { data: documents, total };
  }

  async getById(id: string): Promise<Document | null> {
    return documentRepository.findById(id);
  }

  async upload(
    projectId: string,
    file: {
      originalname: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    }
  ): Promise<Document> {
    // 验证项目存在
    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    const uploadDir = await this.ensureUploadDir(projectId);
    const fileId = uuidv4();
    const ext = path.extname(file.originalname);
    const fileName = `${fileId}${ext}`;
    const filePath = path.join(uploadDir, fileName);
    
    // 保存文件到本地
    await fs.writeFile(filePath, file.buffer);
    
    const docType = getDocumentType(file.mimetype, file.originalname);
    
    return documentRepository.create({
      project_id: projectId,
      chapter_id: null,
      name: file.originalname,
      original_name: file.originalname,
      type: docType,
      mime_type: file.mimetype,
      size: file.size,
      file_path: filePath,
      storage_url: null,
      processing_status: 'pending',
      extracted_text: null,
      metadata: {
        uploaded_at: new Date().toISOString(),
        file_size_formatted: formatFileSize(file.size),
      },
    });
  }

  async update(id: string, data: UpdateDocument): Promise<Document | null> {
    return documentRepository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    const doc = await documentRepository.findById(id);
    if (!doc) return false;
    
    // 删除本地文件
    if (doc.file_path) {
      try {
        await fs.unlink(doc.file_path);
      } catch (err) {
        console.warn('Failed to delete file:', doc.file_path, err);
      }
    }
    
    return documentRepository.delete(id);
  }

  async assignToChapter(id: string, chapter_id: string | null): Promise<Document | null> {
    return documentRepository.update(id, { chapter_id });
  }

  async getFilePath(id: string): Promise<string | null> {
    const doc = await documentRepository.findById(id);
    if (!doc || !doc.file_path) return null;
    
    try {
      await fs.access(doc.file_path);
      return doc.file_path;
    } catch {
      return null;
    }
  }

  async getStatsByProject(project_id: string): Promise<{
    total: number;
    totalSize: number;
    byType: Record<Document['type'], number>;
  }> {
    const documents = await documentRepository.findAll({ filters: { project_id } });
    
    const byType: Record<Document['type'], number> = {
      pdf: 0,
      docx: 0,
      pptx: 0,
      xlsx: 0,
      image: 0,
      other: 0,
    };
    
    let totalSize = 0;
    
    for (const doc of documents) {
      byType[doc.type]++;
      totalSize += doc.size;
    }
    
    return {
      total: documents.length,
      totalSize,
      byType,
    };
  }
}

export const documentService = new DocumentService();
