import { ArrowLeft, FileText } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { buttonVariants } from "@/components/ui/button-variants"
import { getDocument } from "@/lib/api"

import { DocumentWorkspace } from "./document-workspace"
import { StaleLastReadReset } from "./stale-last-read-reset"

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
      <div className="space-y-6">
        {fetchError === "Document not found" ? <StaleLastReadReset documentId={id} /> : null}
        <Link href="/documents" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-4" />
          Back to documents
        </Link>
        <EmptyState icon={FileText} title={fetchError ?? "Document not found"} description="Return to the library and pick another file." />
      </div>
    )
  }

  return <DocumentWorkspace initialDocument={doc} />
}
