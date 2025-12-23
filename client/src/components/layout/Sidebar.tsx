import { NavLink, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  FolderKanban,
  Bot,
  PenTool,
  Settings,
  User,
  LogOut,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStore } from "@/stores/auth.store"

interface NavItem {
  icon: React.ElementType
  label: string
  path: string
  disabled?: boolean
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "总览", path: "/overview", disabled: true },
  { icon: FolderKanban, label: "项目", path: "/project" },
  { icon: Bot, label: "Agent", path: "/agent" },
  { icon: PenTool, label: "写作室", path: "/writing", disabled: true },
  { icon: Settings, label: "设置", path: "/settings" },
]

export function Sidebar() {
  return (
    <TooltipProvider delayDuration={100}>
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-20 flex-col bg-[hsl(var(--card))] border-r border-[hsl(var(--border))]">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--primary))]">
            <span className="text-lg font-semibold text-white">AI</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col items-center gap-2 px-2 py-4">
          {navItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}
        </nav>

        {/* User Account */}
        <div className="p-3 border-t border-[hsl(var(--border))]">
          <UserMenu />
        </div>
      </aside>
    </TooltipProvider>
  )
}

function NavItem({ item }: { item: NavItem }) {
  const Icon = item.icon

  if (item.disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "w-16 py-3 rounded-2xl flex flex-col items-center",
              "text-[hsl(var(--muted-foreground))] opacity-40 cursor-not-allowed"
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={1.5} />
            <span className="mt-1.5 text-[11px] font-medium">{item.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent 
          side="right" 
          sideOffset={12}
          className="rounded-lg bg-[hsl(213,27%,20%)] text-white px-3 py-2 text-xs font-medium shadow-lg"
        >
          {item.label} · 后续阶段
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.path}
          className={({ isActive }: { isActive: boolean }) =>
            cn(
              "w-16 py-3 rounded-2xl flex flex-col items-center transition-material state-layer",
              isActive
                ? "bg-[hsl(var(--accent))] text-[hsl(var(--primary))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            )
          }
        >
          {({ isActive }: { isActive: boolean }) => (
            <>
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2 : 1.5} />
              <span className={cn("mt-1.5 text-[11px]", isActive ? "font-semibold" : "font-medium")}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent 
        side="right" 
        sideOffset={12}
        className="rounded-lg bg-[hsl(213,27%,20%)] text-white px-3 py-2 text-xs font-medium shadow-lg"
      >
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

function UserMenu() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/auth')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--accent))] transition-material mx-auto state-layer">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <User className="h-6 w-6 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        side="right" 
        align="end" 
        sideOffset={12}
        className="w-56 rounded-xl p-2 surface-3 border-0"
      >
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-medium">{user?.username || '用户'}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{user?.email}</p>
        </div>
        <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />
        <DropdownMenuItem className="rounded-lg px-3 py-2.5 cursor-pointer transition-material state-layer">
          <User className="mr-3 h-4 w-4" strokeWidth={1.5} />
          <span className="flex-1">账号详情</span>
          <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />
        <DropdownMenuItem 
          onClick={handleLogout}
          className="rounded-lg px-3 py-2.5 cursor-pointer text-[hsl(var(--destructive))] transition-material state-layer"
        >
          <LogOut className="mr-3 h-4 w-4" strokeWidth={1.5} />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
