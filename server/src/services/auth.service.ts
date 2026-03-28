import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { userRepository, SqliteRepository } from '../lib/repository.js';
import { config } from '../config/index.js';
import type { User } from '../types/database.js';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

function generateToken(userId: string): string {
  const payload = { userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
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

function withSupabaseTimeout<T>(promise: PromiseLike<T>, action: string): Promise<T> {
  if (!SUPABASE_TIMEOUT_MS) {
    return Promise.resolve(promise);
  }

  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${action}超时，请稍后重试`)), SUPABASE_TIMEOUT_MS)
    ),
  ]);
}

class AuthService {
  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    const passwordHash = hashPassword(input.password);

    if (config.database.provider === 'supabase') {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase not available');

      const existingResponse = await withSupabaseTimeout<any>(
        supabase.from('users').select('id').eq('email', email).maybeSingle(),
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
      const created = await withSupabaseTimeout<any>(
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

      if (created.error || !created.data) {
        throw new Error(`Failed to create user: ${created.error?.message}`);
      }

      const token = generateToken(created.data.id);
      const { password_hash: _, ...safeUser } = created.data;
      return { user: safeUser, token };
    }

    const existing = await userRepository.findAll({ filters: { email }, limit: 1 });
    if (existing.length > 0) {
      throw new Error('Email already registered');
    }

    const user = await userRepository.create({
      email,
      password_hash: passwordHash,
      username: input.username || email.split('@')[0],
      avatar_url: null,
      status: 'active',
      last_login_at: null,
    });

    const token = generateToken(user.id);
    const { password_hash: _, ...safeUser } = user;
    return { user: safeUser, token };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();

    if (config.database.provider === 'supabase') {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase not available');

      const result = await withSupabaseTimeout<any>(
        supabase.from('users').select('*').eq('email', email).single(),
        '查询用户信息'
      );

      const user = result.data;
      if (result.error || !user) throw new Error('Invalid email or password');
      if (!verifyPassword(input.password, user.password_hash)) throw new Error('Invalid email or password');
      if (user.status !== 'active') throw new Error('Account is not active');

      await withSupabaseTimeout<any>(
        supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id),
        '更新最后登录时间'
      );

      const token = generateToken(user.id);
      const { password_hash: _, ...safeUser } = user;
      return { user: safeUser, token };
    }

    const users = await userRepository.findAll({ filters: { email }, limit: 1 });
    const user = users[0];
    if (!user || !verifyPassword(input.password, user.password_hash)) {
      throw new Error('Invalid email or password');
    }
    if (user.status !== 'active') {
      throw new Error('Account is not active');
    }

    await userRepository.update(user.id, { last_login_at: new Date().toISOString() });
    const token = generateToken(user.id);
    const { password_hash: _, ...safeUser } = user;
    return { user: safeUser, token };
  }

  async getUserById(id: string): Promise<Omit<User, 'password_hash'> | null> {
    if (config.database.provider === 'supabase') {
      const supabase = getSupabaseClient();
      if (!supabase) return null;

      const result = await withSupabaseTimeout<any>(
        supabase.from('users').select('*').eq('id', id).single(),
        '获取用户信息'
      );
      const user = result.data;
      if (result.error || !user) return null;
      const { password_hash: _, ...safeUser } = user;
      return safeUser;
    }

    const user = await userRepository.findById(id);
    if (!user) return null;
    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  async updateUser(id: string, data: { username?: string; avatar_url?: string }): Promise<Omit<User, 'password_hash'> | null> {
    if (config.database.provider === 'supabase') {
      const supabase = getSupabaseClient();
      if (!supabase) return null;

      const result = await withSupabaseTimeout<any>(
        supabase
          .from('users')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single(),
        '更新用户信息'
      );
      const user = result.data;
      if (result.error || !user) return null;
      const { password_hash: _, ...safeUser } = user;
      return safeUser;
    }

    const user = await userRepository.update(id, data);
    if (!user) return null;
    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  // 本地模式登录: 自动创建/获取默认本地用户, 无需邮箱密码
  // 始终使用 SQLite, 不受 STORAGE_PROVIDER 限制
  async localLogin(): Promise<AuthResult> {
    const localUserRepo = new SqliteRepository<User>('users');
    const LOCAL_USER_ID = 'local-user';
    const existing = await localUserRepo.findById(LOCAL_USER_ID);

    if (existing) {
      await localUserRepo.update(LOCAL_USER_ID, { last_login_at: new Date().toISOString() });
      const token = generateToken(LOCAL_USER_ID);
      const { password_hash: _, ...safeUser } = existing;
      return { user: safeUser, token };
    }

    // 首次使用, 创建默认本地用户
    const now = new Date().toISOString();
    const user = await localUserRepo.create({
      id: LOCAL_USER_ID,
      email: 'local@localhost',
      password_hash: '',
      username: 'Local User',
      avatar_url: null,
      status: 'active',
      last_login_at: now,
    } as any);

    const token = generateToken(user.id);
    const { password_hash: _, ...safeUser } = user;
    return { user: safeUser, token };
  }

  verifyToken(token: string): { userId: string } | null {
    return verifyToken(token);
  }
}

export const authService = new AuthService();
