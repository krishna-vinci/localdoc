"use client"

import { useQuery } from "@tanstack/react-query"
import { FileText, FolderOpen, Layers3, Loader2, Search, Smartphone, Wrench } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { SearchInput } from "@/components/shared/search-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { searchDocuments } from "@/lib/api"
import { getDocumentLocation, getDocumentTags } from "@/lib/document-utils"
import { confirmUnsafeNavigation } from "@/lib/navigation-guard"
import { sanitizeHighlightedSnippet } from "@/lib/search-snippet"
import { useDebouncedValue } from "@/lib/use-debounced-value"
import { cn } from "@/lib/utils"

const quickLinks = [
  { href: "/", label: "Resume reading", description: "Open your reading surface", icon: FileText },
  { href: "/documents", label: "All documents", description: "Browse your full library", icon: FileText },
  { href: "/manage/projects", label: "Manage projects", description: "Workspaces and templates", icon: Layers3 },
  { href: "/manage/folders", label: "Manage folders", description: "Sources and watchers", icon: FolderOpen },
  { href: "/manage/devices", label: "Manage devices", description: "Agents and mirrored shares", icon: Smartphone },
  { href: "/manage/operations", label: "Manage operations", description: "Jobs, health, and backups", icon: Wrench },
] as const

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const debouncedQuery = useDebouncedValue(query, 220)

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setQuery("")
        setActiveIndex(0)
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange]
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        handleOpenChange(!open)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleOpenChange, open])

  const resultsQuery = useQuery({
    queryKey: ["command-search", debouncedQuery],
    queryFn: () => searchDocuments(debouncedQuery, {}, 8),
    enabled: debouncedQuery.trim().length > 1 && open,
  })

  const items = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return quickLinks.map((link) => ({ type: "link" as const, ...link }))
    }

    return (resultsQuery.data ?? []).map((item) => ({ type: "result" as const, item }))
  }, [debouncedQuery, resultsQuery.data])

  function handleQueryChange(value: string) {
    setQuery(value)
    setActiveIndex(0)
  }

  function goTo(href: string) {
    if (!confirmUnsafeNavigation()) {
      return
    }
    handleOpenChange(false)
    router.push(href)
  }

  function handleEnter() {
    const activeItem = items[activeIndex]
    if (!activeItem) return

    if (activeItem.type === "link") {
      goTo(activeItem.href)
      return
    }

    goTo(`/documents/${activeItem.item.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-[12vh] max-h-[76vh] w-[min(42rem,calc(100vw-1.5rem))] translate-x-[-50%] translate-y-0 rounded-[1.75rem] border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/70 px-5 pt-5 pb-4">
          <DialogTitle className="text-base">Search your library</DialogTitle>
          <DialogDescription>Jump to a document, open a workspace, or move through the app without digging.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-4">
            <SearchInput
              autoFocus
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActiveIndex((current) => Math.min(current + 1, Math.max(items.length - 1, 0)))
              }

              if (event.key === "ArrowUp") {
                event.preventDefault()
                setActiveIndex((current) => Math.max(current - 1, 0))
              }

              if (event.key === "Enter") {
                event.preventDefault()
                handleEnter()
              }
            }}
            placeholder="Search documents, projects, folders…"
            shortcut="Esc"
          />

          <div className="max-h-[52vh] overflow-y-auto pb-1">
            {resultsQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Searching your indexed files…
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
                Nothing matched that search. Try a title, tag, or phrase from the document body.
              </div>
            ) : (
              <div className="space-y-2" role="listbox" aria-label="Search results">
                {items.map((item, index) => {
                  if (item.type === "link") {
                    const Icon = item.icon

                    return (
                      <button
                        key={item.href}
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                          activeIndex === index
                            ? "border-primary/20 bg-primary/6"
                            : "border-border/60 bg-background hover:bg-muted/50"
                        )}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => goTo(item.href)}
                      >
                        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <Icon className="size-4" />
                        </span>
                        <span className="space-y-0.5">
                          <span className="block text-sm font-medium">{item.label}</span>
                          <span className="block text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      </button>
                    )
                  }

                  const tags = getDocumentTags(item.item)
                  const sanitizedSnippet = sanitizeHighlightedSnippet(item.item.snippet)

                  return (
                    <button
                      key={item.item.id}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                        activeIndex === index
                          ? "border-primary/20 bg-primary/6"
                          : "border-border/60 bg-background hover:bg-muted/50"
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => goTo(`/documents/${item.item.id}`)}
                    >
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <Search className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block truncate text-sm font-medium">{item.item.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{getDocumentLocation(item.item)}</span>
                        {sanitizedSnippet ? (
                          <span
                            className="line-clamp-2 block text-xs text-muted-foreground [&_mark]:rounded-sm [&_mark]:bg-primary/15 [&_mark]:px-0.5 [&_mark]:text-foreground"
                            dangerouslySetInnerHTML={{ __html: sanitizedSnippet }}
                          />
                        ) : null}
                        <span className="flex flex-wrap gap-1.5 pt-1">
                          {item.item.status ? <Badge variant="secondary">{item.item.status}</Badge> : null}
                          {tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <p>Use ↑ ↓ to move, Enter to open, and Esc to close.</p>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
