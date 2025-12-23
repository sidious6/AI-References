import { create } from "zustand"

export interface Project {
  id: string
  name: string
  description: string
  domain: string
  stage: "research" | "retrieval" | "screening" | "writing" | "completed"
  createdAt: string
  updatedAt: string
  literatureCount: number
  documentCount: number
  cardCount: number
  tags: string[]
}

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  isLoading: boolean
  error: string | null
  
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  setCurrentProject: (project: Project | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  setProjects: (projects) => set({ projects }),
  
  addProject: (project) => set((state) => ({ 
    projects: [project, ...state.projects] 
  })),
  
  updateProject: (id, updates) => set((state) => ({
    projects: state.projects.map((p) => 
      p.id === id ? { ...p, ...updates } : p
    ),
    currentProject: state.currentProject?.id === id 
      ? { ...state.currentProject, ...updates } 
      : state.currentProject
  })),
  
  deleteProject: (id) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== id),
    currentProject: state.currentProject?.id === id ? null : state.currentProject
  })),
  
  setCurrentProject: (project) => set({ currentProject: project }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))

// Mock data for development
export const mockProjects: Project[] = [
  {
    id: "1",
    name: "面向多源数据的非法行为线索挖掘",
    description: "研究如何利用多源异构数据进行非法行为的智能识别与线索挖掘",
    domain: "数据挖掘",
    stage: "retrieval",
    createdAt: "2024-12-01",
    updatedAt: "2024-12-08",
    literatureCount: 45,
    documentCount: 12,
    cardCount: 28,
    tags: ["数据挖掘", "异常检测", "知识图谱"]
  },
  {
    id: "2",
    name: "大语言模型在医疗领域的应用研究",
    description: "探索 LLM 在医疗诊断、病历分析、药物研发等场景的应用潜力",
    domain: "人工智能",
    stage: "screening",
    createdAt: "2024-11-15",
    updatedAt: "2024-12-07",
    literatureCount: 78,
    documentCount: 8,
    cardCount: 42,
    tags: ["LLM", "医疗AI", "NLP"]
  },
  {
    id: "3",
    name: "知识图谱构建方法综述",
    description: "系统梳理知识图谱构建的关键技术、方法论和应用场景",
    domain: "知识工程",
    stage: "writing",
    createdAt: "2024-10-20",
    updatedAt: "2024-12-05",
    literatureCount: 120,
    documentCount: 15,
    cardCount: 65,
    tags: ["知识图谱", "信息抽取", "实体链接"]
  },
]
