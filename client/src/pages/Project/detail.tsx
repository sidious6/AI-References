import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  ArrowLeft, BookOpen, FileText, FolderTree,
  Plus, Search, MoreVertical, Upload, Download, Trash2,
  ExternalLink, Calendar, Tag, ChevronRight, Loader2, RefreshCw,
  Check, X, Clock
} from "lucide-react"
import { cn } from "@/lib/utils"
import { 
  projectApi, literatureApi, documentApi, chapterApi,
  type Project, type Literature, type Document as DocType, type Chapter
} from "@/services/api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type TabType = "literature" | "documents" | "structure"

const TAB_CONFIG = [
  { key: "literature" as const, label: "文献", icon: BookOpen },
  { key: "documents" as const, label: "文档", icon: FileText },
  { key: "structure" as const, label: "章节结构", icon: FolderTree },
]

export function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>("literature")
  const [searchQuery, setSearchQuery] = useState("")

  const [project, setProject] = useState<Project | null>(null)
  const [literature, setLiterature] = useState<Literature[]>([])
  const [documents, setDocuments] = useState<DocType[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchProject = async (silent = false) => {
    if (!id) return
    if (!silent) {
      setIsLoading(true)
      setError(null)
    }
    
    try {
      const res = await projectApi.getById(id)
      if (res.success && res.data) {
        setProject(res.data)
      } else {
        setError(res.error || "项目不存在")
      }
    } catch (err) {
      setError("网络错误")
    } finally {
      if (!silent) setIsLoading(false)
    }
  }

  const fetchLiterature = async () => {
    if (!id) return
    const res = await literatureApi.list(id, { search: searchQuery || undefined })
    if (res.success && res.data) {
      setLiterature(res.data)
    }
  }

  const fetchDocuments = async () => {
    if (!id) return
    const res = await documentApi.list(id, { search: searchQuery || undefined })
    if (res.success && res.data) {
      setDocuments(res.data)
    }
  }

  const fetchChapters = async () => {
    if (!id) return
    const res = await chapterApi.getTree(id)
    if (res.success && res.data) {
      setChapters(res.data)
    }
  }

  useEffect(() => {
    fetchProject()
  }, [id])

  useEffect(() => {
    if (!project) return
    if (activeTab === "literature") fetchLiterature()
    else if (activeTab === "documents") fetchDocuments()
    else if (activeTab === "structure") fetchChapters()
  }, [project, activeTab, searchQuery])

  // 页面可见性变化时自动刷新（用户从 Agent 页面切换回来时触发）
  // 使用防抖避免 visibilitychange + focus 同时触发导致重复请求
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !project) return
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(() => {
        if (activeTab === "literature") fetchLiterature()
        else if (activeTab === "documents") fetchDocuments()
        else if (activeTab === "structure") fetchChapters()
        fetchProject(true)
      }, 300)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [project, activeTab, searchQuery])

  const handleDeleteLiterature = async (litId: string) => {
    if (!confirm("确定要删除这篇文献吗？")) return
    const res = await literatureApi.delete(litId)
    if (res.success) {
      setLiterature(prev => prev.filter(l => l.id !== litId))
      if (project) {
        setProject({ ...project, literature_count: project.literature_count - 1 })
      }
    }
  }

  const handleUpdateLiteratureStatus = async (litId: string, status: "approved" | "rejected" | "pending") => {
    const res = await literatureApi.updateStatus(litId, status)
    if (res.success && res.data) {
      setLiterature(prev => prev.map(l => l.id === litId ? res.data! : l))
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm("确定要删除这个文档吗？")) return
    const res = await documentApi.delete(docId)
    if (res.success) {
      setDocuments(prev => prev.filter(d => d.id !== docId))
      if (project) {
        setProject({ ...project, document_count: project.document_count - 1 })
      }
    }
  }

  const handleUploadDocument = async (file: File) => {
    if (!id) return
    const res = await documentApi.upload(id, file)
    if (res.success && res.data) {
      setDocuments(prev => [res.data, ...prev])
      if (project) {
        setProject({ ...project, document_count: project.document_count + 1 })
      }
    } else {
      alert(res.error || "上传失败")
    }
  }

  const handleCreateChapter = async (title: string, parentId?: string) => {
    if (!id) return
    const res = await chapterApi.create(id, { title, parent_id: parentId })
    if (res.success) {
      fetchChapters()
    }
  }

  const handleDeleteChapter = async (chapterId: string) => {
    if (!confirm("确定要删除这个章节吗？")) return
    const res = await chapterApi.delete(chapterId)
    if (res.success) {
      fetchChapters()
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-[hsl(var(--muted-foreground))]">{error || "项目不存在"}</p>
        <button 
          onClick={() => navigate("/project")}
          className="mt-4 text-[hsl(var(--primary))] hover:underline"
        >
          返回项目列表
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button 
              onClick={() => navigate("/project")}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[hsl(var(--secondary))] transition-material"
            >
              <ArrowLeft className="h-5 w-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">{project.name}</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{project.description || "暂无描述"}</p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm text-[hsl(var(--muted-foreground))] mb-4">
            {project.domain && (
              <span className="flex items-center gap-1.5">
                <Tag className="h-4 w-4" />
                {project.domain}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              更新于 {formatDate(project.updated_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              {project.literature_count} 文献
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              {project.document_count} 文档
            </span>
          </div>

          <div className="flex items-center gap-1">
            {TAB_CONFIG.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-material",
                  activeTab === tab.key
                    ? "bg-[hsl(var(--primary))] text-white"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                )}
              >
                <tab.icon className="h-4 w-4" strokeWidth={1.5} />
                {tab.label}
                {tab.key === "literature" && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-xs",
                    activeTab === tab.key ? "bg-white/20" : "bg-[hsl(var(--secondary))]"
                  )}>
                    {project.literature_count}
                  </span>
                )}
                {tab.key === "documents" && (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-xs",
                    activeTab === tab.key ? "bg-white/20" : "bg-[hsl(var(--secondary))]"
                  )}>
                    {project.document_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="px-6 py-4">
        {activeTab !== "structure" && (
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`搜索${TAB_CONFIG.find(t => t.key === activeTab)?.label}...`}
                className="h-10 w-full rounded-full border-0 bg-[hsl(var(--secondary))] pl-10 pr-4 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] transition-material"
              />
            </div>
            <button
              onClick={() => activeTab === "literature" ? fetchLiterature() : fetchDocuments()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--accent))] transition-material"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {activeTab === "literature" && (
          <LiteratureList 
            items={literature} 
            onDelete={handleDeleteLiterature}
            onUpdateStatus={handleUpdateLiteratureStatus}
            formatDate={formatDate}
          />
        )}
        {activeTab === "documents" && (
          <DocumentList 
            items={documents} 
            onDelete={handleDeleteDocument}
            onUpload={handleUploadDocument}
            formatDate={formatDate}
          />
        )}
        {activeTab === "structure" && (
          <StructureView 
            chapters={chapters}
            onCreate={handleCreateChapter}
            onDelete={handleDeleteChapter}
            onRefresh={fetchChapters}
          />
        )}
      </div>
    </div>
  )
}

function LiteratureList({ items, onDelete, onUpdateStatus, formatDate }: { 
  items: Literature[]
  onDelete: (id: string) => void
  onUpdateStatus: (id: string, status: "approved" | "rejected" | "pending") => void
  formatDate: (date: string) => string
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<"none" | "source" | "database" | "status" | "year">("none")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  
  const STATUS_COLORS = {
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-700"
  }
  const STATUS_LABELS = {
    approved: "已通过",
    rejected: "未通过",
    pending: "待审核"
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BookOpen className="h-12 w-12 text-[hsl(var(--muted-foreground))]" strokeWidth={1} />
        <p className="mt-4 text-[hsl(var(--muted-foreground))]">暂无文献</p>
      </div>
    )
  }
  
  const DATABASE_LABELS: Record<string, string> = {
    wos: "Web of Science",
    scopus: "Scopus",
    openalex: "OpenAlex",
    crossref: "CrossRef",
    core: "CORE",
    google: "Google Scholar",
  }

  // 按分组方式组织文献
  const getGroupedItems = () => {
    if (groupBy === "none") {
      return [{ key: "all", label: null, items }]
    }
    if (groupBy === "source") {
      const aiItems = items.filter(i => i.source === "ai")
      const userItems = items.filter(i => i.source === "user")
      return [
        { key: "ai", label: `AI 检索 (${aiItems.length})`, items: aiItems },
        { key: "user", label: `用户导入 (${userItems.length})`, items: userItems },
      ].filter(g => g.items.length > 0)
    }
    if (groupBy === "database") {
      const grouped = new Map<string, Literature[]>()
      items.forEach(item => {
        const db = item.source_database || "unknown"
        if (!grouped.has(db)) grouped.set(db, [])
        grouped.get(db)!.push(item)
      })
      return Array.from(grouped.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([db, dbItems]) => ({
          key: db,
          label: `${DATABASE_LABELS[db] || db.toUpperCase()} (${dbItems.length})`,
          items: dbItems,
        }))
    }
    if (groupBy === "status") {
      const approved = items.filter(i => i.status === "approved")
      const pending = items.filter(i => i.status === "pending")
      const rejected = items.filter(i => i.status === "rejected")
      return [
        { key: "approved", label: `已通过 (${approved.length})`, items: approved },
        { key: "pending", label: `待审核 (${pending.length})`, items: pending },
        { key: "rejected", label: `未通过 (${rejected.length})`, items: rejected },
      ].filter(g => g.items.length > 0)
    }
    if (groupBy === "year") {
      const grouped = new Map<string, Literature[]>()
      items.forEach(item => {
        const yr = item.year ? String(item.year) : "未知年份"
        if (!grouped.has(yr)) grouped.set(yr, [])
        grouped.get(yr)!.push(item)
      })
      return Array.from(grouped.entries())
        .sort((a, b) => {
          if (a[0] === "未知年份") return 1
          if (b[0] === "未知年份") return -1
          return Number(b[0]) - Number(a[0])
        })
        .map(([yr, yrItems]) => ({
          key: yr,
          label: `${yr} (${yrItems.length})`,
          items: yrItems,
        }))
    }
    return [{ key: "all", label: null, items }]
  }

  const renderItem = (item: Literature) => (
    <div key={item.id} className="rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:shadow-sm transition-material overflow-hidden">
      <div 
        className="group flex items-start gap-4 p-4 cursor-pointer"
        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--accent))] shrink-0">
          <BookOpen className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ChevronRight className={cn(
              "h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform shrink-0",
              expandedId === item.id && "rotate-90"
            )} />
            <h4 className="font-medium text-[hsl(var(--foreground))] line-clamp-1">{item.title}</h4>
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5 ml-6">
            {item.authors?.join(", ") || "未知作者"} · {item.year || "未知年份"} · {item.journal || "未知期刊"}
          </p>
          <div className="flex items-center gap-2 mt-2 ml-6">
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[item.status])}>
              {STATUS_LABELS[item.status]}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
              {item.source === "ai" ? "AI检索" : "用户导入"}
            </span>
            {item.source_database && (
              <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
                {DATABASE_LABELS[item.source_database] || item.source_database.toUpperCase()}
              </span>
            )}
            {item.ai_relevance_score && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">
                相关度: {(item.ai_relevance_score * 100).toFixed(0)}%
              </span>
            )}
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {formatDate(item.created_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {item.status === "pending" && (
            <>
              <button
                onClick={() => onUpdateStatus(item.id, "approved")}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-green-100 transition-material"
                title="通过"
              >
                <Check className="h-4 w-4 text-green-600" />
              </button>
              <button
                onClick={() => onUpdateStatus(item.id, "rejected")}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-red-100 transition-material"
                title="拒绝"
              >
                <X className="h-4 w-4 text-red-600" />
              </button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[hsl(var(--secondary))] transition-material opacity-0 group-hover:opacity-100">
                <MoreVertical className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-xl p-1">
              <DropdownMenuItem className="rounded-lg" onClick={() => setExpandedId(item.id)}>
                <ExternalLink className="h-4 w-4 mr-2" />
                查看详情
              </DropdownMenuItem>
              {item.file_url && (
                <DropdownMenuItem className="rounded-lg">
                  <Download className="h-4 w-4 mr-2" />
                  下载PDF
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="rounded-lg" onClick={() => onUpdateStatus(item.id, "pending")}>
                <Clock className="h-4 w-4 mr-2" />
                重置状态
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-lg text-red-600" onClick={() => onDelete(item.id)}>
                <Trash2 className="h-4 w-4 mr-2" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {expandedId === item.id && (
        <div className="px-4 pb-4 pt-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30">
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2">
              <h5 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">摘要</h5>
              {item.abstract ? (
                <p className="text-sm text-[hsl(var(--foreground))] leading-relaxed">{item.abstract}</p>
              ) : (
                <p className="text-sm text-[hsl(var(--muted-foreground))] italic">
                  {item.source_database === 'wos' 
                    ? 'WOS Starter API 不提供摘要' 
                    : item.source_database === 'scopus'
                    ? 'Scopus API 权限限制，无法获取摘要'
                    : '暂无摘要信息'}
                  ，请点击下方链接查看原文
                </p>
              )}
            </div>
            {item.keywords && item.keywords.length > 0 && (
              <div className="col-span-2">
                <h5 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">关键词</h5>
                <div className="flex flex-wrap gap-1">
                  {item.keywords.map((kw, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-[hsl(var(--secondary))] text-xs">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {item.doi && (
              <div>
                <h5 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">DOI</h5>
                <a 
                  href={`https://doi.org/${item.doi}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-[hsl(var(--primary))] hover:underline"
                >
                  {item.doi}
                </a>
              </div>
            )}
            {item.source_database && (
              <div>
                <h5 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">来源数据库</h5>
                <p className="text-sm text-[hsl(var(--foreground))]">{item.source_database.toUpperCase()}</p>
              </div>
            )}
            {item.ai_inclusion_reason && (
              <div className="col-span-2">
                <h5 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">AI 筛选理由</h5>
                <p className="text-sm text-[hsl(var(--foreground))] bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                  {item.ai_inclusion_reason}
                </p>
              </div>
            )}
            <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-[hsl(var(--border))]">
              {item.doi && (
                <a
                  href={`https://doi.org/${item.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(var(--primary))] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  查看原文
                </a>
              )}
              {item.file_url && (
                <a
                  href={item.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] text-xs font-medium hover:bg-[hsl(var(--accent))] transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  下载PDF
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const groups = getGroupedItems()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-[hsl(var(--muted-foreground))]">分组:</span>
        <select
          value={groupBy}
          onChange={(e) => {
            setGroupBy(e.target.value as typeof groupBy)
            setCollapsedGroups(new Set())
          }}
          className="h-8 px-3 rounded-lg border border-[hsl(var(--border))] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        >
          <option value="none">不分组</option>
          <option value="source">按来源类型</option>
          <option value="database">按数据库</option>
          <option value="status">按审核状态</option>
          <option value="year">按发表年份</option>
        </select>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          共 {items.length} 篇
        </span>
      </div>

      {groups.map(group => (
        <div key={group.key}>
          {group.label && (
            <button
              onClick={() => {
                setCollapsedGroups(prev => {
                  const next = new Set(prev)
                  next.has(group.key) ? next.delete(group.key) : next.add(group.key)
                  return next
                })
              }}
              className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--muted-foreground))] mb-2 mt-4 hover:text-[hsl(var(--foreground))] transition-colors w-full text-left"
            >
              <ChevronRight className={cn(
                "h-3.5 w-3.5 transition-transform",
                !collapsedGroups.has(group.key) && "rotate-90"
              )} />
              {group.label}
            </button>
          )}
          {!collapsedGroups.has(group.key) && (
            <div className="space-y-2">
              {group.items.map(item => renderItem(item))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function DocumentList({ items, onDelete, onUpload, formatDate }: { 
  items: DocType[]
  onDelete: (id: string) => void
  onUpload: (file: File) => void
  formatDate: (date: string) => string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const TYPE_ICONS: Record<string, string> = {
    pdf: "📄",
    docx: "📝",
    pptx: "📊",
    xlsx: "📈",
    image: "🖼️",
    other: "📎"
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setIsUploading(true)
    await onUpload(file)
    setIsUploading(false)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-4">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[hsl(var(--secondary))] text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-material disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" strokeWidth={1.5} />
          )}
          {isUploading ? "上传中..." : "上传文档"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <FileText className="h-12 w-12 text-[hsl(var(--muted-foreground))]" strokeWidth={1} />
          <p className="mt-4 text-[hsl(var(--muted-foreground))]">暂无文档</p>
        </div>
      ) : (
        items.map(item => (
          <div key={item.id} className="group flex items-center gap-4 p-4 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:shadow-sm transition-material">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--accent))] text-xl">
              {TYPE_ICONS[item.type] || TYPE_ICONS.other}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-[hsl(var(--foreground))]">{item.name}</h4>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
                {formatSize(item.size)} · {formatDate(item.created_at)}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[hsl(var(--secondary))] transition-material opacity-0 group-hover:opacity-100">
                  <MoreVertical className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded-xl p-1">
                <DropdownMenuItem className="rounded-lg" onClick={() => documentApi.download(item.id)}>
                    <Download className="h-4 w-4 mr-2" />
                    下载
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-lg text-red-600" onClick={() => onDelete(item.id)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))
      )}
    </div>
  )
}

function StructureView({ chapters, onCreate, onDelete, onRefresh }: { 
  chapters: Chapter[]
  onCreate: (title: string, parentId?: string) => void
  onDelete: (id: string) => void
  onRefresh: () => void
}) {
  const [newChapterTitle, setNewChapterTitle] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = () => {
    if (!newChapterTitle.trim()) return
    onCreate(newChapterTitle.trim())
    setNewChapterTitle("")
    setIsAdding(false)
  }

  const renderChapter = (chapter: Chapter, level: number = 0) => (
    <div key={chapter.id}>
      <div 
        className="flex items-center gap-2 p-3 rounded-lg hover:bg-[hsl(var(--secondary))] transition-material cursor-pointer group"
        style={{ paddingLeft: `${12 + level * 24}px` }}
      >
        <ChevronRight className={cn(
          "h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform",
          chapter.children && chapter.children.length > 0 && "rotate-90"
        )} />
        <FolderTree className="h-4 w-4 text-[hsl(var(--primary))]" strokeWidth={1.5} />
        <span className="flex-1 text-sm font-medium">{chapter.title}</span>
        <button
          onClick={() => onDelete(chapter.id)}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-100 transition-material opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-600" />
        </button>
      </div>
      {chapter.children && chapter.children.length > 0 && (
        <div>
          {chapter.children.map(child => renderChapter(child, level + 1))}
        </div>
      )}
    </div>
  )

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        {isAdding ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              placeholder="章节标题..."
              className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!newChapterTitle.trim()}
              className="h-9 px-4 rounded-full bg-[hsl(var(--primary))] text-white text-sm font-medium disabled:opacity-50"
            >
              添加
            </button>
            <button
              onClick={() => { setIsAdding(false); setNewChapterTitle("") }}
              className="h-9 px-4 rounded-full text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
            >
              取消
            </button>
          </div>
        ) : (
          <>
            <button 
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[hsl(var(--secondary))] text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-material"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              添加章节
            </button>
            <button
              onClick={onRefresh}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--accent))] transition-material"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {chapters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <FolderTree className="h-12 w-12 text-[hsl(var(--muted-foreground))]" strokeWidth={1} />
          <p className="mt-4 text-[hsl(var(--muted-foreground))]">暂无章节结构</p>
        </div>
      ) : (
        <div className="space-y-1">
          {chapters.map(chapter => renderChapter(chapter))}
        </div>
      )}
    </div>
  )
}
