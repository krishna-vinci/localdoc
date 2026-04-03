"use client"

import { useEffect } from "react"

let hasUnsavedChanges = false

export function confirmUnsafeNavigation() {
  if (!hasUnsavedChanges) {
    return true
  }

  return window.confirm("You have unsaved changes. Leave without saving?")
}

export function useUnsavedChangesWarning(enabled: boolean) {
  useEffect(() => {
    hasUnsavedChanges = enabled

    return () => {
      hasUnsavedChanges = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [enabled])
}
