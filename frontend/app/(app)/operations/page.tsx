import { AlertTriangle, FolderOpen, RefreshCw, ServerCog, Wrench } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getJobs,
  getSystemBackups,
  getSystemHealth,
  getSystemRuntime,
} from "@/lib/api"
import { formatTimestamp } from "@/lib/format"
import type { BackgroundJob, BackupFile, SystemHealth, SystemRuntime } from "@/types"
import { OperationsActions } from "./operations-actions"

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string
  value: string | number
  description: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

export default async function OperationsPage() {
  let health: SystemHealth | null = null
  let runtime: SystemRuntime | null = null
  let jobs: BackgroundJob[] = []
  let backups: BackupFile[] = []
  let loadError: string | null = null

  try {
    ;[health, runtime, jobs, backups] = await Promise.all([
      getSystemHealth(),
      getSystemRuntime(),
      getJobs(undefined, 12),
      getSystemBackups(),
    ])
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load operations data"
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Runtime health, rebuild visibility, and background maintenance state.
          </p>
        </div>
        {health && (
          <Badge variant={health.status === "healthy" ? "secondary" : "destructive"}>
            {health.status === "healthy" ? "Healthy" : "Degraded"}
          </Badge>
        )}
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {health && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Active folders" value={health.active_folder_count} description="Currently enabled folder records" />
          <SummaryCard label="Watching" value={health.watched_folder_count} description="Folders configured for active watching" />
          <SummaryCard label="Degraded" value={health.degraded_folder_count} description="Folders currently reporting degraded or failed state" />
          <SummaryCard label="Unavailable" value={health.unavailable_folder_count} description="Folders with missing or inaccessible roots" />
          <SummaryCard label="Running jobs" value={health.running_job_count} description="Background maintenance currently in progress" />
          <SummaryCard label="Failed jobs" value={health.failed_job_count} description="Recent jobs that need inspection or retry" />
        </div>
      )}

      <OperationsActions backups={backups} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Folder runtime state</h2>
          </div>

          {!runtime || runtime.folders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No folder runtime data available yet.
            </div>
          ) : (
            <div className="space-y-3">
              {runtime.folders.map((folder) => {
                const summary = folder.last_scan_summary
                const degraded = folder.watch_state === "degraded" || folder.watch_state === "failed"

                return (
                  <Card key={folder.folder_id}>
                    <CardContent className="space-y-3 px-5 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{folder.folder_name}</p>
                            <Badge variant={folder.watch_enabled ? "secondary" : "outline"}>
                              {folder.watch_enabled ? "watch enabled" : "manual"}
                            </Badge>
                            <Badge variant={degraded ? "destructive" : "outline"}>{folder.watch_state}</Badge>
                            <Badge variant="outline">{folder.availability_state}</Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{folder.folder_path}</p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {folder.last_checked_at ? `Checked ${formatTimestamp(folder.last_checked_at)}` : "Never checked"}
                        </div>
                      </div>

                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <span className="font-medium text-foreground">Last event:</span>{" "}
                          {folder.last_event_at ? formatTimestamp(folder.last_event_at) : "—"}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Last scan:</span>{" "}
                          {folder.last_successful_scan_at ? formatTimestamp(folder.last_successful_scan_at) : "—"}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Last reconcile:</span>{" "}
                          {folder.last_full_reconcile_at ? formatTimestamp(folder.last_full_reconcile_at) : "—"}
                        </div>
                      </div>

                      {summary && (
                        <p className="text-xs text-muted-foreground">
                          Last summary: {summary.indexed} indexed, {summary.skipped} skipped, {summary.errors} errors
                        </p>
                      )}

                      {folder.last_error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                          {folder.last_error}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <ServerCog className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Recent jobs</h2>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No background jobs yet.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <Card key={job.id}>
                  <CardContent className="space-y-3 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{job.job_type}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {job.target_type ? `${job.target_type}${job.target_id ? ` · ${job.target_id}` : ""}` : "System job"}
                        </p>
                      </div>
                      <Badge variant={job.status === "failed" ? "destructive" : job.status === "running" ? "secondary" : "outline"}>
                        {job.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Created {formatTimestamp(job.created_at)}</span>
                      {job.started_at && <span>Started {formatTimestamp(job.started_at)}</span>}
                      {job.finished_at && <span>Finished {formatTimestamp(job.finished_at)}</span>}
                    </div>

                    {job.progress_total > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progress</span>
                          <span>
                            {job.progress_current}/{job.progress_total}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, (job.progress_current / job.progress_total) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {job.error && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {job.error}
                      </div>
                    )}

                    {job.summary && (
                      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                        {JSON.stringify(job.summary, null, 2)}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What to do when things look wrong</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p>If a folder is degraded or missing, confirm the path still exists and then run a rebuild from the folder management screen.</p>
              </div>
              <div className="flex items-start gap-2">
                <RefreshCw className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p>Use rebuild and drift-check jobs before assuming indexed content is permanently lost.</p>
              </div>
              <div className="flex items-start gap-2">
                <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p>Background jobs are persisted, so you can inspect failures after a backend restart.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Available backups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {backups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No backups have been created yet.</p>
              ) : (
                backups.map((backup) => (
                  <div key={backup.name} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium">{backup.name}</p>
                    <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                      <p>Created {formatTimestamp(backup.created_at)}</p>
                      <p>{backup.size_bytes.toLocaleString()} bytes</p>
                      {backup.metadata?.app_version && <p>App version {backup.metadata.app_version}</p>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
