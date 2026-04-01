"use client"

import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  FileClock,
  FileText,
  History,
  Loader2,
  PencilLine,
  RefreshCw,
  Save,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getDocument,
  getDocumentAudit,
  getDocumentVersion,
  getDocumentVersions,
  restoreDocumentVersion,
  saveDocument,
} from "@/lib/api"
import { formatTimestamp } from "@/lib/format"
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

export function DocumentWorkspace({ initialDocument }: { initialDocument: Document }) {
  const [document, setDocument] = useState(initialDocument)
  const [editorValue, setEditorValue] = useState(initialDocument.raw_content)
  const [mode, setMode] = useState<WorkspaceMode>("edit")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([])
  const [auditEvents, setAuditEvents] = useState<DocumentWriteEvent[]>([])
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersionDetail | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [versionLoadingId, setVersionLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    try {
      const refreshed = await getDocument(document.id)
      setDocument(refreshed)
      setEditorValue(refreshed.raw_content)
      setMessage("")
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "Failed to reload document")
    } finally {
      setReloading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const updated = await saveDocument(document.id, {
        raw_content: editorValue,
        expected_content_hash: expectedHash,
        message: message.trim() || null,
      })
      setDocument(updated)
      setEditorValue(updated.raw_content)
      setMessage("")
      await loadHistory()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save document")
    } finally {
      setSaving(false)
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
    try {
      const restored = await restoreDocumentVersion(document.id, version.id, {
        expected_content_hash: expectedHash,
        message: message.trim() || `Restored version ${version.version_number}`,
      })
      setDocument(restored)
      setEditorValue(restored.raw_content)
      setMessage("")
      await loadHistory()
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore version")
    } finally {
      setRestoringVersionId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/documents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to Documents
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{document.title}</h1>
            <Badge variant="outline">v{document.version_counter}</Badge>
            {document.has_unindexed_changes && <Badge variant="destructive">Disk changed</Badge>}
            {!document.file_exists && <Badge variant="destructive">Missing on disk</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:gap-3">
            <span>{document.file_name}</span>
            {document.project_name && <span>{document.project_name}</span>}
            {document.folder_name && <span>{document.folder_name}</span>}
            <span>{document.file_path}</span>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={() => void handleReload()} disabled={reloading}>
            {reloading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <RefreshCw className="mr-1.5 size-4" />}
            Reload from disk
          </Button>
          <Button onClick={() => void handleSave()} disabled={!document.file_exists || !dirty || saving}>
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
            Save changes
          </Button>
        </div>
      </div>

      {(document.has_unindexed_changes || !document.file_exists || error) && (
        <div className="space-y-3">
          {!document.file_exists && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              The source file is missing on disk. Reload or reindex before editing.
            </div>
          )}
          {document.has_unindexed_changes && document.file_exists && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
              The file changed on disk outside the app. Reload before saving so you do not overwrite newer content.
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Local editing workspace</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Save writes atomically to the real markdown file and records local history.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-1">
                <Button
                  variant={mode === "edit" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setMode("edit")}
                >
                  <PencilLine className="mr-1.5 size-4" />
                  Edit
                </Button>
                <Button
                  variant={mode === "preview" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setMode("preview")}
                >
                  <Eye className="mr-1.5 size-4" />
                  Preview
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Save note</label>
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Why did you make this change?"
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>

              {mode === "edit" ? (
                <textarea
                  value={editorValue}
                  onChange={(event) => setEditorValue(event.target.value)}
                  className="min-h-[420px] w-full rounded-xl border border-input bg-background px-4 py-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  spellCheck={false}
                />
              ) : (
                <div className="min-h-[420px] rounded-xl border border-border bg-card p-4 sm:p-6">
                  <MarkdownRenderer content={stripFrontmatter(editorValue)} />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <FileText className="size-3.5" />
                <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
                <span>•</span>
                <span>Updated {formatTimestamp(document.updated_at)}</span>
                <span>•</span>
                <span>{(document.size_bytes / 1024).toFixed(1)} KB</span>
              </div>
            </CardContent>
          </Card>

          {(headings.length > 0 || links.length > 0 || tasks.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Headings</CardTitle>
                </CardHeader>
                <CardContent>
                  {headings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No headings extracted.</p>
                  ) : (
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {headings.map((heading, index) => (
                        <li key={`${heading}-${index}`}>{heading}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Links</CardTitle>
                </CardHeader>
                <CardContent>
                  {links.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No links extracted.</p>
                  ) : (
                    <ul className="space-y-2 break-all text-sm text-muted-foreground">
                      {links.map((link, index) => (
                        <li key={`${link}-${index}`}>{link}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tasks ({document.task_count})</CardTitle>
                </CardHeader>
                <CardContent>
                  {tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tasks extracted.</p>
                  ) : (
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {tasks.map((task, index) => (
                        <li key={`${task}-${index}`}>{task}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" />
                Version history
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {historyLoading ? (
                <div className="space-y-2 text-sm text-muted-foreground">Loading history…</div>
              ) : versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved versions yet.</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => void handleSelectVersion(version.id)}
                          className="min-w-0 text-left"
                        >
                          <p className="text-sm font-medium">
                            v{version.version_number} · {version.change_type}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTimestamp(version.created_at)}
                          </p>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleRestore(version)}
                          disabled={restoringVersionId === version.id || !document.file_exists}
                        >
                          {restoringVersionId === version.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            "Restore"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
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
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs text-muted-foreground">
                      {selectedVersion.content}
                    </pre>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Pick a version to inspect it.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4" />
                Write audit
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">Loading audit…</p>
              ) : auditEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No writes recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {auditEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium capitalize">{event.action}</p>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(event.created_at)}
                        </span>
                      </div>
                      {event.message && (
                        <p className="mt-1 text-sm text-muted-foreground">{event.message}</p>
                      )}
                      <p className="mt-2 break-all text-xs text-muted-foreground">
                        {event.previous_content_hash.slice(0, 12)} → {event.new_content_hash.slice(0, 12)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
