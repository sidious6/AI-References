import { Router } from 'express';
import { authService } from '../services/auth.service.js';
import { config } from '../config/index.js';

const router = Router();

// GET /api/auth/storage-mode - 查询当前存储模式(无需认证)
router.get('/storage-mode', (_req, res) => {
  res.json({
    success: true,
    data: {
      provider: config.database.provider,
      allowLocalLogin: true,
    },
  });
});

// POST /api/auth/local-login - 本地模式免密登录
router.post('/local-login', async (_req, res) => {
  try {
    const result = await authService.localLogin();
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Local login error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Local login failed',
    });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      });
    }

    const result = await authService.register({ email, password, username });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Registration failed',
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    const result = await authService.login({ email, password });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(401).json({
      success: false,
      error: error.message || 'Login failed',
    });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.slice(7);
    const payload = authService.verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    const user = await authService.getUserById(payload.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user info',
    });
  }
});

// PUT /api/auth/profile
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.slice(7);
    const payload = authService.verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    const { username, avatar_url } = req.body;
    const user = await authService.updateUser(payload.userId, { username, avatar_url });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
});

export default router;
