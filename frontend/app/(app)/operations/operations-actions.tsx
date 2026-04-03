"use client"

import { Download, Loader2, PlayCircle, RotateCcw, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { AppAlert } from "@/components/shared/app-alert"
import {
  SectionPanel,
  SectionPanelContent,
  SectionPanelDescription,
  SectionPanelHeader,
  SectionPanelTitle,
} from "@/components/shared/section-panel"
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

  async function runAction(action: string, runner: () => Promise<void>) {
    setLoadingAction(action)
    try {
      await runner()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed")
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <SectionPanel>
      <SectionPanelHeader>
        <SectionPanelTitle>Maintenance actions</SectionPanelTitle>
        <SectionPanelDescription>Queue drift checks, produce backups, validate restore input, and export a support bundle when you need help debugging.</SectionPanelDescription>
      </SectionPanelHeader>
      <SectionPanelContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void runAction("drift", async () => {
                const job = await triggerDriftCheck()
                toast.success(`Queued drift check ${job.id}`)
              })
            }
            disabled={loadingAction !== null}
          >
            {loadingAction === "drift" ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
            Run drift check
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              void runAction("backup", async () => {
                const job = await createSystemBackup()
                toast.success(`Queued backup ${job.id}`)
              })
            }
            disabled={loadingAction !== null}
          >
            {loadingAction === "backup" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Create backup
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              void runAction("bundle", async () => {
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
                toast.success("Support bundle downloaded")
              })
            }
            disabled={loadingAction !== null}
          >
            {loadingAction === "bundle" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download support bundle
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <select
            value={selectedBackup}
            onChange={(event) => setSelectedBackup(event.target.value)}
            className="h-11 rounded-2xl border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            disabled={!hasBackups || loadingAction !== null}
          >
            {!hasBackups ? <option value="">No backups available</option> : null}
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
              void runAction("validate-backup", async () => {
                const result = await validateSystemBackup(selectedBackup)
                setValidation(result)
                toast.success(result.valid ? `Validated ${result.backup_name}` : `Validation failed for ${result.backup_name}`)
              })
            }
          >
            {loadingAction === "validate-backup" ? <Loader2 className="size-4 animate-spin" /> : null}
            Validate backup
          </Button>

          <Button
            variant="destructive"
            disabled={!selectedBackup || loadingAction !== null}
            onClick={() => {
              const confirmed = window.confirm(
                `Queue restore from ${selectedBackup}? This replaces the current indexed metadata on the central node.`
              )
              if (!confirmed) return

              void runAction("restore-backup", async () => {
                const job = await restoreSystemBackup(selectedBackup)
                toast.success(`Queued restore ${job.id}`)
              })
            }}
          >
            {loadingAction === "restore-backup" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Queue restore
          </Button>
        </div>

        {validation ? (
          <AppAlert variant={validation.valid ? "success" : "warning"} title={validation.backup_name}>
            <div className="space-y-2">
              <p>{validation.valid ? "Backup structure looks valid." : "Backup validation returned issues."}</p>
              <p className="text-xs text-current/75">
                Counts: {Object.entries(validation.counts)
                  .map(([key, value]) => `${key}=${value}`)
                  .join(", ")}
              </p>
              {validation.warnings.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {validation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              {validation.errors.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {validation.errors.map((validationError) => (
                    <li key={validationError}>{validationError}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </AppAlert>
        ) : null}
      </SectionPanelContent>
    </SectionPanel>
  )
}
