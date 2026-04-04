"use client"

import { Check, Copy } from "lucide-react"
import { Children, isValidElement, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ReaderFontSize = "sm" | "md" | "lg"

const TASK_STATE_STORAGE_PREFIX = "localdocs.markdown.tasks"

const typographyClasses: Record<ReaderFontSize, string> = {
  sm: "text-[0.94rem] leading-7 prose-headings:scroll-mt-24 prose-headings:break-words prose-h1:text-[2.2rem] prose-h2:text-[1.7rem] prose-h3:text-[1.35rem]",
  md: "text-[1rem] leading-8 prose-headings:scroll-mt-24 prose-headings:break-words prose-h1:text-[2.45rem] prose-h2:text-[1.9rem] prose-h3:text-[1.5rem]",
  lg: "text-[1.08rem] leading-9 prose-headings:scroll-mt-24 prose-headings:break-words prose-h1:text-[2.7rem] prose-h2:text-[2.05rem] prose-h3:text-[1.65rem]",
}

function getTaskStorageKey(documentId: string) {
  return `${TASK_STATE_STORAGE_PREFIX}.${documentId}`
}

function readStoredTaskState(documentId: string): Record<string, boolean> {
  if (typeof window === "undefined") {
    return {}
  }

  const storedState = window.localStorage.getItem(getTaskStorageKey(documentId))
  if (!storedState) {
    return {}
  }

  try {
    return JSON.parse(storedState) as Record<string, boolean>
  } catch {
    return {}
  }
}

function getNodeKey(
  node: { position?: { start?: { offset?: number | null; line?: number | null; column?: number | null } } } | undefined,
  fallback: string
) {
  const start = node?.position?.start
  if (typeof start?.offset === "number") {
    return `offset-${start.offset}`
  }

  if (typeof start?.line === "number" && typeof start?.column === "number") {
    return `line-${start.line}-column-${start.column}`
  }

  return fallback
}

function getTextContent(children: ReactNode) {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
}

function CodeBlock({
  blockId,
  code,
  language,
  onCopy,
  copyState,
}: {
  blockId: string
  code: string
  language?: string
  onCopy: (blockId: string, value: string) => void
  copyState: "copied" | "failed" | null
}) {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-border/70 bg-muted/35">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate font-medium uppercase tracking-[0.16em]">{language ?? "Code"}</span>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onCopy(blockId, code)}>
          {copyState === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4">
        <code className="block min-w-full font-mono text-[0.82rem] leading-6 text-foreground">{code}</code>
      </pre>
    </div>
  )
}

export function MarkdownRenderer({
  content,
  documentId,
  fontSize = "md",
}: {
  content: string
  documentId: string
  fontSize?: ReaderFontSize
}) {
  const [copiedBlock, setCopiedBlock] = useState<{ id: string; status: "copied" | "failed" } | null>(null)
  const [taskState, setTaskState] = useState<Record<string, boolean>>(() => readStoredTaskState(documentId))
  let taskFallbackIndex = 0
  let codeFallbackIndex = 0

  function updateTaskState(key: string, checked: boolean) {
    setTaskState((current) => {
      const nextState = { ...current, [key]: checked }
      window.localStorage.setItem(getTaskStorageKey(documentId), JSON.stringify(nextState))
      return nextState
    })
  }

  async function handleCopy(blockId: string, code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedBlock({ id: blockId, status: "copied" })
    } catch {
      setCopiedBlock({ id: blockId, status: "failed" })
    }

    window.setTimeout(() => {
      setCopiedBlock((current) => (current?.id === blockId ? null : current))
    }, 1500)
  }

  const components: Components = {
    h1: ({ children }) => <h1 className="mb-4 mt-0 font-semibold tracking-tight">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-3 mt-10 font-semibold tracking-tight">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-8 font-semibold tracking-tight">{children}</h3>,
    p: ({ children }) => <p className="mb-5 break-words [overflow-wrap:anywhere]">{children}</p>,
    ul: ({ children, className }) => (
      <ul
        className={cn(
          "mb-5 ml-5 list-disc space-y-2 [&_ul]:mt-2 [&_ul]:space-y-2",
          className?.includes("contains-task-list") && "ml-0 list-none pl-0",
          className
        )}
      >
        {children}
      </ul>
    ),
    ol: ({ children, className }) => (
      <ol
        className={cn(
          "mb-5 ml-5 list-decimal space-y-2 [&_ol]:mt-2 [&_ol]:space-y-2",
          className?.includes("contains-task-list") && "ml-0 list-none pl-0",
          className
        )}
      >
        {children}
      </ol>
    ),
    li: ({ children, className }) => (
      <li
        className={cn(
          "break-words [overflow-wrap:anywhere]",
          className?.includes("task-list-item") && "flex items-start gap-2 list-none",
          className
        )}
      >
        {children}
      </li>
    ),
    blockquote: ({ children }) => <blockquote className="my-6 border-l-4 border-border pl-5 italic text-muted-foreground">{children}</blockquote>,
    code: ({ children }) => {
      return (
        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] break-words text-foreground">
          {children}
        </code>
      )
    },
    pre: ({ children, node }) => {
      const child = Children.toArray(children)[0]

      if (!isValidElement(child)) {
        return <pre className="mb-5 overflow-x-auto rounded-2xl border border-border/70 bg-muted/35 p-4">{children}</pre>
      }

      const childProps = child.props as { children?: ReactNode; className?: string }
      const codeValue = getTextContent(childProps.children).replace(/\n$/, "")
      const language = childProps.className?.replace("language-", "")
      const blockId = getNodeKey(node, `code-${language ?? "plain"}-${codeFallbackIndex++}`)

      return (
        <CodeBlock
          blockId={blockId}
          code={codeValue}
          language={language}
          onCopy={handleCopy}
          copyState={copiedBlock?.id === blockId ? copiedBlock.status : null}
        />
      )
    },
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
      >
        {children}
      </a>
    ),
    hr: () => <hr className="my-8 border-border" />,
    table: ({ children }) => (
      <div className="mb-5 overflow-x-auto rounded-2xl border border-border/70">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
    th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-t border-border px-3 py-2 align-top break-words [overflow-wrap:anywhere]">{children}</td>,
    img: ({ alt, src }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={alt ?? ""} src={src ?? ""} className="my-6 max-w-full rounded-2xl border border-border/60" />
    ),
    input: ({ node, checked, type, ...props }) => {
      if (type !== "checkbox") {
        return <input type={type} {...props} />
      }

      const taskKey = getNodeKey(node, `task-${taskFallbackIndex++}`)
      const isChecked = taskState[taskKey] ?? Boolean(checked)

      return (
        <input
          {...props}
          type="checkbox"
          checked={isChecked}
          onChange={(event) => updateTaskState(taskKey, event.target.checked)}
          className="mr-3 mt-1 size-4 rounded border-border bg-background align-top accent-primary"
          aria-label="Toggle markdown task item"
        />
      )
    },
  }

  return (
    <div
      className={cn(
        "prose prose-neutral max-w-none break-words text-foreground dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-code:text-foreground prose-li:marker:text-muted-foreground prose-a:text-primary",
        typographyClasses[fontSize]
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  )
}
