import { Check, Loader2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToolPillProps {
  title: string
  nodeId: string
  status: "pending" | "running" | "completed" | "failed"
  hasLinkedAsset?: boolean
  onClick?: (nodeId: string, title: string) => void
}

export function ToolPill({ title, nodeId, status, hasLinkedAsset, onClick }: ToolPillProps) {
  const clickable = status === "completed" && !!onClick && !!hasLinkedAsset

  return (
    <div
      onClick={() => clickable && onClick(nodeId, title)}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[20px] text-xs border transition-all duration-200",
        status === "completed"
          ? "bg-[hsl(var(--secondary))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
          : status === "running"
            ? "bg-[hsl(var(--accent))] border-[hsl(var(--primary))/0.3] text-[hsl(var(--primary))]"
            : status === "failed"
              ? "bg-red-500/5 border-red-500/20 text-red-500"
              : "bg-[hsl(var(--secondary))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]",
        clickable && "cursor-pointer hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] active:scale-[0.98]"
      )}
    >
      {status === "running" && (
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
      )}
      {status === "completed" && (
        <Check className="h-3 w-3 text-green-500" strokeWidth={2.5} />
      )}
      {status === "failed" && (
        <AlertTriangle className="h-3 w-3 text-red-500" strokeWidth={2} />
      )}
      <span className="font-medium">{title}</span>
    </div>
  )
}
