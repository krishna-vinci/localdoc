"use client"

import { FileText, Search } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { getDocuments, searchDocuments } from "@/lib/api"
import type { DocumentListItem, SearchResult } from "@/types"

type ListItem = DocumentListItem | SearchResult

function isSearchResult(item: ListItem): item is SearchResult {
  return "snippet" in item
}

export default function DocumentsPage() {
  const [query, setQuery] = useState("")
  const [docs, setDocs] = useState<DocumentListItem[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDocs(await getDocuments())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!query.trim()) {
      setSearchResults(null)
      return
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      setError(null)
      try {
        setSearchResults(await searchDocuments(query.trim()))
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed")
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [query])

  const items: ListItem[] = searchResults !== null ? searchResults : docs
  const isSearch = searchResults !== null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse and search your indexed markdown files
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 h-9"
          placeholder="Search documents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Status line */}
      {isSearch && (
        <p className="text-sm text-muted-foreground">
          {searching
            ? "Searching…"
            : `${items.length} result${items.length !== 1 ? "s" : ""} for "${query}"`}
        </p>
      )}

      {/* List */}
      {loading && !isSearch ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <FileText className="mx-auto mb-3 size-8 opacity-40" />
          <p className="text-sm">
            {isSearch ? "No results found." : "No documents indexed yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const snippet = isSearchResult(item) ? item.snippet : null
            const tags = item.tags ? item.tags.split(",").map((t) => t.trim()).filter(Boolean) : []
            return (
              <Link key={item.id} href={`/documents/${item.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <FileText className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.file_name}</p>
                          {snippet && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {snippet}
                            </p>
                          )}
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <time className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                        {new Date(item.updated_at).toLocaleDateString()}
                      </time>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
