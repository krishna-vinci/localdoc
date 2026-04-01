"use client"

import { FolderOpen, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  createFolder,
  deleteFolder,
  getFolders,
  getProjects,
  getWatchStatuses,
  reindexFolders,
  scanFolder,
  updateFolder,
} from "@/lib/api"
import type { Folder, Project, ScanSummary, WatchStatus } from "@/types"

export default function FoldersPage() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [watchStatuses, setWatchStatuses] = useState<Record<string, WatchStatus>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add folder dialog
  const [addOpen, setAddOpen] = useState(false)
  const [newPath, setNewPath] = useState("")
  const [newName, setNewName] = useState("")
  const [newProjectId, setNewProjectId] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [reindexing, setReindexing] = useState(false)

  // Scan state per folder
  const [scanning, setScanning] = useState<Record<string, boolean>>({})
  const [scanResult, setScanResult] = useState<Record<string, ScanSummary>>({})

  // Delete state
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [savingProject, setSavingProject] = useState<Record<string, boolean>>({})
  const [savingWatch, setSavingWatch] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [loadedFolders, loadedProjects, loadedWatchStatuses] = await Promise.all([
        getFolders(),
        getProjects(),
        getWatchStatuses(),
      ])
      setFolders(loadedFolders)
      setProjects(loadedProjects)
      setWatchStatuses(Object.fromEntries(loadedWatchStatuses.map((status) => [status.folder_id, status])))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load folders")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleAdd() {
    if (!newPath.trim() || !newName.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const folder = await createFolder({
        path: newPath.trim(),
        name: newName.trim(),
        project_id: newProjectId || null,
      })
      setFolders((prev) => [...prev, folder])
      setNewPath("")
      setNewName("")
      setNewProjectId("")
      setAddOpen(false)
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add folder")
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting((prev) => ({ ...prev, [id]: true }))
    try {
      await deleteFolder(id)
      setFolders((prev) => prev.filter((f) => f.id !== id))
    } catch {
      // ignore
    } finally {
      setDeleting((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function handleScan(id: string) {
    setScanning((prev) => ({ ...prev, [id]: true }))
    setScanResult((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    try {
      const result = await scanFolder(id)
      setScanResult((prev) => ({ ...prev, [id]: result }))
      const loadedWatchStatuses = await getWatchStatuses()
      setWatchStatuses(Object.fromEntries(loadedWatchStatuses.map((status) => [status.folder_id, status])))
    } catch {
      // ignore
    } finally {
      setScanning((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function handleProjectAssign(folderId: string, projectId: string) {
    setSavingProject((prev) => ({ ...prev, [folderId]: true }))
    try {
      const updatedFolder = await updateFolder(folderId, { project_id: projectId || "" })
      setFolders((prev) => prev.map((folder) => (folder.id === folderId ? updatedFolder : folder)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update folder project")
    } finally {
      setSavingProject((prev) => ({ ...prev, [folderId]: false }))
    }
  }

  async function handleWatchToggle(folder: Folder) {
    setSavingWatch((prev) => ({ ...prev, [folder.id]: true }))
    try {
      const updatedFolder = await updateFolder(folder.id, { watch_enabled: !folder.watch_enabled })
      setFolders((prev) => prev.map((item) => (item.id === folder.id ? updatedFolder : item)))
      const loadedWatchStatuses = await getWatchStatuses()
      setWatchStatuses(Object.fromEntries(loadedWatchStatuses.map((status) => [status.folder_id, status])))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update watch status")
    } finally {
      setSavingWatch((prev) => ({ ...prev, [folder.id]: false }))
    }
  }

  async function handleReindexAll() {
    setReindexing(true)
    setError(null)
    try {
      await reindexFolders()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reindex folders")
    } finally {
      setReindexing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Folders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage indexed folder paths on this device
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void handleReindexAll()} disabled={reindexing}>
            {reindexing && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            Reindex All
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="size-4 mr-1.5" />
                  Add Folder
                </Button>
              }
            />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Folder path</label>
                <Input
                  placeholder="/home/user/notes"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Display name</label>
                <Input
                  placeholder="My Notes"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAdd()
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Project</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              {addError && (
                <p className="text-sm text-destructive">{addError}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <DialogClose onClick={() => { setAddError(null); setNewPath(""); setNewName(""); setNewProjectId("") }}>
                  Cancel
                </DialogClose>
                <Button onClick={handleAdd} disabled={adding || !newPath.trim() || !newName.trim()}>
                  {adding && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                  Add
                </Button>
              </div>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : folders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <FolderOpen className="mx-auto mb-3 size-8 opacity-40" />
          <p className="text-sm">No folders added yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {folders.map((folder) => (
            <Card key={folder.id}>
              <CardContent className="flex items-center justify-between py-4 px-5">
                <div className="flex items-center gap-3 min-w-0">
                  <FolderOpen className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{folder.name}</p>
                      <Badge variant={folder.is_active ? "default" : "secondary"}>
                        {folder.is_active ? "active" : "inactive"}
                      </Badge>
                      <Badge variant={folder.watch_enabled ? "secondary" : "outline"}>
                        {folder.watch_enabled ? "watching" : "manual"}
                      </Badge>
                      {folder.project_name && <Badge variant="outline">{folder.project_name}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{folder.path}</p>
                    {scanResult[folder.id] && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last scan: {scanResult[folder.id].indexed} indexed,{" "}
                        {scanResult[folder.id].skipped} skipped,{" "}
                        {scanResult[folder.id].errors} errors
                      </p>
                    )}
                    {watchStatuses[folder.id]?.last_scan_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Watcher last scanned {new Date(watchStatuses[folder.id].last_scan_at as string).toLocaleString()}
                      </p>
                    )}
                    {watchStatuses[folder.id]?.last_error && (
                      <p className="text-xs text-destructive mt-1">{watchStatuses[folder.id].last_error}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <select
                    value={folder.project_id ?? ""}
                    onChange={(e) => void handleProjectAssign(folder.id, e.target.value)}
                    disabled={savingProject[folder.id]}
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">No project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleWatchToggle(folder)}
                    disabled={savingWatch[folder.id]}
                  >
                    {savingWatch[folder.id] ? <Loader2 className="size-3.5 animate-spin" /> : folder.watch_enabled ? "Disable Watch" : "Enable Watch"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleScan(folder.id)}
                    disabled={scanning[folder.id]}
                  >
                    {scanning[folder.id] ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    ) : (
                      <RefreshCw className="size-3.5 mr-1.5" />
                    )}
                    Scan
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDelete(folder.id)}
                    disabled={deleting[folder.id]}
                    aria-label={`Delete ${folder.name}`}
                  >
                    {deleting[folder.id] ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
