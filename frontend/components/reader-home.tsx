"use client"

import { Loader2, Search } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { buttonVariants } from "@/components/ui/button-variants"
import { useReaderState } from "@/lib/reader-state"

export function ReaderHome() {
  const router = useRouter()
  const readerState = useReaderState()

  useEffect(() => {
    if (!readerState.lastReadId) {
      return
    }

    router.replace(`/documents/${readerState.lastReadId}`)
  }, [readerState.lastReadId, router])

  if (readerState.lastReadId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 px-5 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Opening your last note…
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={Search}
        title="Your library is ready"
        description="Pick a note from the sidebar, search with ⌘K, or open the full document browser if you want a broader scan of the library."
        action={
          <Link href="/documents" className={buttonVariants({ variant: "outline" })}>
            Browse documents
          </Link>
        }
        className="w-full max-w-2xl"
      />
    </div>
  )
}
