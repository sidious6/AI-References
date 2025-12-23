import { useState, useEffect, useRef, useCallback } from "react"
import { 
  ChevronDown, ChevronRight, Send, Loader2, Sparkles, 
  FileText, BookOpen, ListTree, PanelRightClose, PanelRightOpen,
  Plus, MessageSquare, Menu, Trash2, AlertTriangle, Check, Circle, X, Eye,
  RotateCcw
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { agentApi, type AgentSession, type AgentMessage, type TempAsset, type WorkflowResumeInfo } from "@/services/api"

type Mode = "human-in-loop" | "agent"
type Provider = "ark" | "openai" | "google" | "anthropic"

interface StageStatus {
  stage: number
  title: string
  status: "pending" | "running" | "completed" | "failed"
  nodeId?: string
  summary?: string
  error?: string
  steps: StepStatus[]
}

interface StepStatus {
  nodeId: string
  title: string
  status: "pending" | "running" | "completed" | "failed"
  summary?: string
  error?: string
}

const STAGE_NAMES: Record<number, string> = {
  1: "研究方向输入与澄清",
  2: "项目匹配/创建",
  3: "课题分析与框架生成",
  4: "文献检索",
  5: "文献整理与筛选",
  6: "文献入库",
  7: "文献综述撰写",
}

// 用于持久化工作流状态的 key
const getWorkflowStorageKey = (sessionId: string) => `agent_workflow_${sessionId}`

export function AgentPage() {
  const [mode, setMode] = useState<Mode>("human-in-loop")
  const [provider, setProvider] = useState<Provider>("ark")
  const [input, setInput] = useState("")
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(true)
  
  // Session state
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [tempAssets, setTempAssets] = useState<TempAsset[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  // 标记是否正在发送消息（用于防止 loadSession 覆盖用户消息）
  const isSendingRef = useRef(false)
  
  // 标记是否需要轮询（页面切换回来时发现工作流正在运行）
  const [needsPolling, setNeedsPolling] = useState(false)
  
  // Agent workflow status
  const [stages, setStages] = useState<StageStatus[]>([])
  const [isStagesExpanded, setIsStagesExpanded] = useState(true)
  const [currentStage, setCurrentStage] = useState<number | null>(null)
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set())
  
  // Asset detail modal
  const [selectedAsset, setSelectedAsset] = useState<TempAsset | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  
  // User confirmation dialog
  const [confirmationDialog, setConfirmationDialog] = useState<{
    message: string
    options: { id: string; label: string; isDefault?: boolean }[]
    onConfirm: (optionId: string) => void
    timeout?: number
  } | null>(null)
  const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // 工作流恢复对话框
  const [resumeDialog, setResumeDialog] = useState<{
    sessionId: string
    resumeInfo: WorkflowResumeInfo
  } | null>(null)
  
  // 工作流轮询（用于页面切换回来时同步状态）
  const workflowPollRef = useRef<NodeJS.Timeout | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    const result = await agentApi.listSessions({ limit: 50 })
    if (result.success && result.data) {
      setSessions(result.data)
    }
  }, [])

  // 加载会话详情
  const loadSession = useCallback(async (sessionId: string) => {
    const result = await agentApi.getSession(sessionId)
    if (result.success && result.data) {
      setMessages(result.data.messages || [])
      setTempAssets(result.data.temp_assets || [])
      setMode(result.data.mode)
      
      // 从后端获取工作流状态
      const workflowResult = await agentApi.getWorkflowState(sessionId)
      if (workflowResult.success && workflowResult.data) {
        const state = workflowResult.data
        if (state.stages && state.stages.length > 0) {
          // 检查保存时间，如果超过5分钟且有running状态，标记为completed
          const updatedAt = state.updatedAt ? new Date(state.updatedAt).getTime() : 0
          const now = Date.now()
          const isStale = now - updatedAt > 5 * 60 * 1000 // 5分钟
          
          let stages = state.stages
          if (isStale) {
            // 将所有 running 状态改为 completed（假设已完成）
            stages = stages.map((s: StageStatus) => ({
              ...s,
              status: s.status === 'running' ? 'completed' : s.status,
              steps: s.steps.map((step: StepStatus) => ({
                ...step,
                status: step.status === 'running' ? 'completed' : step.status,
              })),
            }))
          }
          
          setStages(stages)
          setCurrentStage(state.currentStage || null)
          
          // 检查是否可恢复
          if (result.data.mode === 'agent') {
            const resumeResult = await agentApi.checkWorkflowResumable(sessionId)
            if (resumeResult.success && resumeResult.data) {
              // 如果有待确认请求，显示确认对话框
              if (resumeResult.data.pendingConfirmation) {
                const pending = resumeResult.data.pendingConfirmation
                setIsStreaming(true)  // 显示正在等待状态
                setNeedsPolling(false)  // 不需要轮询，等待用户确认
                
                // 显示确认对话框
                showPendingConfirmationDialog(sessionId, pending)
              } else if (resumeResult.data.isActive) {
                // 如果工作流正在活跃运行，设置流式状态并启动轮询
                setIsStreaming(true)
                setNeedsPolling(true)  // 标记需要轮询
              } else if (resumeResult.data.canResume) {
                // 只有在工作流不活跃且可恢复时才弹出对话框
                setNeedsPolling(false)
                setResumeDialog({
                  sessionId,
                  resumeInfo: resumeResult.data,
                })
              } else {
                setNeedsPolling(false)
              }
            } else {
              setNeedsPolling(false)
            }
          } else {
            setNeedsPolling(false)
          }
        } else {
          setStages([])
          setCurrentStage(null)
        }
      } else {
        // 降级到 localStorage
        const savedWorkflow = localStorage.getItem(getWorkflowStorageKey(sessionId))
        if (savedWorkflow) {
          try {
            const parsed = JSON.parse(savedWorkflow)
            setStages(parsed.stages || [])
            setCurrentStage(parsed.currentStage || null)
          } catch {
            setStages([])
            setCurrentStage(null)
          }
        } else {
          setStages([])
          setCurrentStage(null)
        }
      }
    }
  }, [])
  
  // 显示待确认对话框（页面刷新后恢复）
  const showPendingConfirmationDialog = useCallback((sessionId: string, pending: {
    confirmationType: string;
    message: string;
    options: { id: string; label: string; isDefault?: boolean }[];
    timeout?: number;
    candidates?: { id: string; name: string; score?: number }[];
    recommendedProjectId?: string;
  }) => {
    console.log('[恢复] 显示待确认对话框:', pending)
    
    setConfirmationDialog({
      message: pending.message,
      options: pending.options,
      onConfirm: async (optionId: string) => {
        console.log(`[恢复] 用户选择: ${optionId}`)
        setConfirmationDialog(null)
        
        try {
          const result = await agentApi.confirmProjectSelection(sessionId, {
            confirmationType: pending.confirmationType,
            selectedOption: optionId,
            recommendedProjectId: pending.recommendedProjectId,
          })
          
          if (result.success && result.data) {
            // 刷新会话数据
            const sessionResult = await agentApi.getSession(sessionId)
            if (sessionResult.success && sessionResult.data) {
              setMessages(sessionResult.data.messages || [])
              setTempAssets(sessionResult.data.temp_assets || [])
            }
            
            if (result.data.action === 'cancelled') {
              setIsStreaming(false)
            } else {
              // 用户确认后，工作流继续执行，启动轮询
              setNeedsPolling(true)
            }
          }
        } catch (err) {
          console.error('[恢复] 发送选择失败:', err)
          setErrorMessage('操作失败，请重试')
          setIsStreaming(false)
        }
      },
      timeout: pending.timeout ? Math.floor(pending.timeout / 1000) : undefined,
    })
  }, [])

  // 启动工作流状态轮询（用于页面切换回来时同步正在运行的工作流）
  const startWorkflowPolling = useCallback((sessionId: string) => {
    // 清除之前的轮询
    if (workflowPollRef.current) {
      clearInterval(workflowPollRef.current)
    }
    
    const pollWorkflowState = async () => {
      try {
        // 检查工作流是否仍在活跃运行
        const resumeResult = await agentApi.checkWorkflowResumable(sessionId)
        if (!resumeResult.success || !resumeResult.data?.isActive) {
          // 工作流已完成或停止，停止轮询
          stopWorkflowPolling()
          setIsStreaming(false)
          setNeedsPolling(false)  // 清除轮询标记
          // 最后一次加载完整状态
          const workflowResult = await agentApi.getWorkflowState(sessionId)
          if (workflowResult.success && workflowResult.data?.stages) {
            setStages(workflowResult.data.stages)
            setCurrentStage(workflowResult.data.currentStage || null)
          }
          // 刷新消息和资产
          const sessionResult = await agentApi.getSession(sessionId)
          if (sessionResult.success && sessionResult.data) {
            setMessages(sessionResult.data.messages || [])
            setTempAssets(sessionResult.data.temp_assets || [])
          }
          return
        }
        
        // 获取最新工作流状态
        const workflowResult = await agentApi.getWorkflowState(sessionId)
        if (workflowResult.success && workflowResult.data?.stages) {
          setStages(workflowResult.data.stages)
          setCurrentStage(workflowResult.data.currentStage || null)
          // 自动展开正在运行的阶段
          const runningStage = workflowResult.data.stages.find((s: StageStatus) => s.status === 'running')
          if (runningStage) {
            setExpandedStages(prev => new Set([...prev, runningStage.stage]))
          }
        }
        
        // 获取最新消息和资产
        const sessionResult = await agentApi.getSession(sessionId)
        if (sessionResult.success && sessionResult.data) {
          setMessages(sessionResult.data.messages || [])
          setTempAssets(sessionResult.data.temp_assets || [])
        }
      } catch (err) {
        console.error('[轮询] 获取工作流状态失败:', err)
      }
    }
    
    // 立即执行一次
    pollWorkflowState()
    // 每 2 秒轮询一次
    workflowPollRef.current = setInterval(pollWorkflowState, 2000)
  }, [])
  
  // 停止工作流状态轮询
  const stopWorkflowPolling = useCallback(() => {
    if (workflowPollRef.current) {
      clearInterval(workflowPollRef.current)
      workflowPollRef.current = null
    }
  }, [])

  // 保存工作流状态到 localStorage
  const saveWorkflowState = useCallback((sessionId: string, stagesData: StageStatus[], currentStageData: number | null) => {
    localStorage.setItem(getWorkflowStorageKey(sessionId), JSON.stringify({
      stages: stagesData,
      currentStage: currentStageData,
      updatedAt: new Date().toISOString(),
    }))
  }, [])

  // 初始化
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // 切换会话时加载消息（但在发送消息期间不加载）
  useEffect(() => {
    if (activeSessionId && !isSendingRef.current) {
      loadSession(activeSessionId)
    } else if (!activeSessionId) {
      setMessages([])
      setTempAssets([])
      setStages([])
      setCurrentStage(null)
    }
  }, [activeSessionId, loadSession])
  
  // 当需要轮询时启动轮询（页面切换回来发现工作流正在运行）
  useEffect(() => {
    if (needsPolling && activeSessionId) {
      startWorkflowPolling(activeSessionId)
    }
    
    return () => {
      // 组件卸载或依赖变化时停止轮询
      stopWorkflowPolling()
    }
  }, [needsPolling, activeSessionId, startWorkflowPolling, stopWorkflowPolling])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingContent, stages])

  // 创建新会话
  const handleNewSession = async () => {
    setIsStreaming(false)
    setStreamingContent("")
    setStages([])
    setCurrentStage(null)
    setErrorMessage(null)
    setMessages([])
    setTempAssets([])
    setActiveSessionId(null)
    setExpandedStages(new Set())
  }

  // 删除会话
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const result = await agentApi.deleteSession(sessionId)
    if (result.success) {
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      localStorage.removeItem(getWorkflowStorageKey(sessionId))
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
        setMessages([])
        setStages([])
        setCurrentStage(null)
      }
    }
  }

  // 处理 status 事件
  const handleStatusEvent = (statusData: any, sessionId: string) => {
    if (!statusData) return
    
    const { type, nodeId, stage, title, summary, error, message, options, timeout, confirmationType, recommendedProjectId } = statusData
    
    // 处理工作流暂停（用户取消或异常情况）
    if (type === "workflow_paused") {
      console.log(`[工作流] 暂停: ${statusData.reason || '未知原因'}`)
      setIsStreaming(false)
      return
    }
    
    // 处理需要用户确认的情况（项目选择等）- 阻塞式交互
    if (type === "awaiting_confirmation") {
      console.log(`[工作流] 收到确认请求:`, { confirmationType, message, options, timeout })
      
      if (!options || options.length === 0) {
        console.error('[工作流] 确认请求缺少 options')
        return
      }
      
      setConfirmationDialog({
        message: message || "请选择操作",
        options: options.map((opt: any) => ({
          id: opt.id,
          label: opt.label,
          isDefault: opt.isDefault,
        })),
        onConfirm: async (optionId: string) => {
          console.log(`[工作流] 用户选择: ${optionId}`)
          setConfirmationDialog(null)
          
          // 发送用户选择到后端，工作流会自动继续（阻塞式交互）
          try {
            const result = await agentApi.confirmProjectSelection(sessionId, {
              confirmationType,
              selectedOption: optionId,
              recommendedProjectId,
            })
            
            if (result.success && result.data) {
              // 刷新会话数据（但不检查恢复状态，因为工作流正在继续执行）
              const sessionResult = await agentApi.getSession(sessionId)
              if (sessionResult.success && sessionResult.data) {
                setMessages(sessionResult.data.messages || [])
                setTempAssets(sessionResult.data.temp_assets || [])
              }
              
              // 如果用户取消，停止流式状态
              if (result.data.action === 'cancelled') {
                setIsStreaming(false)
              }
              // 工作流会自动继续，不需要手动恢复
            }
          } catch (err) {
            console.error('[用户确认] 发送选择失败:', err)
            setErrorMessage('操作失败，请重试')
            setIsStreaming(false)
          }
        },
        timeout: timeout ? Math.floor(timeout / 1000) : undefined,
      })
      return
    }
    
    if (type === "node_started") {
      if (stage) {
        // 阶段节点开始
        setCurrentStage(stage)
        setStages(prev => {
          const existing = prev.find(s => s.stage === stage)
          if (existing) {
            const updated = prev.map(s => 
              s.stage === stage 
                ? { ...s, status: "running" as const, nodeId, title: title || s.title }
                : s
            )
            saveWorkflowState(sessionId, updated, stage)
            return updated
          }
          const newStages = [...prev, {
            stage,
            title: title || STAGE_NAMES[stage] || `阶段 ${stage}`,
            status: "running" as const,
            nodeId,
            steps: [],
          }]
          saveWorkflowState(sessionId, newStages, stage)
          return newStages
        })
        // 自动展开当前阶段
        setExpandedStages(prev => new Set([...prev, stage]))
      } else if (nodeId && title) {
        // 工具节点开始 - 添加到当前阶段的 steps
        setStages(prev => {
          const updated = prev.map(s => {
            if (s.status === "running") {
              const stepExists = s.steps.some(step => step.nodeId === nodeId)
              if (!stepExists) {
                return {
                  ...s,
                  steps: [...s.steps, { nodeId, title, status: "running" as const }]
                }
              }
              return {
                ...s,
                steps: s.steps.map(step => 
                  step.nodeId === nodeId ? { ...step, status: "running" as const } : step
                )
              }
            }
            return s
          })
          saveWorkflowState(sessionId, updated, currentStage)
          return updated
        })
      }
    } else if (type === "node_completed") {
      if (stage) {
        // 阶段完成
        setStages(prev => {
          const updated = prev.map(s => 
            s.stage === stage ? { ...s, status: "completed" as const, summary } : s
          )
          saveWorkflowState(sessionId, updated, currentStage)
          return updated
        })
      } else if (nodeId) {
        // 工具节点完成
        setStages(prev => {
          const updated = prev.map(s => ({
            ...s,
            steps: s.steps.map(step => 
              step.nodeId === nodeId 
                ? { ...step, status: "completed" as const, summary } 
                : step
            )
          }))
          saveWorkflowState(sessionId, updated, currentStage)
          return updated
        })
      }
    } else if (type === "node_failed") {
      if (stage) {
        setStages(prev => {
          const updated = prev.map(s => 
            s.stage === stage ? { ...s, status: "failed" as const, error } : s
          )
          saveWorkflowState(sessionId, updated, currentStage)
          return updated
        })
      } else if (nodeId) {
        setStages(prev => {
          const updated = prev.map(s => ({
            ...s,
            steps: s.steps.map(step => 
              step.nodeId === nodeId 
                ? { ...step, status: "failed" as const, error } 
                : step
            )
          }))
          saveWorkflowState(sessionId, updated, currentStage)
          return updated
        })
      }
    } else if (type === "user_confirmation_required") {
      // 显示确认对话框
      const { message, options, timeout } = statusData
      console.log('[Agent] 收到确认请求:', message)
      
      setConfirmationDialog({
        message,
        options: options || [
          { id: 'confirm', label: '确认', isDefault: true },
          { id: 'cancel', label: '取消' },
        ],
        onConfirm: (optionId: string) => {
          console.log('[Agent] 用户选择:', optionId)
          // 清除超时
          if (confirmationTimeoutRef.current) {
            clearTimeout(confirmationTimeoutRef.current)
            confirmationTimeoutRef.current = null
          }
          setConfirmationDialog(null)
          // TODO: 发送用户选择到后端
        },
        timeout: timeout || 120000,
      })
      
      // 设置超时自动选择默认选项
      if (timeout) {
        confirmationTimeoutRef.current = setTimeout(() => {
          const defaultOption = options?.find((o: any) => o.isDefault)?.id || 'confirm'
          console.log('[Agent] 确认超时，自动选择:', defaultOption)
          setConfirmationDialog(null)
        }, timeout)
      }
    }
  }

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isStreaming) return

    const content = input.trim()
    setInput("")
    setErrorMessage(null)
    
    // 标记正在发送，防止 loadSession 覆盖消息
    isSendingRef.current = true
    
    // Agent 模式下初始化阶段状态
    if (mode === "agent") {
      setStages([])
      setCurrentStage(null)
      setExpandedStages(new Set())
    }

    // 如果没有活跃会话，先创建一个
    let sessionId = activeSessionId
    if (!sessionId) {
      const createResult = await agentApi.createSession({ 
        mode,
        research_topic: content.slice(0, 100),
      })
      if (createResult.success && createResult.data) {
        sessionId = createResult.data.id
        setSessions(prev => [createResult.data!, ...prev])
        setActiveSessionId(sessionId)
      } else {
        setInput(content)
        setErrorMessage(createResult.error || "创建会话失败，请稍后再试")
        isSendingRef.current = false
        return
      }
    }

    // 添加用户消息到UI - 立即显示
    const timestamp = new Date().toISOString()
    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      session_id: sessionId,
      role: "user",
      content,
      tool_calls: null,
      tool_call_id: null,
      metadata: {},
      tokens_used: null,
      created_at: timestamp,
      updated_at: timestamp,
    }
    setMessages(prev => [...prev, userMessage])

    // 流式请求
    setIsStreaming(true)
    setStreamingContent("")

    try {
      let fullContent = ""
      for await (const chunk of agentApi.chatStream(sessionId, {
        content,
        provider,
      })) {
        if (chunk.type === "chunk") {
          fullContent += chunk.content
          setStreamingContent(fullContent)
        } else if (chunk.type === "status") {
          // 处理 Agent 工作流状态事件
          try {
            const statusData = JSON.parse(chunk.content || "{}")
            handleStatusEvent(statusData, sessionId)
            
            // 每个阶段完成后刷新临时资产
            if (statusData.type === "node_completed" && statusData.stage) {
              const assetsResult = await agentApi.getTempAssets(sessionId)
              if (assetsResult.success && assetsResult.data) {
                setTempAssets(assetsResult.data)
              }
            }
          } catch {
            // 忽略解析错误
          }
        } else if (chunk.type === "done") {
          // 添加助手消息
          const assistantTimestamp = new Date().toISOString()
          const assistantMessage: AgentMessage = {
            id: `assistant-${Date.now()}`,
            session_id: sessionId,
            role: "assistant",
            content: fullContent,
            tool_calls: null,
            tool_call_id: null,
            metadata: {},
            tokens_used: null,
            created_at: assistantTimestamp,
            updated_at: assistantTimestamp,
          }
          setMessages(prev => [...prev, assistantMessage])
          setStreamingContent("")
          
          // 刷新会话列表以更新标题
          loadSessions()
          
          // 刷新临时资产
          const assetsResult = await agentApi.getTempAssets(sessionId)
          if (assetsResult.success && assetsResult.data) {
            setTempAssets(assetsResult.data)
          }
        } else if (chunk.type === "error") {
          throw new Error(chunk.error || "对话失败，请稍后重试")
        }
      }
    } catch (error) {
      setStreamingContent("")
      setErrorMessage(error instanceof Error ? error.message : "对话失败，请稍后重试")
    } finally {
      setIsStreaming(false)
      isSendingRef.current = false
    }
  }

  // 快捷建议点击
  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
  }

  // 切换阶段展开状态
  const toggleStageExpand = (stage: number) => {
    setExpandedStages(prev => {
      const next = new Set(prev)
      if (next.has(stage)) {
        next.delete(stage)
      } else {
        next.add(stage)
      }
      return next
    })
  }
  
  // 恢复工作流
  const handleResumeWorkflow = async () => {
    if (!resumeDialog) return
    
    const { sessionId } = resumeDialog
    setResumeDialog(null)
    setIsStreaming(true)
    setStreamingContent("")
    setErrorMessage(null)
    
    try {
      let fullContent = ""
      for await (const chunk of agentApi.resumeWorkflow(sessionId, { provider })) {
        if (chunk.type === "chunk") {
          fullContent += chunk.content
          setStreamingContent(fullContent)
        } else if (chunk.type === "status") {
          try {
            const statusData = JSON.parse(chunk.content || "{}")
            handleStatusEvent(statusData, sessionId)
            
            if (statusData.type === "node_completed" && statusData.stage) {
              const assetsResult = await agentApi.getTempAssets(sessionId)
              if (assetsResult.success && assetsResult.data) {
                setTempAssets(assetsResult.data)
              }
            }
          } catch {
            // 忽略解析错误
          }
        } else if (chunk.type === "done") {
          const assistantTimestamp = new Date().toISOString()
          const assistantMessage: AgentMessage = {
            id: `assistant-${Date.now()}`,
            session_id: sessionId,
            role: "assistant",
            content: fullContent,
            tool_calls: null,
            tool_call_id: null,
            metadata: { resumed: true },
            tokens_used: null,
            created_at: assistantTimestamp,
            updated_at: assistantTimestamp,
          }
          setMessages(prev => [...prev, assistantMessage])
          setStreamingContent("")
          
          loadSessions()
          
          const assetsResult = await agentApi.getTempAssets(sessionId)
          if (assetsResult.success && assetsResult.data) {
            setTempAssets(assetsResult.data)
          }
        } else if (chunk.type === "error") {
          throw new Error(chunk.error || "恢复失败")
        }
      }
    } catch (error) {
      setStreamingContent("")
      setErrorMessage(error instanceof Error ? error.message : "恢复工作流失败")
    } finally {
      setIsStreaming(false)
    }
  }
  
  // 取消恢复，重新开始
  const handleCancelResume = () => {
    setResumeDialog(null)
  }
  
  // 用户确认后恢复工作流执行
  const handleResumeAfterConfirmation = async (sessionId: string) => {
    setIsStreaming(true)
    setStreamingContent("")
    setErrorMessage(null)
    
    try {
      let fullContent = ""
      for await (const chunk of agentApi.resumeWorkflow(sessionId, { provider })) {
        if (chunk.type === "chunk") {
          fullContent += chunk.content
          setStreamingContent(fullContent)
        } else if (chunk.type === "status") {
          try {
            const statusData = JSON.parse(chunk.content || "{}")
            handleStatusEvent(statusData, sessionId)
            
            if (statusData.type === "node_completed" && statusData.stage) {
              const assetsResult = await agentApi.getTempAssets(sessionId)
              if (assetsResult.success && assetsResult.data) {
                setTempAssets(assetsResult.data)
              }
            }
          } catch {
            // 忽略解析错误
          }
        } else if (chunk.type === "done") {
          const assistantTimestamp = new Date().toISOString()
          const assistantMessage: AgentMessage = {
            id: `assistant-${Date.now()}`,
            session_id: sessionId,
            role: "assistant",
            content: fullContent,
            tool_calls: null,
            tool_call_id: null,
            metadata: { resumed: true },
            tokens_used: null,
            created_at: assistantTimestamp,
            updated_at: assistantTimestamp,
          }
          setMessages(prev => [...prev, assistantMessage])
          setStreamingContent("")
          
          loadSessions()
          
          const assetsResult = await agentApi.getTempAssets(sessionId)
          if (assetsResult.success && assetsResult.data) {
            setTempAssets(assetsResult.data)
          }
        } else if (chunk.type === "error") {
          throw new Error(chunk.error || "恢复失败")
        }
      }
    } catch (error) {
      setStreamingContent("")
      setErrorMessage(error instanceof Error ? error.message : "恢复工作流失败")
    } finally {
      setIsStreaming(false)
    }
  }

  // 同步临时资产到项目
  const handleSyncToProject = async () => {
    if (!activeSessionId || tempAssets.length === 0) return
    
    // 获取当前会话信息以获取 project_id
    const sessionResult = await agentApi.getSession(activeSessionId)
    if (!sessionResult.success || !sessionResult.data) {
      setErrorMessage("获取会话信息失败")
      return
    }
    
    const projectId = sessionResult.data.project_id
    if (!projectId) {
      setErrorMessage("会话未绑定项目，无法同步")
      return
    }
    
    setIsSyncing(true)
    setErrorMessage(null)
    
    try {
      let successCount = 0
      for (const asset of tempAssets) {
        if (!asset.synced_to_project) {
          const result = await agentApi.syncTempAsset(activeSessionId, asset.id, projectId)
          if (result.success) {
            successCount++
          }
        }
      }
      
      // 刷新资产列表
      const assetsResult = await agentApi.getTempAssets(activeSessionId)
      if (assetsResult.success && assetsResult.data) {
        setTempAssets(assetsResult.data)
      }
      
      if (successCount > 0) {
        console.log(`已同步 ${successCount} 个资产到项目`)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "同步失败")
    } finally {
      setIsSyncing(false)
    }
  }

  // 计算资产统计
  const assetCounts = {
    chapter_framework: tempAssets.filter(a => a.type === "chapter_framework").length,
    candidate_literature: tempAssets.filter(a => a.type === "candidate_literature").length,
    search_query: tempAssets.filter(a => a.type === "search_query").length,
    draft: tempAssets.filter(a => a.type === "draft").length,
  }

  // 计算已完成阶段数
  const completedStages = stages.filter(s => s.status === "completed").length
  const totalStages = stages.length
  const runningStage = stages.find(s => s.status === "running")

  return (
    <div className="flex h-screen">
      {/* History Sidebar */}
      <aside className={cn(
        "flex flex-col bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] transition-all duration-300",
        isHistoryOpen ? "w-56" : "w-0 overflow-hidden border-r-0"
      )}>
        <div className="p-3 flex items-center justify-between">
          <button 
            onClick={() => setIsHistoryOpen(false)}
            className="p-2 rounded-lg hover:bg-[hsl(var(--secondary))] transition-material"
          >
            <Menu className="h-5 w-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
          </button>
          <button 
            onClick={handleNewSession}
            className="p-2 rounded-lg hover:bg-[hsl(var(--secondary))] transition-material"
          >
            <Plus className="h-5 w-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-2 pb-2">
          <p className="px-2 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">最近对话</p>
          {sessions.length === 0 ? (
            <p className="px-2 py-4 text-xs text-[hsl(var(--muted-foreground))] text-center">
              暂无对话记录
            </p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  if (isStreaming) return
                  setStreamingContent("")
                  setActiveSessionId(session.id)
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-material group",
                  activeSessionId === session.id
                    ? "bg-[hsl(var(--secondary))]"
                    : "hover:bg-[hsl(var(--secondary))]",
                  isStreaming && "opacity-50 cursor-not-allowed"
                )}
                disabled={isStreaming}
              >
                <MessageSquare className="h-4 w-4 text-[hsl(var(--muted-foreground))] shrink-0" strokeWidth={1.5} />
                <span className="flex-1 text-sm truncate">
                  {session.title || "新对话"}
                </span>
                <button 
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[hsl(var(--accent))] transition-material"
                >
                  <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                </button>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isHistoryOpen && (
              <>
                <button 
                  onClick={() => setIsHistoryOpen(true)}
                  className="p-2 rounded-lg hover:bg-[hsl(var(--secondary))] transition-material"
                >
                  <Menu className="h-5 w-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
                </button>
                <button 
                  onClick={handleNewSession}
                  className="p-2 rounded-lg hover:bg-[hsl(var(--secondary))] transition-material"
                >
                  <Plus className="h-5 w-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>
          {!isAssetPanelOpen && (
            <button 
              onClick={() => setIsAssetPanelOpen(true)}
              className="p-2 rounded-lg hover:bg-[hsl(var(--secondary))] transition-material"
            >
              <PanelRightOpen className="h-5 w-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Canvas Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-6 py-6">
            {messages.length === 0 && !isStreaming && !streamingContent ? (
              // Welcome screen
              <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <h1 className="text-2xl font-medium text-[hsl(var(--foreground))] mb-2">
                  Deep-reference Agent
                </h1>
                <p className="text-[hsl(var(--muted-foreground))] text-center max-w-md mb-8">
                  输入你的研究方向，我将帮助你完成文献检索与综述生成
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <SuggestionChip 
                    icon={Sparkles} 
                    label="面向多源数据的非法行为线索挖掘" 
                    onClick={() => handleSuggestionClick("面向多源数据的非法行为线索挖掘")}
                  />
                  <SuggestionChip 
                    icon={Sparkles} 
                    label="大语言模型在医疗领域的应用" 
                    onClick={() => handleSuggestionClick("大语言模型在医疗领域的应用")}
                  />
                </div>
              </div>
            ) : (
              // Messages
              <div className="space-y-6">
                {/* Agent 工作流程状态展示 - 始终在最上方 */}
                {mode === "agent" && stages.length > 0 && (
                  <WorkflowStatus 
                    stages={stages}
                    isExpanded={isStagesExpanded}
                    onToggle={() => setIsStagesExpanded(!isStagesExpanded)}
                    completedCount={completedStages}
                    totalCount={totalStages}
                    isRunning={isStreaming}
                    runningStage={runningStage}
                    expandedStages={expandedStages}
                    onToggleStage={toggleStageExpand}
                  />
                )}
                
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                
                {isStreaming && streamingContent && (
                  <MessageBubble 
                    message={{
                      id: "streaming",
                      session_id: "",
                      role: "assistant",
                      content: streamingContent,
                      tool_calls: null,
                      tool_call_id: null,
                      metadata: {},
                      tokens_used: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    }}
                    isStreaming
                  />
                )}
                
                {/* 用户确认对话框 - 内联在画布底部 */}
                {confirmationDialog && (
                  <ConfirmationDialog 
                    message={confirmationDialog.message}
                    options={confirmationDialog.options}
                    onSelect={confirmationDialog.onConfirm}
                    timeout={confirmationDialog.timeout}
                  />
                )}
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="px-6 pb-6">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-3xl bg-[hsl(var(--secondary))] px-4 py-3 focus-within:ring-2 focus-within:ring-[hsl(var(--ring))] focus-within:bg-[hsl(var(--card))] transition-all duration-200">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="输入研究方向或问题..."
                className="w-full resize-none bg-transparent text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
                rows={1}
                style={{ minHeight: '24px', maxHeight: '200px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = '24px'
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px'
                }}
                disabled={isStreaming}
              />
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[hsl(var(--border))]/50">
                <div className="flex items-center gap-2">
                  <SelectChip
                    value={mode}
                    onChange={(v) => setMode(v as Mode)}
                    options={[
                      { value: "human-in-loop", label: "Human-in-loop" },
                      { value: "agent", label: "Agent 自动" },
                    ]}
                    disabled={isStreaming}
                  />
                  <SelectChip
                    value={provider}
                    onChange={(v) => setProvider(v as Provider)}
                    options={[
                      { value: "ark", label: "DeepSeek" },
                      { value: "openai", label: "GPT-4" },
                      { value: "anthropic", label: "Claude" },
                      { value: "google", label: "Gemini" },
                    ]}
                    disabled={isStreaming}
                  />
                </div>
                <button
                  onClick={handleSend}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
                    input.trim() && !isStreaming
                      ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:opacity-80 active:scale-95"
                      : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed"
                  )}
                  disabled={!input.trim() || isStreaming}
                >
                  {isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  ) : (
                    <Send className="h-4 w-4" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
            {errorMessage && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/5 px-3 py-2 text-sm text-[hsl(var(--destructive))]">
                <AlertTriangle className="h-4 w-4 mt-0.5" strokeWidth={1.5} />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assets Panel */}
      <aside className={cn(
        "flex flex-col bg-[hsl(var(--card))] border-l border-[hsl(var(--border))] transition-all duration-300",
        isAssetPanelOpen ? "w-64" : "w-0 overflow-hidden border-l-0"
      )}>
        <div className="p-3 flex items-center justify-between border-b border-[hsl(var(--border))]">
          <span className="font-medium text-sm text-[hsl(var(--foreground))]">临时资产</span>
          <button 
            onClick={() => setIsAssetPanelOpen(false)}
            className="p-2 rounded-lg hover:bg-[hsl(var(--secondary))] transition-material"
          >
            <PanelRightClose className="h-5 w-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <AssetSection 
            icon={ListTree} 
            label="章节框架" 
            count={assetCounts.chapter_framework} 
            assets={tempAssets.filter(a => a.type === "chapter_framework")}
            onViewAsset={setSelectedAsset}
            defaultOpen 
          />
          <AssetSection 
            icon={BookOpen} 
            label="候选文献" 
            count={assetCounts.candidate_literature}
            assets={tempAssets.filter(a => a.type === "candidate_literature")}
            onViewAsset={setSelectedAsset}
          />
          <AssetSection 
            icon={FileText} 
            label="检索式版本" 
            count={assetCounts.search_query}
            assets={tempAssets.filter(a => a.type === "search_query")}
            onViewAsset={setSelectedAsset}
          />
          <AssetSection 
            icon={FileText} 
            label="综述草稿" 
            count={assetCounts.draft}
            assets={tempAssets.filter(a => a.type === "draft")}
            onViewAsset={setSelectedAsset}
          />
        </div>
        <div className="p-4 border-t border-[hsl(var(--border))]">
          <button 
            onClick={handleSyncToProject}
            className="w-full h-10 rounded-full bg-[hsl(var(--primary))] text-white text-sm font-medium transition-material hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={tempAssets.length === 0 || isSyncing}
          >
            {isSyncing ? "同步中..." : "同步到项目"}
          </button>
        </div>
      </aside>
      
      {/* Asset Detail Modal */}
      {selectedAsset && (
        <AssetDetailModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}
      
      {/* Resume Workflow Dialog */}
      {resumeDialog && (
        <ResumeWorkflowDialog
          resumeInfo={resumeDialog.resumeInfo}
          onResume={handleResumeWorkflow}
          onCancel={handleCancelResume}
        />
      )}
    </div>
  )
}

// Agent 工作流程状态组件 - 增强版
function WorkflowStatus({ 
  stages, 
  isExpanded, 
  onToggle, 
  completedCount, 
  totalCount,
  isRunning,
  runningStage,
  expandedStages,
  onToggleStage,
}: { 
  stages: StageStatus[]
  isExpanded: boolean
  onToggle: () => void
  completedCount: number
  totalCount: number
  isRunning: boolean
  runningStage?: StageStatus
  expandedStages: Set<number>
  onToggleStage: (stage: number) => void
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden transition-all duration-300">
      {/* Header */}
      <button 
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[hsl(var(--secondary))]/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" strokeWidth={2} />
          ) : (
            <Check className="h-4 w-4 text-green-500" strokeWidth={2} />
          )}
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">
            {isRunning 
              ? `正在执行: ${runningStage?.title || "..."}`
              : `已完成 ${completedCount} 个阶段`
            }
          </span>
        </div>
        <ChevronDown 
          className={cn(
            "h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform duration-200",
            !isExpanded && "-rotate-90"
          )} 
          strokeWidth={1.5} 
        />
      </button>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-1">
          {stages.map((stage) => (
            <div key={stage.stage} className="space-y-1">
              {/* Stage Header */}
              <button
                onClick={() => onToggleStage(stage.stage)}
                className="w-full flex items-center gap-3 py-1.5 hover:bg-[hsl(var(--secondary))]/30 rounded transition-colors"
              >
                {stage.status === "completed" ? (
                  <div className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Check className="h-3 w-3 text-green-500" strokeWidth={2.5} />
                  </div>
                ) : stage.status === "running" ? (
                  <div className="h-5 w-5 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Loader2 className="h-3 w-3 text-blue-500 animate-spin" strokeWidth={2.5} />
                  </div>
                ) : stage.status === "failed" ? (
                  <div className="h-5 w-5 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-3 w-3 text-red-500" strokeWidth={2.5} />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center">
                    <Circle className="h-2 w-2 text-[hsl(var(--muted-foreground))]" strokeWidth={2} />
                  </div>
                )}
                <span className={cn(
                  "flex-1 text-left text-sm",
                  stage.status === "running" 
                    ? "text-[hsl(var(--foreground))] font-medium"
                    : "text-[hsl(var(--muted-foreground))]"
                )}>
                  {stage.title}
                </span>
                {stage.steps.length > 0 && (
                  <ChevronRight 
                    className={cn(
                      "h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform duration-200",
                      expandedStages.has(stage.stage) && "rotate-90"
                    )} 
                    strokeWidth={1.5} 
                  />
                )}
              </button>
              
              {/* Stage Summary */}
              {stage.summary && (
                <div className="ml-8 text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]/50 px-2 py-1 rounded">
                  {stage.summary}
                </div>
              )}
              
              {/* Stage Error */}
              {stage.error && (
                <div className="ml-8 text-xs text-red-500 bg-red-500/5 px-2 py-1 rounded">
                  {stage.error}
                </div>
              )}
              
              {/* Steps */}
              {expandedStages.has(stage.stage) && stage.steps.length > 0 && (
                <div className="ml-8 space-y-1 border-l-2 border-[hsl(var(--border))] pl-3">
                  {stage.steps.map((step) => (
                    <div key={step.nodeId} className="flex items-start gap-2 py-1">
                      {step.status === "completed" ? (
                        <Check className="h-3.5 w-3.5 text-green-500 mt-0.5" strokeWidth={2} />
                      ) : step.status === "running" ? (
                        <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin mt-0.5" strokeWidth={2} />
                      ) : step.status === "failed" ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5" strokeWidth={2} />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] mt-0.5" strokeWidth={2} />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          {step.title}
                        </span>
                        {step.summary && (
                          <span className="text-xs text-[hsl(var(--muted-foreground))]/70 ml-2">
                            - {step.summary}
                          </span>
                        )}
                        {step.error && (
                          <div className="text-xs text-red-500 mt-0.5">
                            {step.error}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message, isStreaming }: { message: AgentMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user"
  
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]">
          <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">
            {message.content}
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
        <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="prose prose-sm dark:prose-invert max-w-none text-[hsl(var(--foreground))] prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-code:text-[hsl(var(--primary))] prose-code:bg-[hsl(var(--secondary))] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[hsl(var(--secondary))] prose-pre:border prose-pre:border-[hsl(var(--border))]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

function SuggestionChip({ icon: Icon, label, onClick }: { 
  icon: React.ElementType
  label: string
  onClick?: () => void
}) {
  return (
    <button 
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-[hsl(var(--border))] bg-transparent text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all duration-200"
    >
      <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
      <span className="max-w-[240px] truncate">{label}</span>
    </button>
  )
}

function SelectChip({ value, onChange, options, disabled }: { 
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-7 px-2.5 rounded-full bg-[hsl(var(--secondary))] text-xs font-medium text-[hsl(var(--foreground))] border-0 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] cursor-pointer transition-material appearance-none pr-6 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px] bg-[right_6px_center] bg-no-repeat disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

function AssetSection({ icon: Icon, label, count, assets, onViewAsset, defaultOpen = false }: { 
  icon: React.ElementType
  label: string
  count: number
  assets: TempAsset[]
  onViewAsset: (asset: TempAsset) => void
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[hsl(var(--secondary))] transition-material"
      >
        <ChevronDown className={cn(
          "h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform",
          !isOpen && "-rotate-90"
        )} strokeWidth={1.5} />
        <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
        <span className="flex-1 text-left text-sm">{label}</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{count}</span>
      </button>
      {isOpen && count > 0 && (
        <div className="ml-9 mt-1 space-y-1">
          {assets.map((asset) => (
            <div 
              key={asset.id}
              className="flex items-center gap-1 px-2 py-1.5 rounded text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-material group"
            >
              <span className="flex-1 truncate">{asset.title || "未命名资产"}</span>
              <button
                onClick={() => onViewAsset(asset)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[hsl(var(--accent))] transition-material"
                title="查看详情"
              >
                <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AssetDetailModal({ asset, onClose }: { asset: TempAsset; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-[hsl(var(--card))] rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
          <h3 className="font-medium text-[hsl(var(--foreground))]">{asset.title || "资产详情"}</h3>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[hsl(var(--secondary))] transition-material"
          >
            <X className="h-4 w-4 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="px-2 py-0.5 rounded bg-[hsl(var(--secondary))]">{asset.type}</span>
            <span>{new Date(asset.created_at).toLocaleString()}</span>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-[hsl(var(--foreground))] whitespace-pre-wrap font-mono text-xs bg-[hsl(var(--secondary))] rounded-lg p-4 overflow-auto max-h-[50vh]">
            {asset.content || "(无内容)"}
          </div>
          {asset.data && Object.keys(asset.data).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-[hsl(var(--foreground))] mb-2">元数据</h4>
              <pre className="text-xs bg-[hsl(var(--secondary))] rounded-lg p-3 overflow-auto">
                {JSON.stringify(asset.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 用户确认对话框 - 内联在画布底部显示
function ConfirmationDialog({ 
  message, 
  options, 
  onSelect,
  timeout,
}: { 
  message: string
  options: { id: string; label: string; isDefault?: boolean }[]
  onSelect: (optionId: string) => void
  timeout?: number
}) {
  // timeout 已经是秒数
  const [countdown, setCountdown] = useState(timeout || 0)
  
  useEffect(() => {
    if (!timeout || timeout <= 0) return
    
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          const defaultOption = options.find(o => o.isDefault)?.id || options[0]?.id
          if (defaultOption) onSelect(defaultOption)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(interval)
  }, [timeout, options, onSelect])
  
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
          <Sparkles className="h-5 w-5 text-blue-500" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <p className="text-sm text-[hsl(var(--foreground))] leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
          {countdown > 0 && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
              {countdown} 秒后自动选择默认选项
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 justify-end">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
              option.isDefault
                ? "bg-[hsl(var(--primary))] text-white hover:opacity-90"
                : "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// 工作流恢复对话框
function ResumeWorkflowDialog({ 
  resumeInfo, 
  onResume, 
  onCancel 
}: { 
  resumeInfo: WorkflowResumeInfo
  onResume: () => void
  onCancel: () => void
}) {
  const STAGE_NAMES: Record<number, string> = {
    1: "研究方向输入与澄清",
    2: "项目匹配/创建",
    3: "课题分析与框架生成",
    4: "文献检索",
    5: "文献整理与筛选",
    6: "文献入库",
    7: "文献综述撰写",
  }
  
  const nextStage = resumeInfo.lastCompletedStage ? resumeInfo.lastCompletedStage + 1 : 1
  const nextStageName = STAGE_NAMES[nextStage] || `阶段 ${nextStage}`
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div 
        className="bg-[hsl(var(--card))] rounded-2xl shadow-xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
              <RotateCcw className="h-6 w-6 text-amber-500" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-[hsl(var(--foreground))]">
                发现未完成的工作流
              </h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                是否从上次中断的位置继续?
              </p>
            </div>
          </div>
          
          <div className="bg-[hsl(var(--secondary))] rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[hsl(var(--muted-foreground))]">已完成阶段</span>
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                {resumeInfo.completedStages} / {resumeInfo.totalStages}
              </span>
            </div>
            <div className="w-full bg-[hsl(var(--muted))] rounded-full h-2 mb-3">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${(resumeInfo.completedStages / Math.max(resumeInfo.totalStages, 7)) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-[hsl(var(--muted-foreground))]">
                最后完成: {resumeInfo.lastCompletedStageTitle || `阶段 ${resumeInfo.lastCompletedStage}`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm mt-1">
              <Circle className="h-4 w-4 text-blue-500" />
              <span className="text-[hsl(var(--muted-foreground))]">
                下一步: {nextStageName}
              </span>
            </div>
            {resumeInfo.interruptedAt && (
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                中断时间: {new Date(resumeInfo.interruptedAt).toLocaleString()}
              </div>
            )}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              重新开始
            </button>
            <button
              onClick={onResume}
              className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-[hsl(var(--primary))] text-white hover:opacity-90 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              继续执行
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
