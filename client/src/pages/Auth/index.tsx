import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Loader2, HardDrive, Cloud } from 'lucide-react';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';

type AuthMode = 'login' | 'register';

export function AuthPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await authApi.login({
          email: form.email,
          password: form.password,
        });
        if (res.success && res.data) {
          setAuth(res.data.user, res.data.token);
          navigate('/project');
        } else {
          setError(res.error || '登录失败');
        }
      } else {
        if (form.password.length < 6) {
          setError('密码至少需要6个字符');
          setLoading(false);
          return;
        }
        const res = await authApi.register({
          email: form.email,
          password: form.password,
          username: form.username || undefined,
        });
        if (res.success && res.data) {
          setAuth(res.data.user, res.data.token);
          navigate('/project');
        } else {
          setError(res.error || '注册失败');
        }
      }
    } catch (err: any) {
      setError(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 本地模式登录
  const handleLocalLogin = async () => {
    setError('');
    setLocalLoading(true);
    try {
      const res = await authApi.localLogin();
      if (res.success && res.data) {
        setAuth(res.data.user, res.data.token);
        navigate('/project');
      } else {
        setError(res.error || '本地登录失败');
      }
    } catch (err: any) {
      setError(err.message || '本地登录失败');
    } finally {
      setLocalLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] mb-4">
            <span className="text-2xl font-bold text-white">AI</span>
          </div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
            AI 科研写作工作台
          </h1>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            {mode === 'login' ? '登录您的账号' : '创建新账号'}
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-8">
          {/* 本地模式入口 - 始终显示 */}
          <button
            onClick={handleLocalLogin}
            disabled={localLoading}
            className="w-full h-12 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] font-medium hover:bg-[hsl(var(--accent))] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5"
          >
            {localLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <HardDrive className="h-5 w-5" />
            )}
            <span>本地模式</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">- 无需注册, 数据存储在本地</span>
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[hsl(var(--border))]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]">
                或使用云端账号
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username (register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  用户名
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="输入用户名（可选）"
                    className="w-full h-12 pl-11 pr-4 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:border-transparent transition-all"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="输入邮箱地址"
                  required
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={mode === 'register' ? '设置密码（至少6位）' : '输入密码'}
                  required
                  minLength={mode === 'register' ? 6 : undefined}
                  className="w-full h-12 pl-11 pr-12 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-[hsl(var(--destructive)/0.1)] border border-[hsl(var(--destructive)/0.3)]">
                <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[hsl(var(--primary))] text-white font-medium hover:bg-[hsl(var(--primary)/0.9)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              <Cloud className="h-5 w-5" />
              {mode === 'login' ? '登录' : '注册'}
            </button>
          </form>

          {/* Switch Mode */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {mode === 'login' ? '还没有账号？' : '已有账号？'}
              <button
                onClick={switchMode}
                className="ml-1 text-[hsl(var(--primary))] hover:underline font-medium"
              >
                {mode === 'login' ? '立即注册' : '去登录'}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
          继续即表示您同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  );
}

export default AuthPage;
