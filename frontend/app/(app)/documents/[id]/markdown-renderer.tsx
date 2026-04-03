"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral max-w-none text-[0.97rem] leading-8 text-foreground dark:prose-invert prose-headings:tracking-tight prose-p:text-foreground/90 prose-strong:text-foreground prose-code:text-foreground prose-pre:border prose-pre:border-border prose-pre:bg-muted/60 prose-blockquote:border-l-4 prose-blockquote:border-border prose-blockquote:text-muted-foreground prose-li:marker:text-muted-foreground prose-a:text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 mt-0 text-3xl font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-8 text-2xl font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-6 text-xl font-semibold">{children}</h3>,
          p: ({ children }) => <p className="mb-4">{children}</p>,
          ul: ({ children }) => <ul className="mb-4 ml-5 list-disc space-y-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 ml-5 list-decimal space-y-1.5">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-5 pl-5 italic">{children}</blockquote>,
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-")
            if (isBlock) {
              return <code className="block overflow-x-auto rounded-xl px-4 py-3 font-mono text-xs">{children}</code>
            }

            return <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
          },
          pre: ({ children }) => <pre className="mb-4 rounded-xl p-0">{children}</pre>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-primary/40 underline-offset-4 hover:decoration-primary">
              {children}
            </a>
          ),
          hr: () => <hr className="my-8 border-border" />,
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-t border-border px-3 py-2">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
