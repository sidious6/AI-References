import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AIHeader } from "./AIHeader"

interface AgentMessage {
  id: string
  session_id: string
  role: string
  content: string
  tool_calls: unknown
  tool_call_id: string | null
  metadata: Record<string, unknown>
  tokens_used: number | null
  created_at: string
  updated_at: string
}

interface TimelineMessageProps {
  message: AgentMessage
  isStreaming?: boolean
  isFirstAssistantMessage?: boolean
  currentStageTitle?: string
}

export function TimelineMessage({
  message,
  isStreaming,
  isFirstAssistantMessage,
  currentStageTitle,
}: TimelineMessageProps) {
  const isUser = message.role === "user"

  // User message - right aligned bubble
  if (isUser) {
    return (
      <div className="flex justify-end mb-8">
        <div className="max-w-[80%] px-5 py-3 bg-[hsl(var(--card))] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-[hsl(var(--border))/0.5]">
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words text-[hsl(var(--foreground))]">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  // AI message - answer text only (stages handled by WorkflowTimeline)
  return (
    <div className="mb-6">
      {/* AI Header - only for first assistant message when no workflow */}
      {isFirstAssistantMessage && (
        <AIHeader currentStageTitle={currentStageTitle} />
      )}

      {/* Main answer text */}
      {message.content && (
        <div className="mt-2">
          <div className={`prose prose-sm dark:prose-invert max-w-none text-[hsl(var(--foreground))] leading-[1.8]
            prose-p:my-2 prose-headings:my-3 prose-headings:font-semibold
            prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm
            prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
            prose-pre:my-2 prose-code:text-[hsl(var(--primary))]
            prose-code:bg-[hsl(var(--secondary))] prose-code:px-1 prose-code:py-0.5
            prose-code:rounded prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-[hsl(var(--secondary))] prose-pre:border prose-pre:border-[hsl(var(--border))]
            prose-strong:text-[hsl(var(--foreground))] prose-strong:font-semibold
            prose-table:text-sm prose-th:bg-[hsl(var(--secondary))] prose-th:px-3 prose-th:py-2
            prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-[hsl(var(--border))]
            ${isStreaming ? "streaming-cursor" : ""}`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
