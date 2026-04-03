"use client"

import { useEffect } from "react"

import { clearLastReadIfMatches } from "@/lib/reader-state"

export function StaleLastReadReset({ documentId }: { documentId: string }) {
  useEffect(() => {
    clearLastReadIfMatches(documentId)
  }, [documentId])

  return null
}
