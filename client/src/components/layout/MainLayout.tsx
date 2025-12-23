import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"

export function MainLayout() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <Sidebar />
      <main className="ml-20 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
