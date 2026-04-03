"use client"

import { useQuery } from "@tanstack/react-query"
import { FileSearch, Sparkles } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { DocumentListItem } from "@/components/documents/document-list-item"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { SearchInput } from "@/components/shared/search-input"
import {
  SectionPanel,
  SectionPanelContent,
  SectionPanelDescription,
  SectionPanelHeader,
  SectionPanelTitle,
} from "@/components/shared/section-panel"
import { buttonVariants } from "@/components/ui/button-variants"
import { Input } from "@/components/ui/input"
import { getDocuments, getFolders, getProjects, searchDocuments } from "@/lib/api"
import type { SearchableDocument } from "@/lib/document-utils"
import { useDebouncedValue } from "@/lib/use-debounced-value"
import type {
  DocumentFilters,
  DocumentListItem as DocumentListEntry,
  Folder,
  Project,
  SearchResult,
} from "@/types"

interface DocumentBrowserProps {
  initialDocuments: DocumentListEntry[]
  initialSearchResults: SearchResult[]
  initialProjects: Project[]
  initialFolders: Folder[]
  initialFilters?: DocumentFilters
  initialQuery?: string
  autoFocus?: boolean
  mode?: "documents" | "search"
}

export function DocumentBrowser({
  initialDocuments,
  initialSearchResults,
  initialProjects,
  initialFolders,
  initialFilters,
  initialQuery = "",
  autoFocus = false,
  mode = "documents",
}: DocumentBrowserProps) {
  const [query, setQuery] = useState(initialQuery)
  const [selectedProjectId, setSelectedProjectId] = useState(initialFilters?.project_id ?? "")
  const [selectedFolderId, setSelectedFolderId] = useState(initialFilters?.folder_id ?? "")
  const [selectedStatus, setSelectedStatus] = useState(initialFilters?.status ?? "")
  const [selectedTag, setSelectedTag] = useState(initialFilters?.tag ?? "")
  const [showOrphansOnly, setShowOrphansOnly] = useState(initialFilters?.orphaned ?? false)

  const debouncedQuery = useDebouncedValue(query, 250)
  const filters = useMemo<DocumentFilters>(
    () => ({
      project_id: selectedProjectId || undefined,
      folder_id: selectedFolderId || undefined,
      status: selectedStatus || undefined,
      tag: selectedTag || undefined,
      orphaned: showOrphansOnly || undefined,
    }),
    [selectedFolderId, selectedProjectId, selectedStatus, selectedTag, showOrphansOnly]
  )

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
    initialData: initialProjects,
    initialDataUpdatedAt: 0,
  })

  const foldersQuery = useQuery({
    queryKey: ["folders"],
    queryFn: getFolders,
    initialData: initialFolders,
    initialDataUpdatedAt: 0,
  })

  const documentsQuery = useQuery({
    queryKey: ["documents", filters],
    queryFn: () => getDocuments(filters),
    initialData: initialDocuments,
    initialDataUpdatedAt: 0,
    enabled: debouncedQuery.trim().length === 0,
  })

  const searchQuery = useQuery({
    queryKey: ["document-search", debouncedQuery, filters],
    queryFn: () => searchDocuments(debouncedQuery, filters, mode === "search" ? 50 : 24),
    initialData: initialSearchResults,
    initialDataUpdatedAt: 0,
    enabled: debouncedQuery.trim().length > 0,
  })

  const items: SearchableDocument[] = debouncedQuery.trim().length > 0 ? searchQuery.data ?? [] : documentsQuery.data ?? []
  const filteredFolders = (foldersQuery.data ?? []).filter(
    (folder) => !selectedProjectId || folder.project_id === selectedProjectId
  )
  const loading = debouncedQuery.trim().length > 0 ? searchQuery.isLoading : documentsQuery.isLoading
  const activeCount = items.length
  const resultLabel = debouncedQuery.trim().length > 0 ? "search results" : "documents"
  const pageTitle = mode === "search" ? "Search" : "Documents"
  const pageDescription =
    mode === "search"
      ? "Find anything in your indexed markdown library with fast, readable full-text search."
      : "Browse your library with filters that stay out of the way until you need them."

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        title={pageTitle}
        description={pageDescription}
        action={
          mode === "documents" ? (
            <Link href="/search" className={buttonVariants({ variant: "outline" })}>
              <Sparkles className="size-4" />
              Deep search
            </Link>
          ) : null
        }
      />

      <SectionPanel>
        <SectionPanelHeader>
          <SectionPanelTitle>Search and filters</SectionPanelTitle>
          <SectionPanelDescription>Start broad, then narrow by project, folder, tag, or status only when needed.</SectionPanelDescription>
        </SectionPanelHeader>
        <SectionPanelContent className="space-y-4">
          <SearchInput
            autoFocus={autoFocus}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, content, tag, or status"
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select
              value={selectedProjectId}
              onChange={(event) => {
                setSelectedProjectId(event.target.value)
                setSelectedFolderId("")
              }}
              className="h-11 rounded-2xl border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Filter by project"
            >
              <option value="">All projects</option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>

            <select
              value={selectedFolderId}
              onChange={(event) => setSelectedFolderId(event.target.value)}
              className="h-11 rounded-2xl border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Filter by folder"
            >
              <option value="">All folders</option>
              {filteredFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>

            <Input
              placeholder="Tag"
              value={selectedTag}
              onChange={(event) => setSelectedTag(event.target.value)}
              aria-label="Filter by tag"
            />

            <Input
              placeholder="Status"
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value)}
              aria-label="Filter by status"
            />

            <label className="flex h-11 items-center gap-3 rounded-2xl border border-input bg-background px-4 text-sm text-foreground">
              <input
                type="checkbox"
                checked={showOrphansOnly}
                onChange={(event) => setShowOrphansOnly(event.target.checked)}
                className="size-4 rounded border-input"
              />
              Orphans only
            </label>
          </div>
        </SectionPanelContent>
      </SectionPanel>

      <SectionPanel>
        <SectionPanelHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionPanelTitle>
              {activeCount} {resultLabel}
            </SectionPanelTitle>
            <SectionPanelDescription>
              {debouncedQuery.trim().length > 0
                ? `Showing matches for “${debouncedQuery.trim()}”.`
                : "Latest indexed documents across your library."}
            </SectionPanelDescription>
          </div>
        </SectionPanelHeader>
        <SectionPanelContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-[1.5rem] border border-border/70 bg-muted/50" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title={debouncedQuery.trim().length > 0 ? "No documents matched" : "No documents yet"}
              description={
                debouncedQuery.trim().length > 0
                  ? "Try fewer words, a title fragment, or filter less aggressively."
                  : "Once folders are indexed, your documents will appear here automatically."
              }
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <DocumentListItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </SectionPanelContent>
      </SectionPanel>
    </div>
  )
}
