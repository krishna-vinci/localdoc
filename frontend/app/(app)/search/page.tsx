"use client"

import { FileText, Search } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { searchDocuments } from "@/lib/api"
import type { SearchResult } from "@/types"

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(value: string) {
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    if (!value.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    timer.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        setResults(await searchDocuments(value.trim()))
        setSearched(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed")
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Full-text search across all indexed documents
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          className="pl-9 h-10 text-base"
          placeholder="Type to search…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Search className="mx-auto mb-3 size-8 opacity-40" />
          <p className="text-sm">No results for &ldquo;{query}&rdquo;</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
          {results.map((r) => {
            const tags = r.tags ? r.tags.split(",").map((t) => t.trim()).filter(Boolean) : []
            return (
              <Link key={r.id} href={`/documents/${r.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <FileText className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.file_name}</p>
                        {r.snippet && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {r.snippet}
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
