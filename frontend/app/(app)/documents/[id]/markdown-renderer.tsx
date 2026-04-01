"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Override elements to use design system colors
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-6 mb-3 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold mt-5 mb-2.5">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-4 mb-2">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-4 text-muted-foreground italic my-3">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-")
            if (isBlock) {
              return (
                <code className="block rounded-lg bg-muted px-4 py-3 font-mono text-xs overflow-x-auto">
                  {children}
                </code>
              )
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
            )
          },
          pre: ({ children }) => <pre className="mb-3">{children}</pre>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 hover:opacity-80"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-5 border-border" />,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
          th: ({ children }) => (
            <th className="py-2 px-3 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="py-2 px-3 border-b border-border/50">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
