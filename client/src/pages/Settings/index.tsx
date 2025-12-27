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
  Save,
  Plus,
  Trash2,
  Eye,
  EyeOff
} from "lucide-react"
import { cn } from "@/lib/utils"
import { settingsApi } from "@/services/api"

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

function SecretInput({ 
  value, 
  onChange, 
  placeholder,
  masked
}: { 
  value: string
  onChange: (v: string) => void
  placeholder?: string
  masked?: string
}) {
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState(false)

  const displayValue = editing ? value : (masked || value)
  const isSecret = !editing && masked && !value

  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={displayValue}
        onChange={(e) => {
          setEditing(true)
          onChange(e.target.value)
        }}
        onFocus={() => setEditing(true)}
        placeholder={placeholder}
        className={cn(
          "w-full h-11 px-4 pr-10 rounded-xl bg-[hsl(var(--secondary))] text-sm border-0",
          "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]",
          "placeholder:text-[hsl(var(--muted-foreground))]",
          isSecret && "text-[hsl(var(--muted-foreground))]"
        )}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
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

interface ModelEndpoint {
  id: string
  name: string
  protocol: 'openai' | 'anthropic' | 'google'
  base_url: string
  api_key: string
  api_key_masked?: string
  default_model: string
  is_preset: boolean
  enabled: boolean
}

interface ModelSettingsData {
  default_endpoint_id: string
  endpoints: ModelEndpoint[]
}

function ModelSettings() {
  const [settings, setSettings] = useState<ModelSettingsData | null>(null)
  const [editingEndpoint, setEditingEndpoint] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState<Record<string, string>>({})
  const [newModel, setNewModel] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const res = await settingsApi.getModel()
    if (res.success && res.data) {
      setSettings(res.data as ModelSettingsData)
    }
    setIsLoading(false)
  }

  const handleSaveEndpoint = async (endpoint: ModelEndpoint) => {
    setIsSaving(true)
    const apiKey = newApiKey[endpoint.id]
    const model = newModel[endpoint.id]
    
    const res = await settingsApi.updateModel({
      endpoint: {
        id: endpoint.id,
        ...(apiKey ? { api_key: apiKey } : {}),
        ...(model ? { default_model: model } : {}),
        enabled: endpoint.enabled,
      }
    })
    
    if (res.success) {
      setMessage({ type: 'success', text: `${endpoint.name} 配置已保存` })
      setNewApiKey(prev => ({ ...prev, [endpoint.id]: '' }))
      setEditingEndpoint(null)
      await loadSettings()
    } else {
      setMessage({ type: 'error', text: res.error || '保存失败' })
    }
    setIsSaving(false)
    setTimeout(() => setMessage(null), 3000)
  }

  const handleSetDefault = async (endpointId: string) => {
    const res = await settingsApi.updateModel({ default_endpoint_id: endpointId })
    if (res.success) {
      setSettings(prev => prev ? { ...prev, default_endpoint_id: endpointId } : null)
      setMessage({ type: 'success', text: '默认端点已更新' })
    }
    setTimeout(() => setMessage(null), 3000)
  }

  if (isLoading || !settings) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  const presetEndpoints = settings.endpoints.filter(e => e.is_preset)

  return (
    <div>
      <SectionHeader icon={Server} title="模型配置" description="配置 AI 模型端点和 API 密钥" />
      
      {message && (
        <div className={cn(
          "flex items-center gap-2 p-4 rounded-xl mb-4",
          message.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        )}>
          {message.type === 'success' ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      <div className="space-y-4">
        {presetEndpoints.map((endpoint) => (
          <SettingCard key={endpoint.id}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  endpoint.api_key_masked ? "bg-green-50" : "bg-[hsl(var(--secondary))]"
                )}>
                  <Server className={cn("h-5 w-5", endpoint.api_key_masked ? "text-green-600" : "")} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[hsl(var(--foreground))]">{endpoint.name}</p>
                    {settings.default_endpoint_id === endpoint.id && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--primary))] text-white">默认</span>
                    )}
                  </div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {endpoint.api_key_masked ? `已配置 (${endpoint.api_key_masked})` : '未配置'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {endpoint.api_key_masked && settings.default_endpoint_id !== endpoint.id && (
                  <button
                    onClick={() => handleSetDefault(endpoint.id)}
                    className="text-xs px-3 py-1.5 rounded-full bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--accent))]"
                  >
                    设为默认
                  </button>
                )}
                <button
                  onClick={() => setEditingEndpoint(editingEndpoint === endpoint.id ? null : endpoint.id)}
                  className="text-sm text-[hsl(var(--primary))] hover:underline"
                >
                  {editingEndpoint === endpoint.id ? '收起' : '配置'}
                </button>
              </div>
            </div>

            {editingEndpoint === endpoint.id && (
              <div className="space-y-3 pt-4 border-t border-[hsl(var(--border))]">
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5 block">API Key</label>
                  <SecretInput
                    value={newApiKey[endpoint.id] || ''}
                    onChange={(v) => setNewApiKey(prev => ({ ...prev, [endpoint.id]: v }))}
                    placeholder="输入新的 API Key"
                    masked={endpoint.api_key_masked}
                  />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5 block">模型名称</label>
                  <input
                    type="text"
                    value={newModel[endpoint.id] ?? endpoint.default_model}
                    onChange={(e) => setNewModel(prev => ({ ...prev, [endpoint.id]: e.target.value }))}
                    placeholder="如 gpt-4o, claude-3-5-sonnet-20241022"
                    className="w-full h-11 px-4 rounded-xl bg-[hsl(var(--secondary))] text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleSaveEndpoint(endpoint)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[hsl(var(--primary))] text-white text-sm font-medium hover:shadow-md transition-material disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    保存
                  </button>
                </div>
              </div>
            )}
          </SettingCard>
        ))}
      </div>
    </div>
  )
}

interface DatasourceSettingsData {
  wos: {
    enabled: boolean
    api_key_masked?: string
  }
  scopus: {
    enabled: boolean
    api_key_masked?: string
    insttoken_masked?: string
  }
}

function DataSourceSettings() {
  const [settings, setSettings] = useState<DatasourceSettingsData | null>(null)
  const [wosApiKey, setWosApiKey] = useState('')
  const [scopusApiKey, setScopusApiKey] = useState('')
  const [scopusInsttoken, setScopusInsttoken] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const res = await settingsApi.getDatasource()
    if (res.success && res.data) {
      setSettings(res.data as DatasourceSettingsData)
    }
    setIsLoading(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    const res = await settingsApi.updateDatasource({
      wos: wosApiKey ? { api_key: wosApiKey } : undefined,
      scopus: (scopusApiKey || scopusInsttoken) ? {
        ...(scopusApiKey ? { api_key: scopusApiKey } : {}),
        ...(scopusInsttoken ? { insttoken: scopusInsttoken } : {}),
      } : undefined,
    })
    
    if (res.success) {
      setMessage({ type: 'success', text: '数据源配置已保存' })
      setWosApiKey('')
      setScopusApiKey('')
      setScopusInsttoken('')
      await loadSettings()
    } else {
      setMessage({ type: 'error', text: res.error || '保存失败' })
    }
    setIsSaving(false)
    setTimeout(() => setMessage(null), 3000)
  }

  if (isLoading || !settings) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  return (
    <div>
      <SectionHeader icon={Database} title="数据源配置" description="配置文献数据库的 API 访问" />
      
      {message && (
        <div className={cn(
          "flex items-center gap-2 p-4 rounded-xl mb-4",
          message.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        )}>
          {message.type === 'success' ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      <div className="space-y-4">
        <SettingCard>
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              settings.wos.api_key_masked ? "bg-orange-50" : "bg-[hsl(var(--secondary))]"
            )}>
              <span className={cn("text-lg font-bold", settings.wos.api_key_masked ? "text-orange-600" : "")}>W</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-[hsl(var(--foreground))]">Web of Science</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {settings.wos.api_key_masked ? `已配置 (${settings.wos.api_key_masked})` : '未配置'}
              </p>
            </div>
            <a href="https://developer.clarivate.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-[hsl(var(--primary))] hover:underline flex items-center gap-1">
              获取 API Key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <SecretInput
            value={wosApiKey}
            onChange={setWosApiKey}
            placeholder="输入新的 API Key"
            masked={settings.wos.api_key_masked}
          />
        </SettingCard>

        <SettingCard>
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              settings.scopus.api_key_masked ? "bg-orange-50" : "bg-[hsl(var(--secondary))]"
            )}>
              <span className={cn("text-lg font-bold", settings.scopus.api_key_masked ? "text-orange-500" : "")}>S</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-[hsl(var(--foreground))]">Scopus</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {settings.scopus.api_key_masked ? `已配置 (${settings.scopus.api_key_masked})` : '未配置'}
              </p>
            </div>
            <a href="https://dev.elsevier.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-[hsl(var(--primary))] hover:underline flex items-center gap-1">
              获取 API Key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5 block">API Key</label>
              <SecretInput
                value={scopusApiKey}
                onChange={setScopusApiKey}
                placeholder="输入新的 API Key"
                masked={settings.scopus.api_key_masked}
              />
            </div>
            <div>
              <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1.5 block">
                Insttoken <span className="text-[hsl(var(--muted-foreground))]">(可选，用于获取完整摘要)</span>
              </label>
              <SecretInput
                value={scopusInsttoken}
                onChange={setScopusInsttoken}
                placeholder="输入机构令牌"
                masked={settings.scopus.insttoken_masked}
              />
            </div>
          </div>
        </SettingCard>

        <button
          onClick={handleSave}
          disabled={isSaving || (!wosApiKey && !scopusApiKey && !scopusInsttoken)}
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
    arch: string
    data_dir: string
    data_dir_exists: boolean
    data_dir_size: string
    supabase_connected: boolean
    llm_configured: boolean
    default_endpoint: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)

  const loadEnv = async () => {
    setIsChecking(true)
    const res = await settingsApi.getEnvironment()
    if (res.success && res.data) {
      setEnvInfo(res.data as typeof envInfo)
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
                <span className="text-[hsl(var(--foreground))]">平台: {envInfo.platform} ({envInfo.arch})</span>
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
              <div className="flex items-center gap-2 text-sm">
                {envInfo.llm_configured ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-[hsl(var(--foreground))]">
                  LLM: {envInfo.llm_configured ? envInfo.default_endpoint : "未配置"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {envInfo.data_dir_exists ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-[hsl(var(--foreground))]">
                  数据目录: {envInfo.data_dir_size}
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
                <p className="text-sm text-[hsl(var(--muted-foreground))] font-mono">{envInfo?.data_dir || "./data"}</p>
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
