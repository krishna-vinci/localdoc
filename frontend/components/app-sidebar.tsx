"use client"

import { useQuery } from "@tanstack/react-query"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers3,
  Settings2,
  Sparkles,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"

import { StatusDot } from "@/components/shared/status-dot"
import { Button } from "@/components/ui/button"
import { getDocuments, getFolders, getProjects } from "@/lib/api"
import { formatRelativeTime } from "@/lib/format"
import { confirmUnsafeNavigation } from "@/lib/navigation-guard"
import { useReaderState } from "@/lib/reader-state"
import { cn } from "@/lib/utils"
import type { DocumentListItem, Folder, Project } from "@/types"

interface AppSidebarProps {
  collapsed?: boolean
  mobile?: boolean
  onNavigate?: () => void
  onToggle?: () => void
}

interface ProjectTreeGroup {
  key: string
  label: string
  projectId: string | null
  folders: Array<{
    folder: Folder
    documents: DocumentListItem[]
  }>
}

function groupDocumentsIntoProjects(
  projects: Project[],
  folders: Folder[],
  documents: DocumentListItem[]
): ProjectTreeGroup[] {
  const documentsByFolder = new Map<string, DocumentListItem[]>()

  for (const document of documents) {
    const folderDocuments = documentsByFolder.get(document.folder_id) ?? []
    folderDocuments.push(document)
    documentsByFolder.set(document.folder_id, folderDocuments)
  }

  const groups: ProjectTreeGroup[] = projects
    .map((project) => ({
      key: project.id,
      label: project.name,
      projectId: project.id,
      folders: folders
        .filter((folder) => folder.project_id === project.id)
        .map((folder) => ({
          folder,
          documents: (documentsByFolder.get(folder.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
        }))
        .filter(({ documents }) => documents.length > 0),
    }))
    .filter(({ folders }) => folders.length > 0)

  const looseFolders = folders
    .filter((folder) => !folder.project_id)
    .map((folder) => ({
      folder,
      documents: (documentsByFolder.get(folder.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .filter(({ documents }) => documents.length > 0)

  if (looseFolders.length > 0) {
    groups.push({
      key: "loose-notes",
      label: "Loose notes",
      projectId: null,
      folders: looseFolders,
    })
  }

  return groups
}

function SidebarDocLink({
  href,
  title,
  meta,
  compact,
  active,
  onNavigate,
}: {
  href: string
  title: string
  meta?: string
  compact: boolean
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={(event) => {
        if (!confirmUnsafeNavigation()) {
          event.preventDefault()
          return
        }
        onNavigate?.()
      }}
      title={compact ? title : undefined}
      className={cn(
        "group flex items-center rounded-xl text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
        compact ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
        active && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/50 text-sidebar-foreground/65 group-hover:text-sidebar-accent-foreground">
        <FileText className="size-3.5" />
      </span>
      {!compact ? (
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          {meta ? <span className="block truncate text-xs text-sidebar-foreground/55">{meta}</span> : null}
        </span>
      ) : null}
    </Link>
  )
}

export function AppSidebar({
  collapsed = false,
  mobile = false,
  onNavigate,
  onToggle,
}: AppSidebarProps) {
  const pathname = usePathname()
  const compact = collapsed && !mobile
  const readerState = useReaderState()
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})

  const projectsQuery = useQuery({
    queryKey: ["sidebar-projects"],
    queryFn: getProjects,
  })
  const foldersQuery = useQuery({
    queryKey: ["sidebar-folders"],
    queryFn: getFolders,
  })
  const documentsQuery = useQuery({
    queryKey: ["sidebar-documents"],
    queryFn: () => getDocuments({ limit: 500 }),
  })

  const projectGroups = useMemo(
    () =>
      groupDocumentsIntoProjects(
        projectsQuery.data ?? [],
        foldersQuery.data ?? [],
        documentsQuery.data ?? []
      ),
    [documentsQuery.data, foldersQuery.data, projectsQuery.data]
  )
  const currentDocumentId = pathname.startsWith("/documents/") ? pathname.replace("/documents/", "") : null
  const recentDocuments = readerState.recent.slice(0, 5)
  const pinnedDocuments = readerState.pinned.slice(0, 5)

  function toggleProject(key: string) {
    setExpandedProjects((current) => ({ ...current, [key]: !current[key] }))
  }

  function toggleFolder(key: string) {
    setExpandedFolders((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur transition-[width] duration-200",
        compact ? "w-[5.5rem]" : "w-[21rem]",
        mobile && "h-dvh w-full"
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-sidebar-border/70", compact ? "justify-center px-3" : "px-4")}>
        {compact ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <FileText className="size-4" />
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Expand sidebar">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <FileText className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sidebar-foreground">LocalDocs Hub</p>
                <p className="text-xs text-sidebar-foreground/65">Read your markdown library</p>
              </div>
            </div>
            {!mobile ? (
              <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse sidebar">
                <ChevronLeft className="size-4" />
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div className={cn("border-b border-sidebar-border/70 px-3 py-4", compact && "px-2")}>
        {!compact ? <StatusDot tone="success" label="Reading library ready" /> : <div className="flex justify-center"><span className="size-2 rounded-full bg-emerald-500" /></div>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          <section className="space-y-2">
            {!compact ? <p className="px-3 text-xs font-medium uppercase tracking-[0.16em] text-sidebar-foreground/50">Recent</p> : null}
            <div className="space-y-1">
              {recentDocuments.length === 0 ? (
                !compact ? <p className="px-3 text-xs text-sidebar-foreground/45">Open a note to build your trail.</p> : null
              ) : (
                recentDocuments.map((document) => (
                  <SidebarDocLink
                    key={document.id}
                    href={`/documents/${document.id}`}
                    title={document.title}
                    meta={compact ? undefined : document.project_name ?? document.folder_name ?? formatRelativeTime(document.updated_at)}
                    compact={compact}
                    active={pathname === `/documents/${document.id}`}
                    onNavigate={onNavigate}
                  />
                ))
              )}
            </div>
          </section>

          <section className="space-y-2">
            {!compact ? <p className="px-3 text-xs font-medium uppercase tracking-[0.16em] text-sidebar-foreground/50">Pinned</p> : null}
            <div className="space-y-1">
              {pinnedDocuments.length === 0 ? (
                !compact ? <p className="px-3 text-xs text-sidebar-foreground/45">Pin notes you revisit often.</p> : null
              ) : (
                pinnedDocuments.map((document) => (
                  <SidebarDocLink
                    key={document.id}
                    href={`/documents/${document.id}`}
                    title={document.title}
                    meta={compact ? undefined : document.project_name ?? document.folder_name ?? "Pinned note"}
                    compact={compact}
                    active={pathname === `/documents/${document.id}`}
                    onNavigate={onNavigate}
                  />
                ))
              )}
            </div>
          </section>

          <section className="space-y-2">
            {!compact ? <p className="px-3 text-xs font-medium uppercase tracking-[0.16em] text-sidebar-foreground/50">Projects</p> : null}
            {projectsQuery.isLoading || foldersQuery.isLoading || documentsQuery.isLoading ? (
              !compact ? <p className="px-3 text-xs text-sidebar-foreground/45">Loading project trees…</p> : null
            ) : projectsQuery.isError || foldersQuery.isError || documentsQuery.isError ? (
              !compact ? <p className="px-3 text-xs text-sidebar-foreground/45">Could not load project trees right now.</p> : null
            ) : projectGroups.length === 0 ? (
              !compact ? <p className="px-3 text-xs text-sidebar-foreground/45">Projects appear here as reading trees.</p> : null
            ) : (
              <div className="space-y-2">
                {projectGroups.map((group) => {
                  const projectOpen = expandedProjects[group.key] ?? true

                  return (
                    <div key={group.key} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => toggleProject(group.key)}
                        className={cn(
                          "flex w-full items-center rounded-xl text-left text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                          compact ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                        )}
                        title={compact ? group.label : undefined}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/50">
                          {group.projectId ? <Layers3 className="size-3.5" /> : <Sparkles className="size-3.5" />}
                        </span>
                        {!compact ? (
                          <>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.label}</span>
                            <ChevronDown className={cn("size-4 transition-transform", projectOpen ? "rotate-0" : "-rotate-90")} />
                          </>
                        ) : null}
                      </button>

                      {!compact && projectOpen ? (
                        <div className="space-y-1 border-l border-sidebar-border/60 pl-3 ml-4">
                          {group.folders.map(({ folder, documents }) => {
                            const folderOpen =
                              expandedFolders[folder.id] ??
                              (documents.some((document) => document.id === currentDocumentId) || documents.length <= 6)

                            return (
                              <div key={folder.id} className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => toggleFolder(folder.id)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                                >
                                  <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", folderOpen ? "rotate-0" : "-rotate-90")} />
                                  <span className="truncate text-sm">{folder.name}</span>
                                  <span className="ml-auto text-[10px] text-sidebar-foreground/45">{documents.length}</span>
                                </button>
                                {folderOpen ? (
                                  <div className="space-y-1 pl-3">
                                    {documents.map((document) => (
                                      <SidebarDocLink
                                        key={document.id}
                                        href={`/documents/${document.id}`}
                                        title={document.title}
                                        meta={undefined}
                                        compact={false}
                                        active={pathname === `/documents/${document.id}`}
                                        onNavigate={onNavigate}
                                      />
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className={cn("border-t border-sidebar-border/70 p-3", compact && "p-2")}>
        <Link
          href="/manage/folders"
          onClick={(event) => {
            if (!confirmUnsafeNavigation()) {
              event.preventDefault()
              return
            }
            onNavigate?.()
          }}
          className={cn(
            "group flex items-center rounded-2xl border border-sidebar-border/70 bg-background/45 text-sidebar-foreground/80 transition-colors hover:bg-background/70",
            compact ? "justify-center px-2 py-3" : "gap-3 px-3 py-3"
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground">
            <Settings2 className="size-4" />
          </span>
          {!compact ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">Manage</span>
              <span className="block truncate text-xs text-sidebar-foreground/55">Sources, devices, projects, operations</span>
            </span>
          ) : null}
        </Link>
      </div>
    </aside>
  )
}
