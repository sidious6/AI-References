import { Sparkles } from "lucide-react"
import { AIHeader } from "./AIHeader"
import { StepBlock } from "./StepBlock"

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

interface WorkflowTimelineProps {
  stages: StageStatus[]
  isStreaming?: boolean
  currentStageTitle?: string
  onToolPillClick?: (nodeId: string, title: string) => void
  assetTitles?: string[]
}

export function WorkflowTimeline({
  stages,
  isStreaming,
  currentStageTitle,
  onToolPillClick,
  assetTitles = [],
}: WorkflowTimelineProps) {
  const allCompleted = stages.length > 0 && stages.every(s => s.status === "completed")

  return (
    <div className="mb-6">
      {/* AI Header */}
      <AIHeader currentStageTitle={currentStageTitle} />

      {/* Timeline with all stages */}
      <div className="mt-4">
        {stages.map((stage, index) => (
          <StepBlock
            key={stage.stage}
            stage={stage}
            isLast={index === stages.length - 1}
            defaultExpanded={stage.status === "running" || stage.status === "completed"}
            onToolPillClick={onToolPillClick}
            assetTitles={assetTitles}
          />
        ))}
      </div>

      {/* Completed footer */}
      {allCompleted && !isStreaming && (
        <div className="flex items-center gap-2 mt-3 pl-10">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10">
            <Sparkles className="h-3 w-3 text-green-500" strokeWidth={2} />
          </div>
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
            Workflow completed
          </span>
        </div>
      )}
    </div>
  )
}
