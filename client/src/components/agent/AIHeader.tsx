import { BookOpen } from "lucide-react"

interface AIHeaderProps {
  currentStageTitle?: string
}

export function AIHeader({ currentStageTitle }: AIHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 mb-1">
      <div className="flex h-5 w-5 items-center justify-center">
        <BookOpen className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.5} />
      </div>
      <span className="text-[15px] font-semibold text-[hsl(var(--foreground))]">
        AI-References
      </span>
      <span className="text-[11px] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] px-1.5 py-0.5 rounded uppercase tracking-wide">
        Agent
      </span>
      {currentStageTitle && (
        <span className="text-[11px] text-[hsl(var(--primary))] bg-[hsl(var(--accent))] px-2 py-0.5 rounded">
          {currentStageTitle}
        </span>
      )}
    </div>
  )
}
