import { useState } from "react"
import { Check, Loader2, ChevronDown, Circle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface StageStatus {
  stage: number
  title: string
  status: "pending" | "running" | "completed" | "failed"
}

interface TaskProgressCardProps {
  stages: StageStatus[]
  completedCount: number
  totalCount: number
  isRunning: boolean
  runningStageTitle?: string
}

export function TaskProgressCard({
  stages,
  completedCount,
  totalCount,
  isRunning,
  runningStageTitle,
}: TaskProgressCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (stages.length === 0) return null

  return (
    <div className="mb-3 rounded-xl border border-[hsl(var(--border))/0.6] bg-[hsl(var(--card))] shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[hsl(var(--secondary))/0.5] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {isRunning ? (
            <Loader2 className="h-4 w-4 text-[hsl(var(--primary))] animate-spin" strokeWidth={2} />
          ) : (
            <Check className="h-4 w-4 text-green-500" strokeWidth={2} />
          )}
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">
            {isRunning
              ? (runningStageTitle || "Processing...")
              : "Deep-Reference workflow"
            }
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {completedCount}/{totalCount}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform duration-200",
              !isExpanded && "-rotate-90"
            )}
            strokeWidth={1.5}
          />
        </div>
      </button>

      {/* Expanded task list */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-1 progress-expand">
          {stages.map((stage) => (
            <div
              key={stage.stage}
              className="flex items-center gap-2.5 py-1.5"
            >
              {stage.status === "completed" ? (
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" strokeWidth={2} />
              ) : stage.status === "running" ? (
                <Loader2 className="h-4 w-4 text-[hsl(var(--primary))] animate-spin flex-shrink-0" strokeWidth={2} />
              ) : stage.status === "failed" ? (
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" strokeWidth={2} />
              ) : (
                <Circle className="h-3 w-3 text-[hsl(var(--border))] flex-shrink-0 ml-0.5 mr-0.5" strokeWidth={2} />
              )}
              <span
                className={cn(
                  "text-sm",
                  stage.status === "completed" && "text-[hsl(var(--muted-foreground))]",
                  stage.status === "running" && "text-[hsl(var(--foreground))] font-medium",
                  stage.status === "failed" && "text-red-500",
                  stage.status === "pending" && "text-[hsl(var(--muted-foreground))/0.6]"
                )}
              >
                {stage.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
