interface ThinkingIndicatorProps {
  text?: string
}

export function ThinkingIndicator({ text = "Thinking" }: ThinkingIndicatorProps) {
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="thinking-shimmer">{text}</span>
    </div>
  )
}
