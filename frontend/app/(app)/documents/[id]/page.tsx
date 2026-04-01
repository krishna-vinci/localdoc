import { ArrowLeft, FileText } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { getDocument } from "@/lib/api"
import { MarkdownRenderer } from "./markdown-renderer"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function DocumentPage({ params }: PageProps) {
  const { id } = await params

  let doc: Awaited<ReturnType<typeof getDocument>> | null = null
  let fetchError: string | null = null

  try {
    doc = await getDocument(id)
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "Failed to load document"
  }

  if (fetchError || !doc) {
    return (
      <div className="space-y-4">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back to Documents
        </Link>
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <FileText className="mx-auto mb-3 size-8 opacity-40" />
          <p className="text-sm">{fetchError ?? "Document not found"}</p>
        </div>
      </div>
    )
  }

  const tags = doc.tags ? doc.tags.split(",").map((t) => t.trim()).filter(Boolean) : []
  const headings = doc.headings ? (JSON.parse(doc.headings) as string[]) : []
  const links = doc.links ? (JSON.parse(doc.links) as string[]) : []
  const tasks = doc.tasks ? (JSON.parse(doc.tasks) as string[]) : []

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/documents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to Documents
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{doc.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{doc.file_name}</span>
          {doc.project_name && (
            <>
              <span>·</span>
              <span>{doc.project_name}</span>
            </>
          )}
          {doc.folder_name && (
            <>
              <span>·</span>
              <span>{doc.folder_name}</span>
            </>
          )}
          <span>·</span>
          <span>Updated {new Date(doc.updated_at).toLocaleDateString()}</span>
          <span>·</span>
          <span>{(doc.size_bytes / 1024).toFixed(1)} KB</span>
          {doc.status && (
            <>
              <span>·</span>
              <span>Status {doc.status}</span>
            </>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="rounded-xl border border-border bg-card p-6">
        <MarkdownRenderer content={doc.content} />
      </div>

      {(headings.length > 0 || links.length > 0 || tasks.length > 0) && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Headings</h2>
            {headings.length === 0 ? <p className="text-xs text-muted-foreground">No headings extracted.</p> : (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {headings.map((heading) => <li key={heading}>{heading}</li>)}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Links</h2>
            {links.length === 0 ? <p className="text-xs text-muted-foreground">No links extracted.</p> : (
              <ul className="space-y-2 text-sm text-muted-foreground break-all">
                {links.map((link) => <li key={link}>{link}</li>)}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Tasks ({doc.task_count})</h2>
            {tasks.length === 0 ? <p className="text-xs text-muted-foreground">No tasks extracted.</p> : (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {tasks.map((task) => <li key={task}>{task}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
