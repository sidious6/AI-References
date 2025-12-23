import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  Plus, Search, LayoutGrid, List, MoreVertical, Calendar, 
  FileText, FolderKanban, Filter, SortAsc, BookOpen,
  Trash2, Edit3, ExternalLink, Loader2, RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { projectApi, type Project as ApiProject } from "@/services/api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

type ViewMode = "grid" | "list"
type SortBy = "updated_at" | "created_at" | "name" | "literature_count"

const STATUS_LABELS: Record<string, string> = {
  researching: "调研中",
  searching: "检索中",
  screening: "筛选中",
  writing: "写作中",
  completed: "已完成"
}

const STATUS_COLORS: Record<string, string> = {
  researching: "bg-blue-100 text-blue-700",
  searching: "bg-amber-100 text-amber-700",
  screening: "bg-purple-100 text-purple-700",
  writing: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-600"
}

export function ProjectPage() {
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [domains, setDomains] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortBy>("updated_at")
  const [filterDomain, setFilterDomain] = useState<string>("all")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchProjects = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [projectsRes, domainsRes] = await Promise.all([
        projectApi.list({ search: searchQuery || undefined, domain: filterDomain !== "all" ? filterDomain : undefined }),
        projectApi.getDomains()
      ])
      
      if (projectsRes.success && projectsRes.data) {
        setProjects(projectsRes.data)
      } else {
        setError(projectsRes.error || "Failed to load projects")
      }
      
      if (domainsRes.success && domainsRes.data) {
        setDomains(domainsRes.data)
      }
    } catch (err) {
      setError("Network error")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const filteredProjects = useMemo(() => {
    let result = projects

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(p => 
        p.name.toLowerCase().includes(query) || 
        (p.description?.toLowerCase().includes(query)) ||
        p.tags.some(t => t.toLowerCase().includes(query))
      )
    }

    if (filterDomain !== "all") {
      result = result.filter(p => p.domain === filterDomain)
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name)
        case "created_at":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case "literature_count":
          return b.literature_count - a.literature_count
        case "updated_at":
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      }
    })

    return result
  }, [projects, searchQuery, sortBy, filterDomain])

  const handleCreateProject = async (data: { name: string; description: string; domain: string }) => {
    setIsSubmitting(true)
    try {
      const res = await projectApi.create({
        name: data.name,
        description: data.description,
        domain: data.domain || undefined,
        tags: []
      })
      
      if (res.success && res.data) {
        setProjects(prev => [res.data!, ...prev])
        setIsCreateDialogOpen(false)
      } else {
        alert(res.error || "创建失败")
      }
    } catch (err) {
      alert("网络错误")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteProject = async (id: string) => {
    if (!confirm("确定要删除这个项目吗？")) return
    
    const res = await projectApi.delete(id)
    if (res.success) {
      setProjects(prev => prev.filter(p => p.id !== id))
    } else {
      alert(res.error || "删除失败")
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-[hsl(var(--background))] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索项目..."
              className="h-11 w-full rounded-full border-0 bg-[hsl(var(--secondary))] pl-12 pr-4 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] transition-material"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm transition-material",
                filterDomain !== "all" 
                  ? "bg-[hsl(var(--primary))] text-white" 
                  : "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
              )}>
                <Filter className="h-4 w-4" strokeWidth={1.5} />
                {filterDomain === "all" ? "筛选" : filterDomain}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40 rounded-xl p-1">
              <DropdownMenuItem 
                onClick={() => setFilterDomain("all")}
                className={cn("rounded-lg", filterDomain === "all" && "bg-[hsl(var(--accent))]")}
              >
                全部领域
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {domains.map(domain => (
                <DropdownMenuItem 
                  key={domain}
                  onClick={() => setFilterDomain(domain)}
                  className={cn("rounded-lg", filterDomain === domain && "bg-[hsl(var(--accent))]")}
                >
                  {domain}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-[hsl(var(--secondary))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-material">
                <SortAsc className="h-4 w-4" strokeWidth={1.5} />
                排序
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40 rounded-xl p-1">
              <DropdownMenuItem 
                onClick={() => setSortBy("updated_at")}
                className={cn("rounded-lg", sortBy === "updated_at" && "bg-[hsl(var(--accent))]")}
              >
                最近更新
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortBy("created_at")}
                className={cn("rounded-lg", sortBy === "created_at" && "bg-[hsl(var(--accent))]")}
              >
                创建时间
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortBy("name")}
                className={cn("rounded-lg", sortBy === "name" && "bg-[hsl(var(--accent))]")}
              >
                名称
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortBy("literature_count")}
                className={cn("rounded-lg", sortBy === "literature_count" && "bg-[hsl(var(--accent))]")}
              >
                文献数量
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-1 rounded-full bg-[hsl(var(--secondary))] p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-material",
                viewMode === "grid"
                  ? "bg-[hsl(var(--card))] shadow-sm text-[hsl(var(--foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              )}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-material",
                viewMode === "list"
                  ? "bg-[hsl(var(--card))] shadow-sm text-[hsl(var(--foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              )}
            >
              <List className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <button
            onClick={fetchProjects}
            disabled={isLoading}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--accent))] transition-material"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} strokeWidth={1.5} />
          </button>

          <button 
            onClick={() => setIsCreateDialogOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[hsl(var(--primary))] text-white font-medium text-sm transition-material hover:shadow-md active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            创建项目
          </button>
        </div>
      </header>

      <div className="px-6 pb-6">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={fetchProjects} />
        ) : filteredProjects.length === 0 ? (
          searchQuery || filterDomain !== "all" ? (
            <NoResults onClear={() => { setSearchQuery(""); setFilterDomain("all") }} />
          ) : (
            <EmptyState onCreateClick={() => setIsCreateDialogOpen(true)} />
          )
        ) : viewMode === "grid" ? (
          <ProjectGrid projects={filteredProjects} onDelete={handleDeleteProject} formatDate={formatDate} />
        ) : (
          <ProjectList projects={filteredProjects} onDelete={handleDeleteProject} formatDate={formatDate} />
        )}
      </div>

      <CreateProjectDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={handleCreateProject}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Loader2 className="h-10 w-10 animate-spin text-[hsl(var(--primary))]" />
      <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">加载中...</p>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
        <span className="text-2xl">!</span>
      </div>
      <h3 className="mt-4 text-lg font-medium text-[hsl(var(--foreground))]">加载失败</h3>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
      <button 
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[hsl(var(--primary))] text-white text-sm font-medium"
      >
        <RefreshCw className="h-4 w-4" />
        重试
      </button>
    </div>
  )
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[hsl(var(--secondary))]">
        <FolderKanban className="h-10 w-10 text-[hsl(var(--muted-foreground))]" strokeWidth={1} />
      </div>
      <h3 className="mt-6 text-xl font-medium text-[hsl(var(--foreground))]">暂无项目</h3>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))] text-center max-w-sm">
        创建一个新项目开始你的研究之旅，管理文献、生成综述
      </p>
      <button 
        onClick={onCreateClick}
        className="mt-6 inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[hsl(var(--primary))] text-white font-medium text-sm transition-material hover:shadow-md active:scale-[0.98]"
      >
        <Plus className="h-5 w-5" strokeWidth={2} />
        创建第一个项目
      </button>
    </div>
  )
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))]">
        <Search className="h-8 w-8 text-[hsl(var(--muted-foreground))]" strokeWidth={1} />
      </div>
      <h3 className="mt-4 text-lg font-medium text-[hsl(var(--foreground))]">未找到匹配项目</h3>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        尝试调整搜索条件或筛选器
      </p>
      <button 
        onClick={onClear}
        className="mt-4 text-sm text-[hsl(var(--primary))] hover:underline"
      >
        清除筛选条件
      </button>
    </div>
  )
}

function ProjectGrid({ projects, onDelete, formatDate }: { 
  projects: ApiProject[]
  onDelete: (id: string) => void
  formatDate: (date: string) => string
}) {
  const navigate = useNavigate()
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {projects.map((project) => (
        <ProjectCard 
          key={project.id} 
          project={project} 
          onClick={() => navigate(`/project/${project.id}`)}
          onDelete={() => onDelete(project.id)}
          formatDate={formatDate}
        />
      ))}
    </div>
  )
}

function ProjectCard({ project, onClick, onDelete, formatDate }: { 
  project: ApiProject
  onClick: () => void
  onDelete: () => void
  formatDate: (date: string) => string
}) {
  return (
    <div onClick={onClick} className="group rounded-2xl bg-[hsl(var(--card))] p-5 transition-material hover:shadow-md cursor-pointer border border-[hsl(var(--border))]">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent))]">
          <FolderKanban className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.5} />
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            STATUS_COLORS[project.status] || "bg-gray-100 text-gray-600"
          )}>
            {STATUS_LABELS[project.status] || project.status}
          </span>
          <ProjectMenu onDelete={onDelete} />
        </div>
      </div>
      <h3 className="mt-4 font-medium text-[hsl(var(--foreground))] line-clamp-1">{project.name}</h3>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))] line-clamp-2">{project.description || "暂无描述"}</p>
      
      {project.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {project.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-full bg-[hsl(var(--secondary))] text-xs text-[hsl(var(--muted-foreground))]">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
        <span className="flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          {project.literature_count}
        </span>
        <span className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          {project.document_count}
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <Calendar className="h-3.5 w-3.5" />
          {formatDate(project.updated_at)}
        </span>
      </div>
    </div>
  )
}

function ProjectList({ projects, onDelete, formatDate }: { 
  projects: ApiProject[]
  onDelete: (id: string) => void
  formatDate: (date: string) => string
}) {
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      {projects.map((project, index) => (
        <div
          key={project.id}
          onClick={() => navigate(`/project/${project.id}`)}
          className={cn(
            "flex items-center gap-4 px-5 py-4 transition-material hover:bg-[hsl(var(--secondary))] cursor-pointer group",
            index !== projects.length - 1 && "border-b border-[hsl(var(--border))]"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent))]">
            <FolderKanban className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-[hsl(var(--foreground))] truncate">{project.name}</h3>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                STATUS_COLORS[project.status] || "bg-gray-100 text-gray-600"
              )}>
                {STATUS_LABELS[project.status] || project.status}
              </span>
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))] truncate">{project.description || "暂无描述"}</p>
          </div>
          <div className="flex items-center gap-6 text-sm text-[hsl(var(--muted-foreground))] shrink-0">
            <span className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              {project.literature_count}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {project.document_count}
            </span>
            <span>{formatDate(project.updated_at)}</span>
          </div>
          <ProjectMenu onDelete={() => onDelete(project.id)} />
        </div>
      ))}
    </div>
  )
}

function ProjectMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          onClick={(e) => e.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[hsl(var(--secondary))] transition-material opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 rounded-xl p-1">
        <DropdownMenuItem className="rounded-lg">
          <ExternalLink className="h-4 w-4 mr-2" />
          打开项目
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-lg">
          <Edit3 className="h-4 w-4 mr-2" />
          编辑信息
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="rounded-lg text-red-600"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          删除项目
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CreateProjectDialog({ 
  open, 
  onOpenChange, 
  onSubmit,
  isSubmitting
}: { 
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { name: string; description: string; domain: string }) => void
  isSubmitting: boolean
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [domain, setDomain] = useState("")

  const handleSubmit = () => {
    if (!name.trim() || isSubmitting) return
    onSubmit({ name, description, domain })
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      setName("")
      setDescription("")
      setDomain("")
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle>创建新项目</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">项目名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入项目名称..."
              className="mt-1.5 w-full h-10 px-3 rounded-lg border border-[hsl(var(--border))] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">项目描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述研究目标..."
              rows={3}
              className="mt-1.5 w-full px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">研究领域</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="如：人工智能、数据挖掘..."
              className="mt-1.5 w-full h-10 px-3 rounded-lg border border-[hsl(var(--border))] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
            className="h-10 px-4 rounded-full text-sm font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-material"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || isSubmitting}
            className={cn(
              "h-10 px-5 rounded-full text-sm font-medium transition-material inline-flex items-center gap-2",
              name.trim() && !isSubmitting
                ? "bg-[hsl(var(--primary))] text-white hover:shadow-md"
                : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] cursor-not-allowed"
            )}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? "创建中..." : "创建"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
