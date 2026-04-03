"use client"

import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  FileClock,
  FileText,
  History,
  Link2,
  ListChecks,
  Loader2,
  PanelRight,
  PencilLine,
  Pin,
  PinOff,
  RefreshCw,
  Save,
  ScanSearch,
  X,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { AppAlert } from "@/components/shared/app-alert"
import { StatusDot } from "@/components/shared/status-dot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  getDocument,
  getDocumentAudit,
  getDocumentVersion,
  getDocumentVersions,
  rebuildFolder,
  restoreDocumentVersion,
  saveDocument,
  scanFolder,
} from "@/lib/api"
import { formatRelativeTime, formatTimestamp } from "@/lib/format"
import { confirmUnsafeNavigation, useUnsavedChangesWarning } from "@/lib/navigation-guard"
import { recordLastRead, togglePinnedDocument, useReaderState } from "@/lib/reader-state"
import { cn } from "@/lib/utils"
import type { Document, DocumentVersionDetail, DocumentVersionSummary, DocumentWriteEvent } from "@/types"

import { MarkdownRenderer } from "./markdown-renderer"

function parseJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}

function stripFrontmatter(rawContent: string): string {
  return rawContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
}

type WorkspaceMode = "edit" | "preview"
type InspectorTab = "outline" | "metadata" | "links" | "tasks" | "history"

export function DocumentWorkspace({ initialDocument }: { initialDocument: Document }) {
  const [document, setDocument] = useState(initialDocument)
  const [lastReadSnapshot] = useState(() => ({
    id: initialDocument.id,
    title: initialDocument.title,
    file_name: initialDocument.file_name,
    folder_name: initialDocument.folder_name,
    project_name: initialDocument.project_name,
    updated_at: initialDocument.updated_at,
  }))
  const [editorValue, setEditorValue] = useState(initialDocument.raw_content)
  const [mode, setMode] = useState<WorkspaceMode>("preview")
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("outline")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const [rebuildingFolder, setRebuildingFolder] = useState(false)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([])
  const [auditEvents, setAuditEvents] = useState<DocumentWriteEvent[]>([])
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersionDetail | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [versionLoadingId, setVersionLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const readerState = useReaderState()

  useEffect(() => {
    recordLastRead(lastReadSnapshot)
  }, [lastReadSnapshot])

  const tags = useMemo(
    () =>
      document.tags
        ? document.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    [document.tags]
  )
  const headings = useMemo(() => parseJsonArray(document.headings), [document.headings])
  const links = useMemo(() => parseJsonArray(document.links), [document.links])
  const tasks = useMemo(() => parseJsonArray(document.tasks), [document.tasks])
  const dirty = editorValue !== document.raw_content
  const expectedHash = document.disk_content_hash ?? document.content_hash
  const pinned = readerState.pinned.some((item) => item.id === document.id)

  useUnsavedChangesWarning(dirty)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const [loadedVersions, loadedAudit] = await Promise.all([
        getDocumentVersions(document.id),
        getDocumentAudit(document.id),
      ])
      setVersions(loadedVersions)
      setAuditEvents(loadedAudit)
      if (loadedVersions.length > 0) {
        const version = await getDocumentVersion(document.id, loadedVersions[0].id)
        setSelectedVersion(version)
      } else {
        setSelectedVersion(null)
      }
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Failed to load history")
    } finally {
      setHistoryLoading(false)
    }
  }, [document.id])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  async function handleReload() {
    setReloading(true)
    setError(null)
    setNotice(null)
    try {
      const refreshed = await getDocument(document.id)
      setDocument(refreshed)
      setEditorValue(refreshed.raw_content)
      setMessage("")
      setNotice("Reloaded from disk")
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "Failed to reload document")
    } finally {
      setReloading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await saveDocument(document.id, {
        raw_content: editorValue,
        expected_content_hash: expectedHash,
        message: message.trim() || null,
      })
      setDocument(updated)
      setEditorValue(updated.raw_content)
      setMessage("")
      setNotice("Saved to disk")
      await loadHistory()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save document")
    } finally {
      setSaving(false)
    }
  }

  async function handleRescanFolder() {
    setRescanning(true)
    setError(null)
    setNotice(null)
    try {
      await scanFolder(document.folder_id)
      await handleReload()
      setNotice("Folder rescanned")
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Failed to rescan folder")
    } finally {
      setRescanning(false)
    }
  }

  async function handleRebuildFolder() {
    setRebuildingFolder(true)
    setError(null)
    setNotice(null)
    try {
      await rebuildFolder(document.folder_id)
      setNotice("Queued folder rebuild. Follow progress in Manage → Operations.")
    } catch (rebuildError) {
      setError(rebuildError instanceof Error ? rebuildError.message : "Failed to queue folder rebuild")
    } finally {
      setRebuildingFolder(false)
    }
  }

  async function handleSelectVersion(versionId: string) {
    setVersionLoadingId(versionId)
    setError(null)
    try {
      setSelectedVersion(await getDocumentVersion(document.id, versionId))
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "Failed to load version")
    } finally {
      setVersionLoadingId(null)
    }
  }

  async function handleRestore(version: DocumentVersionSummary) {
    const confirmed = window.confirm(`Restore version ${version.version_number}?`)
    if (!confirmed) return

    setRestoringVersionId(version.id)
    setError(null)
    setNotice(null)
    try {
      const restored = await restoreDocumentVersion(document.id, version.id, {
        expected_content_hash: expectedHash,
        message: message.trim() || `Restored version ${version.version_number}`,
      })
      setDocument(restored)
      setEditorValue(restored.raw_content)
      setMessage("")
      setNotice(`Restored version ${version.version_number}`)
      await loadHistory()
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore version")
    } finally {
      setRestoringVersionId(null)
    }
  }

  const inspectorTabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "outline", label: "Outline" },
    { id: "metadata", label: "Info" },
    { id: "links", label: "Links" },
    { id: "tasks", label: "Tasks" },
    { id: "history", label: "History" },
  ]

  return (
    <div className="flex h-full min-h-[calc(100vh-3.5rem)] flex-col lg:min-h-[calc(100vh-4rem)]">
      <div className="border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Link
                href="/documents"
                onClick={(event) => {
                  if (!confirmUnsafeNavigation()) {
                    event.preventDefault()
                  }
                }}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <ArrowLeft className="size-4" />
                Library
              </Link>
              <span>•</span>
              <span>{document.project_name ?? "No project"}</span>
              <span>•</span>
              <span>{document.folder_name ?? "No folder"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-2xl font-semibold tracking-tight sm:text-3xl">{document.title}</h1>
              <Badge variant="secondary">{document.source_type === "remote_mirror" ? "Remote mirror" : "Local"}</Badge>
              {document.is_read_only ? <Badge variant="outline">Read-only</Badge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusDot
                tone={
                  !document.file_exists
                    ? "danger"
                    : document.has_unindexed_changes
                      ? "warning"
                      : dirty
                        ? "info"
                        : "success"
                }
                label={
                  !document.file_exists
                    ? "Missing on disk"
                    : document.has_unindexed_changes
                      ? "Changed outside app"
                      : dirty
                        ? "Unsaved"
                        : "Saved"
                }
              />
              {tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                togglePinnedDocument(document)
              }}
            >
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {pinned ? "Unpin" : "Pin"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setInspectorOpen((current) => !current)}>
              <PanelRight className="size-4" />
              {inspectorOpen ? "Hide sidebar" : "Show sidebar"}
            </Button>
            <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-muted/40 p-1">
              <Button variant={mode === "preview" ? "secondary" : "ghost"} size="sm" onClick={() => setMode("preview")}>
                <Eye className="size-4" />
                Read
              </Button>
              <Button variant={mode === "edit" ? "secondary" : "ghost"} size="sm" onClick={() => setMode("edit")}>
                <PencilLine className="size-4" />
                Edit
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void handleReload()} disabled={reloading}>
              {reloading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Reload
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 sm:px-6">
        <div className="space-y-3">
          {!document.file_exists ? (
            <AppAlert variant="error">The source file is missing on disk. Reload or reindex before editing.</AppAlert>
          ) : null}
          {document.has_unindexed_changes && document.file_exists ? (
            <AppAlert variant="warning">The file changed on disk outside the app. Reload before saving so you do not overwrite newer content.</AppAlert>
          ) : null}
          {document.is_read_only ? (
            <AppAlert>This document comes from a mirrored remote device share. Editing is disabled here.</AppAlert>
          ) : null}
          {error ? <AppAlert variant="error">{error}</AppAlert> : null}
          {notice ? <AppAlert variant="success">{notice}</AppAlert> : null}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 px-4 pb-4 pt-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className={cn("mx-auto h-full", mode === "preview" ? "max-w-4xl" : "max-w-5xl")}> 
            {mode === "edit" ? (
              <div className="flex h-full flex-col gap-4">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">Save note</span>
                  <Input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="What changed?"
                  />
                </label>
                <Textarea
                  value={editorValue}
                  onChange={(event) => setEditorValue(event.target.value)}
                  className="min-h-[65vh] flex-1 rounded-[1.75rem] border-border/80 bg-background px-5 py-5 font-mono text-[0.95rem] leading-7 shadow-sm"
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-border/70 bg-card/80 px-4 py-3 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-3">
                    <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
                    <span>Updated {formatTimestamp(document.updated_at)}</span>
                    <span>{(document.size_bytes / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(document.has_unindexed_changes || !document.file_exists) && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => void handleRescanFolder()} disabled={rescanning}>
                          {rescanning ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
                          Rescan
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void handleRebuildFolder()} disabled={rebuildingFolder}>
                          {rebuildingFolder ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
                          Rebuild
                        </Button>
                      </>
                    )}
                    <Button onClick={() => void handleSave()} disabled={document.is_read_only || !document.file_exists || !dirty || saving}>
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[2rem] border border-border/70 bg-card/70 px-6 py-6 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.35)] sm:px-10 sm:py-10 lg:px-14 lg:py-12">
                <div className="mb-8 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{document.file_name}</span>
                  <span>•</span>
                  <span>{formatRelativeTime(document.updated_at)}</span>
                  <span>•</span>
                  <span>{(document.size_bytes / 1024).toFixed(1)} KB</span>
                </div>
                <MarkdownRenderer content={stripFrontmatter(editorValue)} />
              </div>
            )}
          </div>
        </div>

        {inspectorOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 bg-black/25 xl:hidden"
              aria-label="Close inspector"
              onClick={() => setInspectorOpen(false)}
            />
            <aside className="fixed inset-y-14 right-0 z-40 w-full max-w-sm border-l border-border/70 bg-background/96 shadow-2xl backdrop-blur sm:inset-y-16 xl:static xl:ml-6 xl:block xl:w-[22rem] xl:max-w-none xl:rounded-[1.75rem] xl:border xl:shadow-none">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-border/70 px-4 py-4">
                  <div>
                    <p className="text-sm font-semibold">Right sidebar</p>
                    <p className="text-xs text-muted-foreground">Outline, metadata, links, tasks, and history.</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setInspectorOpen(false)}>
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1 border-b border-border/70 p-2">
                  {inspectorTabs.map((tab) => (
                    <Button
                      key={tab.id}
                      variant={inspectorTab === tab.id ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setInspectorTab(tab.id)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {inspectorTab === "outline" ? (
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Outline</p>
                      {headings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No headings extracted.</p>
                      ) : (
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {headings.map((heading, index) => (
                            <li key={`${heading}-${index}`} className="flex items-start gap-2 rounded-xl bg-muted/35 px-3 py-2">
                              <FileText className="mt-0.5 size-3.5 shrink-0" />
                              <span>{heading}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}

                  {inspectorTab === "metadata" ? (
                    <div className="space-y-4 text-sm">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Document info</p>
                      <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-muted-foreground">
                        <div className="space-y-2">
                          <p>{document.file_name}</p>
                          <p className="break-all">{document.file_path}</p>
                          {document.source_path ? <p className="break-all">Source {document.source_path}</p> : null}
                          <p>Updated {formatTimestamp(document.updated_at)}</p>
                          <p>Indexed {formatTimestamp(document.indexed_at)}</p>
                          <p>Version {document.version_counter}</p>
                        </div>
                      </div>
                      {tags.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Tags</p>
                          <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                              <Badge key={tag} variant="outline">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {inspectorTab === "links" ? (
                    <div className="space-y-3">
                      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        <Link2 className="size-3.5" />
                        Links
                      </p>
                      {links.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No links extracted.</p>
                      ) : (
                        <ul className="space-y-2 break-all text-sm text-muted-foreground">
                          {links.map((link, index) => (
                            <li key={`${link}-${index}`} className="rounded-xl bg-muted/35 px-3 py-2">
                              {link}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}

                  {inspectorTab === "tasks" ? (
                    <div className="space-y-3">
                      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        <ListChecks className="size-3.5" />
                        Tasks ({document.task_count})
                      </p>
                      {tasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No tasks extracted.</p>
                      ) : (
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {tasks.map((task, index) => (
                            <li key={`${task}-${index}`} className="rounded-xl bg-muted/35 px-3 py-2">
                              {task}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}

                  {inspectorTab === "history" ? (
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          <History className="size-3.5" />
                          Versions
                        </p>
                        {historyLoading ? (
                          <p className="text-sm text-muted-foreground">Loading history…</p>
                        ) : versions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No saved versions yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {versions.map((version) => (
                              <div key={version.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <button type="button" onClick={() => void handleSelectVersion(version.id)} className="min-w-0 text-left">
                                    <p className="text-sm font-medium">v{version.version_number}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {version.change_type} · {formatRelativeTime(version.created_at)}
                                    </p>
                                  </button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void handleRestore(version)}
                                    disabled={document.is_read_only || restoringVersionId === version.id || !document.file_exists}
                                  >
                                    {restoringVersionId === version.id ? <Loader2 className="size-3.5 animate-spin" /> : "Restore"}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                        <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <FileClock className="size-4" />
                          Selected snapshot
                        </p>
                        {versionLoadingId ? (
                          <p className="text-sm text-muted-foreground">Loading version…</p>
                        ) : selectedVersion ? (
                          <>
                            <p className="mb-2 text-xs text-muted-foreground">
                              v{selectedVersion.version_number} · {selectedVersion.change_type}
                            </p>
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-background p-3 text-xs text-muted-foreground">
                              {selectedVersion.content}
                            </pre>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Pick a version to inspect it.</p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          <AlertTriangle className="size-3.5" />
                          Write audit
                        </p>
                        {historyLoading ? (
                          <p className="text-sm text-muted-foreground">Loading audit…</p>
                        ) : auditEvents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No writes recorded yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {auditEvents.map((event) => (
                              <div key={event.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium capitalize">{event.action}</p>
                                  <span className="text-xs text-muted-foreground">{formatRelativeTime(event.created_at)}</span>
                                </div>
                                {event.message ? <p className="mt-1 text-sm text-muted-foreground">{event.message}</p> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </div>
  )
}
