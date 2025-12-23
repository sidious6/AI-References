import { useState, useEffect } from "react"
import { 
  Settings, 
  Palette, 
  Database, 
  Server, 
  Key, 
  FileText, 
  ChevronRight,
  Check,
  Sun,
  Moon,
  Monitor,
  Globe,
  HardDrive,
  Shield,
  ExternalLink,
  Loader2,
  AlertCircle,
  Save
} from "lucide-react"
import { cn } from "@/lib/utils"
import { settingsApi, type ModelSettings as ModelSettingsType, type DatasourceSettings as DatasourceSettingsType } from "@/services/api"

type Theme = "light" | "dark" | "system"
type Language = "zh-CN" | "en"

interface SettingSection {
  id: string
  icon: React.ElementType
  label: string
  description: string
}

const sections: SettingSection[] = [
  { id: "general", icon: Palette, label: "通用偏好", description: "主题、语言和界面设置" },
  { id: "model", icon: Server, label: "模型配置", description: "AI 模型和 API 设置" },
  { id: "datasource", icon: Database, label: "数据源", description: "文献数据库 API 配置" },
  { id: "environment", icon: Key, label: "运行环境", description: "系统环境和数据目录" },
  { id: "logs", icon: FileText, label: "日志诊断", description: "查看运行日志和诊断信息" },
]

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState("general")

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent))]">
              <Settings className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.5} />
            </div>
            <h1 className="text-lg font-medium text-[hsl(var(--foreground))]">设置</h1>
          </div>
        </div>
        <nav className="px-3 pb-6">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-material text-left mb-1",
                activeSection === section.id
                  ? "bg-[hsl(var(--accent))] text-[hsl(var(--primary))]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
              )}
            >
              <section.icon className="h-5 w-5" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{section.label}</p>
              </div>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl px-8 py-8">
          {activeSection === "general" && <GeneralSettings />}
          {activeSection === "model" && <ModelSettings />}
          {activeSection === "datasource" && <DataSourceSettings />}
          {activeSection === "environment" && <EnvironmentSettings />}
          {activeSection === "logs" && <LogsSettings />}
        </div>
      </main>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <Icon className="h-6 w-6 text-[hsl(var(--primary))]" strokeWidth={1.5} />
        <h2 className="text-xl font-medium text-[hsl(var(--foreground))]">{title}</h2>
      </div>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
    </div>
  )
}

function SettingCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-5", className)}>
      {children}
    </div>
  )
}

function GeneralSettings() {
  const [theme, setTheme] = useState<Theme>("light")
  const [language, setLanguage] = useState<Language>("zh-CN")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const res = await settingsApi.getGeneral()
      if (res.success && res.data) {
        setTheme((res.data.theme as Theme) || "light")
        setLanguage((res.data.language as Language) || "zh-CN")
      }
      setIsLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    await settingsApi.updateGeneral({ theme, language })
    setIsSaving(false)
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  return (
    <div>
      <SectionHeader icon={Palette} title="通用偏好" description="自定义界面外观和语言设置" />
      
      <div className="space-y-4">
        <SettingCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--secondary))]">
                {theme === "light" ? <Sun className="h-5 w-5" /> : theme === "dark" ? <Moon className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-medium text-[hsl(var(--foreground))]">主题</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">选择界面显示主题</p>
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-full bg-[hsl(var(--secondary))]">
              {[
                { value: "light", icon: Sun, label: "浅色" },
                { value: "dark", icon: Moon, label: "深色" },
                { value: "system", icon: Monitor, label: "系统" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value as Theme)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-material",
                    theme === opt.value
                      ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </SettingCard>

        <SettingCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--secondary))]">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-[hsl(var(--foreground))]">语言</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">界面显示语言</p>
              </div>
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="h-10 px-4 rounded-full bg-[hsl(var(--secondary))] text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] cursor-pointer"
            >
              <option value="zh-CN">简体中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </SettingCard>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[hsl(var(--primary))] text-white text-sm font-medium hover:shadow-md transition-material disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "保存中..." : "保存设置"}
        </button>
      </div>
    </div>
  )
}

function ModelSettings() {
  const [settings, setSettings] = useState<ModelSettingsType>({
    provider: "openai",
    model: "gpt-4",
    api_key: "",
    base_url: "",
    temperature: 0.7,
    max_tokens: 4096
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await settingsApi.getModel()
      if (res.success && res.data) {
        setSettings(res.data)
      }
      setIsLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    const res = await settingsApi.updateModel(settings)
    setIsSaving(false)
    if (res.success) {
      setTestResult({ success: true, message: "配置已保存" })
    } else {
      setTestResult({ success: false, message: res.error || "保存失败" })
    }
    setTimeout(() => setTestResult(null), 3000)
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    const res = await settingsApi.testLLM(settings)
    setIsTesting(false)
    if (res.success && res.data) {
      setTestResult({ success: res.data.success, message: res.data.message })
    } else {
      setTestResult({ success: false, message: res.error || "测试失败" })
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  const providers = [
    { id: "openai", name: "OpenAI", models: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"] },
    { id: "anthropic", name: "Anthropic", models: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"] },
    { id: "google", name: "Google", models: ["gemini-pro", "gemini-pro-vision"] },
    { id: "custom", name: "自定义", models: [] },
  ]

  const currentProvider = providers.find(p => p.id === settings.provider)

  return (
    <div>
      <SectionHeader icon={Server} title="模型配置" description="配置 AI 模型和 API 密钥" />
      
      <div className="space-y-4">
        <SettingCard>
          <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-4">服务提供商</p>
          <div className="grid grid-cols-2 gap-2">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => setSettings(s => ({ ...s, provider: provider.id, model: provider.models[0] || s.model }))}
                className={cn(
                  "p-4 rounded-xl transition-material text-left",
                  settings.provider === provider.id
                    ? "bg-[hsl(var(--accent))] ring-2 ring-[hsl(var(--primary))]"
                    : "bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--accent))]"
                )}
              >
                <p className="font-medium text-[hsl(var(--foreground))]">{provider.name}</p>
              </button>
            ))}
          </div>
        </SettingCard>

        <SettingCard>
          <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-4">API 配置</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5 block">API 地址 (可选)</label>
              <input
                type="text"
                value={settings.base_url}
                onChange={(e) => setSettings(s => ({ ...s, base_url: e.target.value }))}
                placeholder="https://api.openai.com/v1"
                className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--secondary))] text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
              />
            </div>
            <div>
              <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5 block">API Key</label>
              <input
                type="password"
                value={settings.api_key}
                onChange={(e) => setSettings(s => ({ ...s, api_key: e.target.value }))}
                placeholder="sk-..."
                className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--secondary))] text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
              />
            </div>
            {currentProvider && currentProvider.models.length > 0 ? (
              <div>
                <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5 block">模型</label>
                <select
                  value={settings.model}
                  onChange={(e) => setSettings(s => ({ ...s, model: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--secondary))] text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                >
                  {currentProvider.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5 block">模型名称</label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => setSettings(s => ({ ...s, model: e.target.value }))}
                  placeholder="model-name"
                  className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--secondary))] text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
                />
              </div>
            )}
          </div>
        </SettingCard>

        {testResult && (
          <div className={cn(
            "flex items-center gap-2 p-4 rounded-xl",
            testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          )}>
            {testResult.success ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            <span className="text-sm">{testResult.message}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={isTesting || !settings.api_key}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[hsl(var(--secondary))] text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-material disabled:opacity-50"
          >
            {isTesting && <Loader2 className="h-4 w-4 animate-spin" />}
            测试连接
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[hsl(var(--primary))] text-white text-sm font-medium hover:shadow-md transition-material disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </div>
    </div>
  )
}

function DataSourceSettings() {
  const [settings, setSettings] = useState<DatasourceSettingsType>({
    wos_api_key: "",
    scopus_api_key: "",
    default_databases: ["pubmed"],
    max_results: 50
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const res = await settingsApi.getDatasource()
      if (res.success && res.data) {
        setSettings(res.data)
      }
      setIsLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    await settingsApi.updateDatasource(settings)
    setIsSaving(false)
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  return (
    <div>
      <SectionHeader icon={Database} title="数据源配置" description="配置文献数据库的 API 访问" />
      
      <div className="space-y-4">
        <SettingCard>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
              <span className="text-lg font-bold text-orange-600">W</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-[hsl(var(--foreground))]">Web of Science</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Clarivate Analytics</p>
            </div>
            <a href="https://developer.clarivate.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-[hsl(var(--primary))] hover:underline flex items-center gap-1">
              获取 API Key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <input
            type="password"
            value={settings.wos_api_key}
            onChange={(e) => setSettings(s => ({ ...s, wos_api_key: e.target.value }))}
            placeholder="输入 Web of Science API Key"
            className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--secondary))] text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
          />
        </SettingCard>

        <SettingCard>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
              <span className="text-lg font-bold text-orange-500">S</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-[hsl(var(--foreground))]">Scopus</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Elsevier</p>
            </div>
            <a href="https://dev.elsevier.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-[hsl(var(--primary))] hover:underline flex items-center gap-1">
              获取 API Key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <input
            type="password"
            value={settings.scopus_api_key}
            onChange={(e) => setSettings(s => ({ ...s, scopus_api_key: e.target.value }))}
            placeholder="输入 Scopus API Key"
            className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--secondary))] text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
          />
        </SettingCard>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[hsl(var(--primary))] text-white text-sm font-medium hover:shadow-md transition-material disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "保存中..." : "保存配置"}
        </button>
      </div>
    </div>
  )
}

function EnvironmentSettings() {
  const [envInfo, setEnvInfo] = useState<{
    node_version: string
    platform: string
    disk_space: { total: string; free: string; used_percent: string }
    data_directory: string
    supabase_connected: boolean
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)

  const loadEnv = async () => {
    setIsChecking(true)
    const res = await settingsApi.getEnvironment()
    if (res.success && res.data) {
      setEnvInfo(res.data)
    }
    setIsLoading(false)
    setIsChecking(false)
  }

  useEffect(() => {
    loadEnv()
  }, [])

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  return (
    <div>
      <SectionHeader icon={Key} title="运行环境" description="系统环境检查和数据目录配置" />
      
      <div className="space-y-4">
        <SettingCard>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--secondary))]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-[hsl(var(--foreground))]">运行模式</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">当前：本地直跑</p>
              </div>
            </div>
            <button 
              onClick={loadEnv}
              disabled={isChecking}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[hsl(var(--primary))] text-white text-sm font-medium hover:shadow-md transition-material disabled:opacity-50"
            >
              {isChecking && <Loader2 className="h-4 w-4 animate-spin" />}
              环境自检
            </button>
          </div>
          {envInfo && (
            <div className="rounded-xl bg-[hsl(var(--secondary))] p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-[hsl(var(--foreground))]">Node.js {envInfo.node_version}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-[hsl(var(--foreground))]">平台: {envInfo.platform}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-[hsl(var(--foreground))]">磁盘空间: {envInfo.disk_space.free} 可用 ({envInfo.disk_space.used_percent} 已用)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {envInfo.supabase_connected ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-[hsl(var(--foreground))]">
                  Supabase: {envInfo.supabase_connected ? "已连接" : "未连接"}
                </span>
              </div>
            </div>
          )}
        </SettingCard>

        <SettingCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--secondary))]">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-[hsl(var(--foreground))]">数据目录</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))] font-mono">{envInfo?.data_directory || "./data"}</p>
              </div>
            </div>
          </div>
        </SettingCard>
      </div>
    </div>
  )
}

function LogsSettings() {
  return (
    <div>
      <SectionHeader icon={FileText} title="日志与诊断" description="查看系统运行日志和诊断信息" />
      
      <div className="space-y-4">
        <SettingCard>
          <div className="flex items-center justify-between mb-4">
            <p className="font-medium text-[hsl(var(--foreground))]">运行日志</p>
            <button className="text-sm text-[hsl(var(--primary))] hover:underline">
              导出日志
            </button>
          </div>
          <div className="rounded-xl bg-[hsl(213,27%,8%)] p-4 font-mono text-xs text-gray-300 max-h-64 overflow-auto">
            <p className="text-gray-500">[{new Date().toISOString()}] INFO: Application started</p>
            <p className="text-gray-500">[{new Date().toISOString()}] INFO: Connected to database</p>
            <p className="text-green-400">[{new Date().toISOString()}] SUCCESS: Server ready</p>
          </div>
        </SettingCard>

        <SettingCard>
          <button className="w-full flex items-center justify-between py-2 text-left">
            <div>
              <p className="font-medium text-[hsl(var(--foreground))]">清除缓存</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">清除本地缓存数据</p>
            </div>
            <ChevronRight className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
          </button>
        </SettingCard>
      </div>
    </div>
  )
}
