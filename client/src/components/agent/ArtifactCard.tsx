import { useState } from "react"
import { FileText, X, Maximize2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import ReactDOM from "react-dom"

interface ArtifactCardProps {
  title?: string
  content: string
  isStreaming?: boolean
}

const proseClasses = `prose prose-sm dark:prose-invert max-w-none text-[hsl(var(--foreground))]
  prose-p:my-3 prose-p:leading-[1.8]
  prose-headings:mt-6 prose-headings:mb-3 prose-headings:font-semibold prose-headings:leading-tight
  prose-h1:text-xl prose-h1:border-b prose-h1:border-[hsl(var(--border))] prose-h1:pb-2
  prose-h2:text-lg prose-h3:text-base prose-h4:text-sm
  prose-ul:my-3 prose-ul:pl-5 prose-ol:my-3 prose-ol:pl-5
  prose-li:my-1 prose-li:leading-[1.7]
  prose-pre:my-3 prose-code:text-[hsl(var(--primary))]
  prose-code:bg-[hsl(var(--secondary))] prose-code:px-1 prose-code:py-0.5
  prose-code:rounded prose-code:text-[13px]
  prose-code:before:content-none prose-code:after:content-none
  prose-pre:bg-[hsl(var(--secondary))] prose-pre:border prose-pre:border-[hsl(var(--border))] prose-pre:rounded-lg
  prose-strong:text-[hsl(var(--foreground))] prose-strong:font-semibold
  prose-table:text-sm prose-table:w-full
  prose-th:bg-[hsl(var(--secondary))] prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium
  prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-[hsl(var(--border))]
  prose-blockquote:border-l-2 prose-blockquote:border-[hsl(var(--primary))] prose-blockquote:pl-4 prose-blockquote:text-[hsl(var(--muted-foreground))]`

export function ArtifactCard({ title, content, isStreaming }: ArtifactCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const cleanedContent = stripExecutiveSummary(content)
  // Extract title from original content (before stripping), then fallback to cleaned
  const displayTitle = title || extractTopicTitle(content) || extractTopicTitle(cleanedContent) || "Research Report"

  return (
    <>
      {/* Card */}
      <div
        onClick={() => !isStreaming && setIsModalOpen(true)}
        className={`rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-200 ${
          !isStreaming ? "cursor-pointer hover:border-[hsl(var(--primary))/0.4] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]" : ""
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[hsl(var(--border))/0.5]">
          <div className="flex items-center gap-2.5">
            <FileText className="h-4 w-4 text-[hsl(var(--primary))]" strokeWidth={1.5} />
            <span className="text-[14px] font-medium text-[hsl(var(--foreground))]">{displayTitle}</span>
          </div>
          {!isStreaming && (
            <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--primary))]">
              <Maximize2 className="h-3 w-3" strokeWidth={1.5} />
              <span>view full</span>
            </div>
          )}
        </div>

        {/* Preview area - limited height with scroll */}
        <div className="px-5 py-4 max-h-[200px] overflow-y-auto">
          <div className={`${proseClasses} ${isStreaming ? "streaming-cursor" : ""}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {cleanedContent}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Full-screen modal */}
      {isModalOpen && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-[hsl(var(--card))] rounded-2xl w-[90%] max-w-[720px] max-h-[80vh] shadow-[0_20px_60px_rgba(0,0,0,0.2)] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))]">
              <div className="flex items-center gap-2.5">
                <FileText className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.5} />
                <span className="text-[16px] font-semibold text-[hsl(var(--foreground))]">{displayTitle}</span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-lg hover:bg-[hsl(var(--secondary))] transition-colors"
              >
                <X className="h-5 w-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
              </button>
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className={proseClasses}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {cleanedContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// Remove executive summary and system status lines from content
function stripExecutiveSummary(content: string): string {
  const lines = content.split("\n")
  const result: string[] = []
  let skipping = false
  let skipLevel = 0

  for (const line of lines) {
    // Strip markdown formatting for matching
    const plain = line.trim().replace(/\*{1,2}|#{1,3}\s*/g, "").trim()

    // Skip system status lines
    if (/工作流恢复执行/.test(plain)) continue
    if (/^执行摘要/.test(plain)) continue
    if (/研究主题\s*[:：]/.test(plain)) continue
    if (/检索到文献\s*[:：]/.test(plain)) continue
    if (/生成临时资产\s*[:：]/.test(plain)) continue

    // Skip "# 执行摘要" heading block
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2].trim().replace(/\*{1,2}/g, "").trim()
      if (/^执行摘要/.test(text)) {
        skipping = true
        skipLevel = level
        continue
      }
      if (skipping && level <= skipLevel) {
        skipping = false
      }
    }
    if (!skipping) {
      result.push(line)
    }
  }

  return result.join("\n").replace(/^\n+/, "")
}

// Extract topic title: look for "研究主题" in content, or first heading that is not "执行摘要"
function extractTopicTitle(content: string): string | null {
  // Try to find "研究主题: xxx" pattern
  const topicMatch = content.match(/研究主题\s*[:：]\s*(.+)/m)
  if (topicMatch) return topicMatch[1].trim()

  // Fallback: first h1/h2 heading
  const headingMatch = content.match(/^#{1,2}\s+(.+)/m)
  return headingMatch ? headingMatch[1].trim() : null
}
