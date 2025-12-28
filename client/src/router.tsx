import { createBrowserRouter, Navigate, Outlet } from "react-router-dom"
import { MainLayout } from "./components/layout/MainLayout"
import { ProjectPage } from "./pages/Project"
import { ProjectDetailPage } from "./pages/Project/detail"
import { AgentPage } from "./pages/Agent"
import { 
  ModelSettingsPage, 
  DataSourceSettingsPage, 
  EnvironmentSettingsPage, 
  LogsSettingsPage 
} from "./pages/Settings"
import { AuthPage } from "./pages/Auth"
import { useAuthStore } from "./stores/auth.store"

// 认证保护组件
function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />
  }
  
  return <Outlet />
}

// 已登录用户重定向
function RedirectIfAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  
  if (isAuthenticated) {
    return <Navigate to="/project" replace />
  }
  
  return <AuthPage />
}

export const router = createBrowserRouter([
  {
    path: "/auth",
    element: <RedirectIfAuth />,
  },
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { index: true, element: <Navigate to="/project" replace /> },
          { path: "project", element: <ProjectPage /> },
          { path: "project/:id", element: <ProjectDetailPage /> },
          { path: "agent", element: <AgentPage /> },
          { path: "settings/model", element: <ModelSettingsPage /> },
          { path: "settings/datasource", element: <DataSourceSettingsPage /> },
          { path: "settings/environment", element: <EnvironmentSettingsPage /> },
          { path: "settings/logs", element: <LogsSettingsPage /> },
        ],
      },
    ],
  },
])
