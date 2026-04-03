import { Activity, FolderOpen, ServerCog } from "lucide-react"

import { AppAlert } from "@/components/shared/app-alert"
import { PageHeader } from "@/components/shared/page-header"
import {
  SectionPanel,
  SectionPanelContent,
  SectionPanelDescription,
  SectionPanelHeader,
  SectionPanelTitle,
} from "@/components/shared/section-panel"
import { StatChip } from "@/components/shared/stat-chip"
import { StatusDot } from "@/components/shared/status-dot"
import { Badge } from "@/components/ui/badge"
import { getJobs, getSystemBackups, getSystemHealth, getSystemRuntime } from "@/lib/api"
import { formatRelativeTime, formatTimestamp } from "@/lib/format"
import type { BackgroundJob, BackupFile, SystemHealth, SystemRuntime } from "@/types"

import { OperationsActions } from "@/app/(app)/operations/operations-actions"

export default async function ManageOperationsPage() {
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Maintenance"
        title="Operations"
        description="The health of your library, the jobs moving in the background, and the maintenance actions that should stay close at hand but out of the way."
      />

      {loadError ? <AppAlert variant="error">{loadError}</AppAlert> : null}

      {health ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatChip label="Active folders" value={health.active_folder_count} icon={FolderOpen} />
          <StatChip label="Watching" value={health.watched_folder_count} icon={Activity} />
          <StatChip label="Degraded" value={health.degraded_folder_count} icon={Activity} />
          <StatChip label="Unavailable" value={health.unavailable_folder_count} icon={Activity} />
          <StatChip label="Running jobs" value={health.running_job_count} icon={ServerCog} />
          <StatChip label="Failed jobs" value={health.failed_job_count} icon={ServerCog} />
        </div>
      ) : null}

      <OperationsActions backups={backups} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SectionPanel>
          <SectionPanelHeader>
            <SectionPanelTitle>Folder runtime</SectionPanelTitle>
            <SectionPanelDescription>Live watcher state, availability, and the last meaningful activity for each indexed folder.</SectionPanelDescription>
          </SectionPanelHeader>
          <SectionPanelContent>
            {!runtime || runtime.folders.length === 0 ? (
              <AppAlert>No folder runtime data is available yet.</AppAlert>
            ) : (
              <div className="space-y-3">
                {runtime.folders.map((folder) => {
                  const degraded = folder.watch_state === "degraded" || folder.watch_state === "failed"

                  return (
                    <div key={folder.folder_id} className="rounded-[1.5rem] border border-border/70 bg-background/80 px-5 py-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold tracking-tight">{folder.folder_name}</h3>
                            <Badge variant={folder.watch_enabled ? "secondary" : "outline"}>
                              {folder.watch_enabled ? "Watch enabled" : "Manual"}
                            </Badge>
                            <StatusDot tone={degraded ? "warning" : "success"} label={folder.watch_state} />
                            <Badge variant="outline">{folder.availability_state}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{folder.folder_path}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>Checked {folder.last_checked_at ? formatRelativeTime(folder.last_checked_at) : "never"}</span>
                            <span>Last event {folder.last_event_at ? formatRelativeTime(folder.last_event_at) : "—"}</span>
                            <span>Last scan {folder.last_successful_scan_at ? formatRelativeTime(folder.last_successful_scan_at) : "—"}</span>
                          </div>
                        </div>

                        {folder.last_scan_summary ? (
                          <div className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-3 text-xs text-muted-foreground">
                            <p>{folder.last_scan_summary.indexed} indexed</p>
                            <p>{folder.last_scan_summary.skipped} skipped</p>
                            <p>{folder.last_scan_summary.errors} errors</p>
                          </div>
                        ) : null}
                      </div>

                      {folder.last_error ? <AppAlert variant="warning" className="mt-3">{folder.last_error}</AppAlert> : null}
                    </div>
                  )
                })}
              </div>
            )}
          </SectionPanelContent>
        </SectionPanel>

        <div className="space-y-6">
          <SectionPanel>
            <SectionPanelHeader>
              <SectionPanelTitle>Recent jobs</SectionPanelTitle>
              <SectionPanelDescription>Queued and completed background work, with progress where the backend provides it.</SectionPanelDescription>
            </SectionPanelHeader>
            <SectionPanelContent>
              {jobs.length === 0 ? (
                <AppAlert>No background jobs have been recorded yet.</AppAlert>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <div key={job.id} className="rounded-[1.5rem] border border-border/70 bg-background/80 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold tracking-tight">{job.job_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.target_type ? `${job.target_type}${job.target_id ? ` · ${job.target_id}` : ""}` : "System job"}
                          </p>
                        </div>
                        <Badge variant={job.status === "failed" ? "destructive" : job.status === "running" ? "secondary" : "outline"}>
                          {job.status}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Created {formatTimestamp(job.created_at)}</span>
                        {job.started_at ? <span>Started {formatRelativeTime(job.started_at)}</span> : null}
                        {job.finished_at ? <span>Finished {formatRelativeTime(job.finished_at)}</span> : null}
                      </div>

                      {job.progress_total > 0 ? (
                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Progress</span>
                            <span>
                              {job.progress_current}/{job.progress_total}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.min(100, (job.progress_current / job.progress_total) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {job.error ? <AppAlert variant="error" className="mt-3">{job.error}</AppAlert> : null}
                    </div>
                  ))}
                </div>
              )}
            </SectionPanelContent>
          </SectionPanel>

          <SectionPanel>
            <SectionPanelHeader>
              <SectionPanelTitle>Available backups</SectionPanelTitle>
              <SectionPanelDescription>Use these for validation and restore flows when you need to recover state.</SectionPanelDescription>
            </SectionPanelHeader>
            <SectionPanelContent>
              {backups.length === 0 ? (
                <AppAlert>No backups have been created yet.</AppAlert>
              ) : (
                <div className="space-y-3">
                  {backups.map((backup) => (
                    <div key={backup.name} className="rounded-[1.5rem] border border-border/70 bg-background/80 px-5 py-4">
                      <p className="text-sm font-semibold tracking-tight">{backup.name}</p>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>Created {formatTimestamp(backup.created_at)}</p>
                        <p>{backup.size_bytes.toLocaleString()} bytes</p>
                        {backup.metadata?.app_version ? <p>App version {backup.metadata.app_version}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionPanelContent>
          </SectionPanel>
        </div>
      </div>
    </div>
  )
}
