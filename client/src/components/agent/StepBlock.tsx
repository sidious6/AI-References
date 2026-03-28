import { useState } from "react"
import { Check, Loader2, AlertTriangle, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { ToolPill } from "./ToolPill"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface StepStatus {
  nodeId: string
  title: string
  status: "pending" | "running" | "completed" | "failed"
  summary?: string
  error?: string
}

interface StageStatus {
  stage: number
  title: string
  status: "pending" | "running" | "completed" | "failed"
  nodeId?: string
  summary?: string
  error?: string
  steps: StepStatus[]
}

interface StepBlockProps {
  stage: StageStatus
  isLast: boolean
  defaultExpanded?: boolean
  onToolPillClick?: (nodeId: string, title: string) => void
  assetTitles?: string[]
}

export function StepBlock({ stage, isLast, defaultExpanded = false, onToolPillClick, assetTitles = [] }: StepBlockProps) {
  const [isExpanded, setIsExpanded] = useState(
    defaultExpanded || stage.status === "running"
  )

  const hasContent = stage.steps.length > 0 || stage.summary || stage.error

  return (
    <div className="relative pl-10 pb-4">
      {/* Timeline connector line */}
      {!isLast && (
        <div
          className="absolute left-[10px] top-[22px] w-px bg-[hsl(var(--border))]"
          style={{ height: "calc(100% - 10px)" }}
        />
      )}

      {/* Step indicator circle */}
      <div
        className={cn(
          "absolute left-0 top-[2px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] bg-[hsl(var(--card))]",
          stage.status === "completed" && "border-[hsl(var(--muted-foreground))/0.4] bg-[hsl(var(--secondary))]",
          stage.status === "running" && "border-[hsl(var(--primary))]",
          stage.status === "failed" && "border-red-400",
          stage.status === "pending" && "border-[hsl(var(--border))]"
        )}
      >
        {stage.status === "completed" && (
          <Check className="h-3 w-3 text-[hsl(var(--muted-foreground))]" strokeWidth={2.5} />
        )}
        {stage.status === "running" && (
          <Loader2 className="h-3 w-3 text-[hsl(var(--primary))] animate-spin" strokeWidth={2.5} />
        )}
        {stage.status === "failed" && (
          <AlertTriangle className="h-3 w-3 text-red-500" strokeWidth={2.5} />
        )}
      </div>

      {/* Step title - clickable to toggle */}
      <button
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-2 w-full text-left select-none",
          hasContent && "cursor-pointer"
        )}
      >
        <span
          className={cn(
            "text-[15px] font-medium flex-1",
            stage.status === "running" && "text-[hsl(var(--foreground))]",
            stage.status === "completed" && "text-[hsl(var(--foreground))]",
            stage.status === "failed" && "text-red-500",
            stage.status === "pending" && "text-[hsl(var(--muted-foreground))]"
          )}
        >
          {stage.title}
        </span>
        {hasContent && (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform duration-200",
              !isExpanded && "-rotate-90"
            )}
            strokeWidth={1.5}
          />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && hasContent && (
        <div className="mt-2 step-content-enter">
          {/* Stage description / summary */}
          {stage.summary && (
            <div className="text-[14px] text-[hsl(var(--muted-foreground))] leading-[1.7] mb-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {stage.summary}
              </ReactMarkdown>
            </div>
          )}

          {/* Running stage with no summary yet - show shimmer */}
          {stage.status === "running" && !stage.summary && stage.steps.length === 0 && (
            <div className="mb-3">
              <span className="thinking-shimmer">{stage.title}...</span>
            </div>
          )}

          {/* Error message */}
          {stage.error && (
            <div className="text-sm text-red-500 bg-red-500/5 rounded-lg px-3 py-2 mb-3">
              {stage.error}
            </div>
          )}

          {/* Tool pills for sub-steps */}
          {stage.steps.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {stage.steps.map((step) => {
                const stepLower = step.title.toLowerCase()
                const linked = assetTitles.some(t => 
                  t.includes(stepLower) || stepLower.includes(t)
                )
                return (
                  <ToolPill
                    key={step.nodeId}
                    nodeId={step.nodeId}
                    title={step.title}
                    status={step.status}
                    hasLinkedAsset={linked}
                    onClick={onToolPillClick}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
