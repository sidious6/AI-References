import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { requestContext } from '../lib/repository.js';

export interface AuthRequest extends Request {
  userId?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }
  
  const token = authHeader.substring(7);
  const payload = authService.verifyToken(token);
  
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
  }
  
  req.userId = payload.userId;
  // 设置请求上下文, 让 repository 层能感知当前用户并动态路由存储后端
  requestContext.run({ userId: payload.userId }, () => {
    next();
  });
}

export function optionalAuthMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let userId: string | undefined;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = authService.verifyToken(token);
    if (payload) {
      userId = payload.userId;
      req.userId = userId;
    }
  }
  
  requestContext.run({ userId }, () => {
    next();
  });
}
