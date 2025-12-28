import { useState, useRef, useEffect } from "react"
import { NavLink, useNavigate, useLocation } from "react-router-dom"
import {
  Home,
  FolderKanban,
  MessageSquareText,
  MessageSquare,
  PenTool,
  Settings,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  BookOpen,
  PanelLeftClose,
  PanelLeft,
  Palette,
  Database,
  Server,
  Key,
  Sun,
  Moon,
  Monitor,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStore } from "@/stores/auth.store"
import { useSidebarStore } from "@/stores/sidebar.store"
import { useThemeStore } from "@/stores/theme.store"

type SubView = 'main' | 'project'

interface NavItem {
  id: string
  icon: React.ElementType
  iconActive?: React.ElementType
  label: string
  path?: string
  disabled?: boolean
  subView?: SubView
}

interface SubViewConfig {
  id: SubView
  title: string
  items: { icon: React.ElementType; label: string; path: string; disabled?: boolean }[]
}

const mainNavItems: NavItem[] = [
  { id: 'home', icon: Home, label: "首页", path: "/overview", disabled: true },
  { id: 'agent', icon: MessageSquare, iconActive: MessageSquareText, label: "AI 助手", path: "/agent" },
  { id: 'project', icon: FolderKanban, label: "项目管理", subView: 'project' },
  { id: 'writing', icon: PenTool, label: "写作室", path: "/writing", disabled: true },
]

const subViews: SubViewConfig[] = [
  {
    id: 'project',
    title: '项目管理',
    items: [
      { icon: FileText, label: "我的项目", path: "/project" },
      { icon: BookOpen, label: "文献库", path: "/library", disabled: true },
    ]
  }
]

export function Sidebar() {
  const { collapsed, toggleCollapsed } = useSidebarStore()
  const [currentSubView, setCurrentSubView] = useState<SubView>('main')
  const [isAnimating, setIsAnimating] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  const handleEnterSubView = (subView: SubView) => {
    if (collapsed) return
    setIsAnimating(true)
    setCurrentSubView(subView)
  }

  const handleBack = () => {
    setCurrentSubView('main')
  }

  const handleToggleCollapse = () => {
    if (!collapsed) {
      setCurrentSubView('main')
    }
    toggleCollapsed()
  }

  useEffect(() => {
    if (isAnimating) {
      const timer = setTimeout(() => setIsAnimating(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isAnimating])

  const subViewConfig = subViews.find(sv => sv.id === currentSubView)
  const isInSubView = currentSubView !== 'main' && subViewConfig && !collapsed

  return (
    <>
      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={handleToggleCollapse}
          className="fixed left-4 top-4 z-50 flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] transition-colors shadow-sm"
        >
          <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
      )}

      <aside 
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen w-56 flex-col bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] transition-all duration-300 ease-out",
          collapsed && "sidebar-collapsed"
        )}
      >
        {/* Header */}
        <div className="h-14 px-5 flex items-center justify-between">
          <span className="text-lg font-semibold text-[hsl(var(--foreground))] whitespace-nowrap">
            AI-References
          </span>
          <button
            onClick={handleToggleCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Navigation */}
        <nav ref={navRef} className="flex-1 overflow-hidden px-3 py-1">
          <div 
            className={cn(
              "transition-transform duration-200 ease-out",
              isInSubView && isAnimating && "animate-slide-in-right"
            )}
          >
            {isInSubView ? (
              <SubViewNav 
                config={subViewConfig} 
                onBack={handleBack}
              />
            ) : (
              <MainNav 
                items={mainNavItems} 
                onEnterSubView={handleEnterSubView}
              />
            )}
          </div>
        </nav>

        {/* Bottom Section */}
        <BottomSection />

        <style>{`
          @keyframes slideInRight {
            from {
              opacity: 0;
              transform: translateX(20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          .animate-slide-in-right {
            animation: slideInRight 0.2s ease-out forwards;
          }
          .sidebar-collapsed {
            transform: scale(0.8) translateX(-100%);
            transform-origin: left top;
            opacity: 0;
            pointer-events: none;
          }
        `}</style>
      </aside>
    </>
  )
}

function MainNav({ 
  items, 
  onEnterSubView
}: { 
  items: NavItem[]
  onEnterSubView: (subView: SubView) => void
}) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <MainNavItem 
          key={item.id} 
          item={item} 
          onEnterSubView={onEnterSubView}
        />
      ))}
    </div>
  )
}

function MainNavItem({ 
  item, 
  onEnterSubView
}: { 
  item: NavItem
  onEnterSubView: (subView: SubView) => void
}) {
  const Icon = item.icon
  const IconActive = item.iconActive || item.icon

  if (item.disabled) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[hsl(var(--muted-foreground))] opacity-40 cursor-not-allowed">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-sm">{item.label}</span>
        </div>
      </div>
    )
  }

  if (item.subView) {
    return (
      <button
        onClick={() => onEnterSubView(item.subView!)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors",
          "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-sm">{item.label}</span>
        </div>
        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
      </button>
    )
  }

  return (
    <NavLink
      to={item.path!}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
          isActive
            ? "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <IconActive className="h-5 w-5" strokeWidth={1.5} />
          ) : (
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          )}
          <span className="text-sm">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function SubViewNav({ 
  config, 
  onBack
}: { 
  config: SubViewConfig
  onBack: () => void
}) {
  return (
    <div className="space-y-0.5">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 px-2 py-2.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        <span className="text-sm">{config.title}</span>
      </button>

      {/* Sub items */}
      {config.items.map((item) => (
        <SubNavItem key={item.path} item={item} />
      ))}
    </div>
  )
}

function SubNavItem({ 
  item
}: { 
  item: { icon: React.ElementType; label: string; path: string; disabled?: boolean }
}) {
  const Icon = item.icon

  if (item.disabled) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[hsl(var(--muted-foreground))] opacity-40 cursor-not-allowed">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
        <span className="text-sm">{item.label}</span>
      </div>
    )
  }

  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
          isActive
            ? "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
            : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
        )
      }
    >
      <Icon className="h-5 w-5" strokeWidth={1.5} />
      <span className="text-sm">{item.label}</span>
    </NavLink>
  )
}

// 设置菜单项配置
const settingsMenuItems = [
  { id: "theme", icon: Palette, label: "主题", hasSubmenu: true },
  { id: "model", icon: Server, label: "模型配置", path: "/settings/model" },
  { id: "datasource", icon: Database, label: "数据源", path: "/settings/datasource" },
  { id: "environment", icon: Key, label: "运行环境", path: "/settings/environment" },
  { id: "logs", icon: FileText, label: "日志诊断", path: "/settings/logs" },
]

function BottomSection() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [themeHover, setThemeHover] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    if (settingsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [settingsOpen])

  const handleLogout = () => {
    logout()
    navigate('/auth')
  }

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme)
  }

  const handleSettingsItemClick = (item: typeof settingsMenuItems[0]) => {
    if (item.path) {
      navigate(item.path)
      setSettingsOpen(false)
    }
  }

  return (
    <div className="px-3 py-3 space-y-0.5">
      {/* Settings Menu */}
      <div className="relative" ref={settingsRef}>
        {/* Settings Popup */}
        <div 
          className={cn(
            "absolute bottom-full left-0 right-0 mb-2 py-1 rounded-xl bg-[hsl(var(--card))] shadow-lg",
            "transition-all duration-200 ease-out origin-bottom",
            settingsOpen 
              ? "opacity-100 scale-100 translate-y-0" 
              : "opacity-0 scale-95 translate-y-2 pointer-events-none"
          )}
        >
          {settingsMenuItems.map((item) => (
            <div 
              key={item.id} 
              className="relative px-1.5"
              onMouseEnter={() => item.hasSubmenu && setThemeHover(true)}
              onMouseLeave={() => item.hasSubmenu && setThemeHover(false)}
            >
              <button
                onClick={() => handleSettingsItemClick(item)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-sm",
                  location.pathname === item.path
                    ? "text-[hsl(var(--primary))] bg-[hsl(var(--accent))]"
                    : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" strokeWidth={1.5} />
                  <span>{item.label}</span>
                </div>
                {item.hasSubmenu && (
                  <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
                )}
              </button>

              {/* Theme Submenu - 右侧弹出 */}
              {item.id === "theme" && (
                <div 
                  className={cn(
                    "absolute left-full top-0 ml-1 py-1 min-w-[120px] rounded-xl bg-[hsl(var(--card))] shadow-lg",
                    "transition-all duration-200 ease-out origin-left",
                    themeHover 
                      ? "opacity-100 scale-100 translate-x-0" 
                      : "opacity-0 scale-95 -translate-x-2 pointer-events-none"
                  )}
                >
                  {[
                    { value: "light", icon: Sun, label: "浅色" },
                    { value: "dark", icon: Moon, label: "深色" },
                    { value: "system", icon: Monitor, label: "跟随系统" },
                  ].map((themeOption) => (
                    <div key={themeOption.value} className="px-1.5">
                      <button
                        onClick={() => handleThemeChange(themeOption.value as 'light' | 'dark' | 'system')}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-sm",
                          theme === themeOption.value
                            ? "text-[hsl(var(--primary))] bg-[hsl(var(--accent))]"
                            : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                        )}
                      >
                        <themeOption.icon className="h-4 w-4" strokeWidth={1.5} />
                        <span>{themeOption.label}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Settings Button */}
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
        >
          <Settings className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-sm">设置</span>
        </button>
      </div>

      {/* User */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] transition-colors">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[10px] font-medium text-white shrink-0">
              {(user?.username?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </div>
            <span className="text-sm truncate">
              {user?.email || '用户'}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          side="top"
          align="start" 
          sideOffset={8}
          className="w-52 rounded-xl p-1.5 surface-3 border-0"
        >
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{user?.username || '用户'}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{user?.email}</p>
          </div>
          <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />
          <DropdownMenuItem className="rounded-lg px-3 py-2 cursor-pointer">
            <User className="mr-2.5 h-4 w-4" strokeWidth={1.5} />
            <span>账号设置</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />
          <DropdownMenuItem 
            onClick={handleLogout}
            className="rounded-lg px-3 py-2 cursor-pointer text-[hsl(var(--destructive))]"
          >
            <LogOut className="mr-2.5 h-4 w-4" strokeWidth={1.5} />
            <span>退出登录</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
