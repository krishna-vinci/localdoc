"use client"

import { FileText, Search } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { getFolders, getProjects, searchDocuments } from "@/lib/api"
import type { Folder, Project, SearchResult } from "@/types"

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [selectedFolderId, setSelectedFolderId] = useState("")
  const [selectedTag, setSelectedTag] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("")
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [loadedProjects, loadedFolders] = await Promise.all([getProjects(), getFolders()])
        setProjects(loadedProjects)
        setFolders(loadedFolders)
      } catch {
        // ignore filter boot errors
      }
    })()
  }, [])

  useEffect(() => {
    if (query.trim()) {
      handleChange(query)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, selectedFolderId, selectedTag, selectedStatus])

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
        setResults(await searchDocuments(value.trim(), {
          project_id: selectedProjectId || undefined,
          folder_id: selectedFolderId || undefined,
          tag: selectedTag || undefined,
          status: selectedStatus || undefined,
        }))
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <select
          value={selectedProjectId}
          onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedFolderId("") }}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <select
          value={selectedFolderId}
          onChange={(e) => setSelectedFolderId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">All folders</option>
          {folders.filter((folder) => !selectedProjectId || folder.project_id === selectedProjectId).map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
        <Input placeholder="Tag" value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} />
        <Input placeholder="Status" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} />
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
                        <p className="text-xs text-muted-foreground truncate">
                          {r.project_name ?? "No project"} · {r.folder_name ?? r.file_name}
                        </p>
                        {r.snippet && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-3" dangerouslySetInnerHTML={{ __html: r.snippet }} />
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
                        {r.status && <p className="text-xs text-muted-foreground mt-1">Status: {r.status}</p>}
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
