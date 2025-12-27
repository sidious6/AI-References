import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { useSidebarStore } from "@/stores/sidebar.store"

export function MainLayout() {
  const { collapsed } = useSidebarStore()
  
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <Sidebar />
      <main className={`min-h-screen transition-all duration-300 ${collapsed ? 'ml-0' : 'ml-56'}`}>
        <Outlet />
      </main>
    </div>
  )
}
