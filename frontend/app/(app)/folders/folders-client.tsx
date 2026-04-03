"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderOpen, Loader2, Plus, RefreshCw, ScanSearch, Trash2, WandSparkles } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { AppAlert } from "@/components/shared/app-alert"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import {
  SectionPanel,
  SectionPanelContent,
  SectionPanelDescription,
  SectionPanelHeader,
  SectionPanelTitle,
} from "@/components/shared/section-panel"
import { StatusDot } from "@/components/shared/status-dot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  createFolder,
  deleteFolder,
  getFolders,
  getProjects,
  getWatchStatuses,
  rebuildAllFolders,
  rebuildFolder,
  reindexFolders,
  scanFolder,
  updateFolder,
} from "@/lib/api"
import { formatRelativeTime, formatTimestamp } from "@/lib/format"
import type { Folder, Project, WatchStatus } from "@/types"

function watchTone(watchState?: string | null) {
  if (!watchState) return "neutral"
  if (watchState === "degraded") return "warning"
  if (watchState === "failed") return "danger"
  if (watchState === "watching" || watchState === "healthy" || watchState === "idle") return "success"
  return "neutral"
}

export function FoldersClient({
  initialFolders,
  initialProjects,
  initialWatchStatuses,
}: {
  initialFolders: Folder[]
  initialProjects: Project[]
  initialWatchStatuses: WatchStatus[]
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState("")
  const [name, setName] = useState("")
  const [projectId, setProjectId] = useState("")

  const foldersQuery = useQuery({
    queryKey: ["folders"],
    queryFn: getFolders,
    initialData: initialFolders,
    initialDataUpdatedAt: 0,
  })

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
    initialData: initialProjects,
    initialDataUpdatedAt: 0,
  })

  const watchQuery = useQuery({
    queryKey: ["watch-statuses"],
    queryFn: getWatchStatuses,
    initialData: initialWatchStatuses,
    initialDataUpdatedAt: 0,
    refetchInterval: 30_000,
  })

  const watchMap = useMemo(
    () => Object.fromEntries((watchQuery.data ?? []).map((status) => [status.folder_id, status])),
    [watchQuery.data]
  )

  async function refreshFolderQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["folders"] }),
      queryClient.invalidateQueries({ queryKey: ["watch-statuses"] }),
    ])
  }

  const createMutation = useMutation({
    mutationFn: createFolder,
    onSuccess: async () => {
      await refreshFolderQueries()
      setOpen(false)
      setPath("")
      setName("")
      setProjectId("")
      toast.success("Folder added")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to add folder"),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: async () => {
      await refreshFolderQueries()
      toast.success("Folder removed")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete folder"),
  })

  const scanMutation = useMutation({
    mutationFn: scanFolder,
    onSuccess: async (result) => {
      await refreshFolderQueries()
      toast.success(`Scan complete: ${result.indexed} indexed, ${result.errors} errors`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to scan folder"),
  })

  const reindexMutation = useMutation({
    mutationFn: reindexFolders,
    onSuccess: async (result) => {
      await refreshFolderQueries()
      toast.success(`Reindexed ${result.folders} folders`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to reindex folders"),
  })

  const rebuildAllMutation = useMutation({
    mutationFn: rebuildAllFolders,
    onSuccess: async (job) => {
      await refreshFolderQueries()
      toast.success(`Queued rebuild job ${job.id}`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to queue rebuild"),
  })

  const rebuildMutation = useMutation({
    mutationFn: rebuildFolder,
    onSuccess: async (job) => {
      await refreshFolderQueries()
      toast.success(`Queued folder rebuild ${job.id}`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to rebuild folder"),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateFolder>[1] }) => updateFolder(id, data),
    onSuccess: async () => {
      await refreshFolderQueries()
      toast.success("Folder updated")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update folder"),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sources"
        title="Folders"
        description="Control what gets indexed, what keeps watching for changes, and where maintenance actions should start."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => reindexMutation.mutate()} disabled={reindexMutation.isPending}>
              {reindexMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
              Reindex all
            </Button>
            <Button variant="outline" onClick={() => rebuildAllMutation.mutate()} disabled={rebuildAllMutation.isPending}>
              {rebuildAllMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
              Queue rebuild
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <Button>
                    <Plus className="size-4" />
                    Add folder
                  </Button>
                }
              />
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Add folder</DialogTitle>
                  <DialogDescription>Point LocalDocs at a directory on this machine and optionally connect it to a project.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <label className="space-y-2">
                    <span className="text-sm font-medium">Folder path</span>
                    <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/home/user/notes" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium">Display name</span>
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Personal notes" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium">Project</span>
                    <select
                      value={projectId}
                      onChange={(event) => setProjectId(event.target.value)}
                      className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">No project</option>
                      {(projectsQuery.data ?? []).map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <DialogClose>Cancel</DialogClose>
                  <Button
                    disabled={createMutation.isPending || !path.trim() || !name.trim()}
                    onClick={() =>
                      createMutation.mutate({
                        path: path.trim(),
                        name: name.trim(),
                        project_id: projectId || null,
                      })
                    }
                  >
                    {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Add folder
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {foldersQuery.isError ? (
        <AppAlert variant="error">{foldersQuery.error instanceof Error ? foldersQuery.error.message : "Failed to load folders"}</AppAlert>
      ) : null}

      <SectionPanel>
        <SectionPanelHeader>
          <SectionPanelTitle>Indexed sources</SectionPanelTitle>
          <SectionPanelDescription>Most of the time you only need the path, project, watch state, and a few precise actions.</SectionPanelDescription>
        </SectionPanelHeader>
        <SectionPanelContent>
          {foldersQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-[1.5rem] border border-border/70 bg-muted/40" />
              ))}
            </div>
          ) : (foldersQuery.data ?? []).length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="No folders added"
              description="Add a source folder and LocalDocs will index its markdown files into your library."
            />
          ) : (
            <div className="space-y-3">
              {(foldersQuery.data ?? []).map((folder) => {
                const watchStatus = watchMap[folder.id]
                const busy =
                  createMutation.isPending ||
                  deleteMutation.isPending ||
                  scanMutation.variables === folder.id ||
                  rebuildMutation.variables === folder.id

                return (
                  <div key={folder.id} className="rounded-[1.5rem] border border-border/70 bg-background/80 px-5 py-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold tracking-tight">{folder.name}</h3>
                          <Badge variant={folder.is_active ? "secondary" : "outline"}>{folder.is_active ? "Active" : "Inactive"}</Badge>
                          <Badge variant="outline">{folder.source_type === "remote_mirror" ? "Remote mirror" : "Local"}</Badge>
                          {folder.is_read_only ? <Badge variant="outline">Read-only</Badge> : null}
                        </div>

                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p className="truncate">{folder.path}</p>
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <StatusDot tone={watchTone(watchStatus?.watch_state)} label={watchStatus?.watch_state ?? (folder.watch_enabled ? "watching" : "manual")} />
                            <span>{folder.project_name ?? "No project"}</span>
                            {watchStatus?.last_scan_at ? <span>Last scan {formatRelativeTime(watchStatus.last_scan_at)}</span> : null}
                            {watchStatus?.availability_state ? <span>{watchStatus.availability_state}</span> : null}
                          </div>
                        </div>

                        {watchStatus?.last_error ? <AppAlert variant="warning">{watchStatus.last_error}</AppAlert> : null}
                      </div>

                      <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[22rem]">
                        <select
                          value={folder.project_id ?? ""}
                          onChange={(event) => updateMutation.mutate({ id: folder.id, data: { project_id: event.target.value || null } })}
                          className="h-11 rounded-2xl border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          aria-label={`Assign project for ${folder.name}`}
                        >
                          <option value="">No project</option>
                          {(projectsQuery.data ?? []).map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
                          <Button
                            variant="outline"
                            onClick={() => updateMutation.mutate({ id: folder.id, data: { watch_enabled: !folder.watch_enabled } })}
                            disabled={folder.is_read_only || updateMutation.isPending}
                          >
                            {folder.watch_enabled ? "Disable watch" : "Enable watch"}
                          </Button>
                          <Button variant="outline" onClick={() => scanMutation.mutate(folder.id)} disabled={folder.is_read_only || busy}>
                            {scanMutation.variables === folder.id && scanMutation.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <RefreshCw className="size-4" />
                            )}
                            Scan
                          </Button>
                          <Button variant="outline" onClick={() => rebuildMutation.mutate(folder.id)} disabled={rebuildMutation.isPending && rebuildMutation.variables === folder.id}>
                            {rebuildMutation.variables === folder.id && rebuildMutation.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <WandSparkles className="size-4" />
                            )}
                            Rebuild
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              if (window.confirm(`Delete folder “${folder.name}”?`)) {
                                deleteMutation.mutate(folder.id)
                              }
                            }}
                            disabled={folder.is_read_only || deleteMutation.isPending}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        </div>

                        {watchStatus?.last_checked_at ? (
                          <p className="text-xs text-muted-foreground">Checked {formatTimestamp(watchStatus.last_checked_at)}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionPanelContent>
      </SectionPanel>
    </div>
  )
}
