import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { config } from '../config/index.js';
import type { User } from '../types/database.js';

// 简单的密码哈希（生产环境应使用 bcrypt）
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// 简单的 JWT 替代方案（生产环境应使用真正的 JWT）
function generateToken(userId: string): string {
  const payload = { userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }; // 7天过期
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  username?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: Omit<User, 'password_hash'>;
  token: string;
}

const SUPABASE_TIMEOUT_MS = config.database.supabaseTimeoutMs ?? 15000;

function withSupabaseTimeout<T>(promise: Promise<T>, action: string): Promise<T> {
  if (!SUPABASE_TIMEOUT_MS) {
    return promise;
  }

  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${action}超时，请稍后重试`)), SUPABASE_TIMEOUT_MS)
    ),
  ]);
}

class AuthService {
  async register(input: RegisterInput): Promise<AuthResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database not available');
    }

    const email = input.email.toLowerCase();

    // 检查邮箱是否已存在
    const existingResponse = await withSupabaseTimeout(
      supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle(),
      '查询邮箱'
    );

    if (existingResponse.error && existingResponse.error.code !== 'PGRST116') {
      throw new Error(existingResponse.error.message || 'Failed to check email');
    }

    if (existingResponse.data) {
      throw new Error('Email already registered');
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(input.password);

    const { data: user, error } = await withSupabaseTimeout(
      supabase
        .from('users')
        .insert({
          id,
          email,
          password_hash: passwordHash,
          username: input.username || email.split('@')[0],
          status: 'active',
          created_at: now,
          updated_at: now,
        })
        .select()
        .single(),
      '创建用户'
    );

    if (error || !user) {
      throw new Error(`Failed to create user: ${error?.message}`);
    }

    const token = generateToken(user.id);
    const { password_hash: _, ...safeUser } = user;

    return { user: safeUser, token };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Database not available');
    }

    const email = input.email.toLowerCase();
    const { data: user, error } = await withSupabaseTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single(),
      '查询用户信息'
    );

    if (error || !user) {
      throw new Error('Invalid email or password');
    }

    if (!verifyPassword(input.password, user.password_hash)) {
      throw new Error('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new Error('Account is not active');
    }

    // 更新最后登录时间
    await withSupabaseTimeout(
      supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id),
      '更新最后登录时间'
    );

    const token = generateToken(user.id);
    const { password_hash: _, ...safeUser } = user;

    return { user: safeUser, token };
  }

  async getUserById(id: string): Promise<Omit<User, 'password_hash'> | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data: user, error } = await withSupabaseTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single(),
      '获取用户信息'
    );

    if (error || !user) return null;

    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  async updateUser(id: string, data: { username?: string; avatar_url?: string }): Promise<Omit<User, 'password_hash'> | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data: user, error } = await withSupabaseTimeout(
      supabase
        .from('users')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
      '更新用户信息'
    );

    if (error || !user) return null;

    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  verifyToken(token: string): { userId: string } | null {
    return verifyToken(token);
  }
}

export const authService = new AuthService();
