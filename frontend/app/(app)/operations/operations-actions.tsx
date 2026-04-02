"use client"

import { Download, Loader2, PlayCircle, RotateCcw, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  createSystemBackup,
  getSupportBundle,
  restoreSystemBackup,
  triggerDriftCheck,
  validateSystemBackup,
} from "@/lib/api"
import type { BackupFile, BackupValidation } from "@/types"

export function OperationsActions({ backups }: { backups: BackupFile[] }) {
  const router = useRouter()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedBackup, setSelectedBackup] = useState(backups[0]?.name ?? "")
  const [validation, setValidation] = useState<BackupValidation | null>(null)

  const hasBackups = backups.length > 0
  const backupOptions = useMemo(() => backups.map((backup) => backup.name), [backups])

  useEffect(() => {
    if (!selectedBackup && backups[0]?.name) {
      setSelectedBackup(backups[0].name)
      return
    }
    if (selectedBackup && !backupOptions.includes(selectedBackup)) {
      setSelectedBackup(backups[0]?.name ?? "")
    }
  }, [backupOptions, backups, selectedBackup])

  async function handleAction(action: string, runner: () => Promise<void>) {
    setLoadingAction(action)
    setError(null)
    setMessage(null)
    try {
      await runner()
      router.refresh()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed")
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Layer 4 maintenance actions</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Run drift checks, create backups, validate restore input, and export a support bundle.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="outline"
          onClick={() =>
            void handleAction("drift", async () => {
              const job = await triggerDriftCheck()
              setMessage(`Queued drift check job ${job.id}`)
            })
          }
          disabled={loadingAction !== null}
        >
          {loadingAction === "drift" ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <PlayCircle className="mr-1.5 size-4" />}
          Run drift check
        </Button>

        <Button
          variant="outline"
          onClick={() =>
            void handleAction("backup", async () => {
              const job = await createSystemBackup()
              setMessage(`Queued backup job ${job.id}`)
            })
          }
          disabled={loadingAction !== null}
        >
          {loadingAction === "backup" ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ShieldCheck className="mr-1.5 size-4" />}
          Create backup
        </Button>

        <Button
          variant="outline"
          onClick={() =>
            void handleAction("bundle", async () => {
              const supportBundle = await getSupportBundle()
              const blob = new Blob([JSON.stringify(supportBundle, null, 2)], {
                type: "application/json",
              })
              const url = window.URL.createObjectURL(blob)
              const link = document.createElement("a")
              link.href = url
              link.download = `localdocs-support-bundle-${Date.now()}.json`
              document.body.appendChild(link)
              link.click()
              link.remove()
              window.URL.revokeObjectURL(url)
              setMessage("Downloaded support bundle")
            })
          }
          disabled={loadingAction !== null}
        >
          {loadingAction === "bundle" ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
          Download support bundle
        </Button>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground">Backup file</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedBackup}
            onChange={(event) => setSelectedBackup(event.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-w-80"
            disabled={!hasBackups || loadingAction !== null}
          >
            {!hasBackups && <option value="">No backups available</option>}
            {backupOptions.map((backupName) => (
              <option key={backupName} value={backupName}>
                {backupName}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            disabled={!selectedBackup || loadingAction !== null}
            onClick={() =>
              void handleAction("validate-backup", async () => {
                const result = await validateSystemBackup(selectedBackup)
                setValidation(result)
                setMessage(result.valid ? `Validated ${result.backup_name}` : `Validation failed for ${result.backup_name}`)
              })
            }
          >
            {loadingAction === "validate-backup" ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Validate backup
          </Button>

          <Button
            variant="destructive"
            disabled={!selectedBackup || loadingAction !== null}
            onClick={() => {
              const confirmed = window.confirm(
                `Queue restore from ${selectedBackup}? This will replace the current indexed metadata on the central node.`
              )
              if (!confirmed) return
              void handleAction("restore-backup", async () => {
                const job = await restoreSystemBackup(selectedBackup)
                setMessage(`Queued restore job ${job.id}`)
              })
            }}
          >
            {loadingAction === "restore-backup" ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <RotateCcw className="mr-1.5 size-4" />}
            Queue restore
          </Button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {validation && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <p className="font-medium">{validation.backup_name}</p>
          <p className="mt-1 text-muted-foreground">
            {validation.valid ? "Backup is structurally valid." : "Backup validation failed."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Counts: {Object.entries(validation.counts)
              .map(([key, value]) => `${key}=${value}`)
              .join(", ")}
          </p>
          {validation.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-200">
              {validation.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {validation.errors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
              {validation.errors.map((validationError) => (
                <li key={validationError}>{validationError}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
