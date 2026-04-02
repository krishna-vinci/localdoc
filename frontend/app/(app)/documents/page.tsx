"use client"

import { FileText, Search } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { getDocuments, getFolders, getProjects, searchDocuments } from "@/lib/api"
import { formatDate } from "@/lib/format"
import type { DocumentListItem, Folder, Project, SearchResult } from "@/types"

type ListItem = DocumentListItem | SearchResult

function isSearchResult(item: ListItem): item is SearchResult {
  return "snippet" in item
}

export default function DocumentsPage() {
  const [query, setQuery] = useState("")
  const [docs, setDocs] = useState<DocumentListItem[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [selectedFolderId, setSelectedFolderId] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("")
  const [selectedTag, setSelectedTag] = useState("")
  const [showOrphansOnly, setShowOrphansOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const loadedDocs = await getDocuments({
        project_id: selectedProjectId || undefined,
        folder_id: selectedFolderId || undefined,
        status: selectedStatus || undefined,
        tag: selectedTag || undefined,
        orphaned: showOrphansOnly || undefined,
      })
      setDocs(loadedDocs)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents")
    } finally {
      setLoading(false)
    }
  }, [selectedFolderId, selectedProjectId, selectedStatus, selectedTag, showOrphansOnly])

  useEffect(() => {
    void (async () => {
      try {
        const [loadedProjects, loadedFolders] = await Promise.all([getProjects(), getFolders()])
        setProjects(loadedProjects)
        setFolders(loadedFolders)
      } catch {
        // ignore filter bootstrap errors
      }
    })()
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
          setSearchResults(await searchDocuments(query.trim(), {
            project_id: selectedProjectId || undefined,
            folder_id: selectedFolderId || undefined,
            status: selectedStatus || undefined,
            tag: selectedTag || undefined,
          }))
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
  }, [query, selectedFolderId, selectedProjectId, selectedStatus, selectedTag])

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
          {folders
            .filter((folder) => !selectedProjectId || folder.project_id === selectedProjectId)
            .map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
        </select>

        <Input placeholder="Filter by tag" value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} />

        <Input placeholder="Filter by status" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} />

        <label className="flex items-center gap-2 rounded-lg border border-input px-3 text-sm">
          <input type="checkbox" checked={showOrphansOnly} onChange={(e) => setShowOrphansOnly(e.target.checked)} />
          Orphans only
        </label>
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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <FileText className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.project_name ?? "No project"} · {item.folder_name ?? item.file_name}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="text-[11px]">
                              {item.source_type === "remote_mirror" ? "remote mirror" : "local"}
                            </Badge>
                            {item.is_read_only && (
                              <Badge variant="secondary" className="text-[11px]">
                                read-only
                              </Badge>
                            )}
                            {item.source_path && (
                              <Badge variant="outline" className="max-w-full truncate text-[11px]">
                                {item.source_path}
                              </Badge>
                            )}
                          </div>
                          {snippet && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-3" dangerouslySetInnerHTML={{ __html: snippet }} />
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
                          {item.status && (
                            <p className="text-xs text-muted-foreground mt-1">Status: {item.status}</p>
                          )}
                        </div>
                      </div>
                      <time className="text-xs text-muted-foreground shrink-0 whitespace-nowrap sm:text-right">
                        {formatDate(item.updated_at)}
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
