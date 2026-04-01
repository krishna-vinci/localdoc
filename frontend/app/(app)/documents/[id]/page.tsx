import { ArrowLeft, FileText } from "lucide-react"
import Link from "next/link"

import { getDocument } from "@/lib/api"
import { DocumentWorkspace } from "./document-workspace"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function DocumentPage({ params }: PageProps) {
  const { id } = await params

  let doc: Awaited<ReturnType<typeof getDocument>> | null = null
  let fetchError: string | null = null

  try {
    doc = await getDocument(id)
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Failed to load document"
  }

  if (fetchError || !doc) {
    return (
      <div className="space-y-4">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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

  return <DocumentWorkspace initialDocument={doc} />
}
