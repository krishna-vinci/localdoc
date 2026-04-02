"use client"

import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Unplug,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  createEnrollmentToken,
  createDeviceShareRequest,
  deleteDevice,
  deleteDeviceShare,
  getDeviceShareRequests,
  getDeviceShares,
  getDevices,
  getSyncHealth,
  revokeDevice,
  updateDeviceShare,
} from "@/lib/api"
import { formatTimestamp } from "@/lib/format"
import type { Device, DeviceShare, DeviceShareRequest, EnrollmentToken, SyncHealth } from "@/types"

function timestampToMs(value: string | null): number | null {
  if (!value) return null
  const normalizedValue = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  const parsed = Date.parse(normalizedValue)
  return Number.isNaN(parsed) ? null : parsed
}

async function copyText(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available in this environment")
  }

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand("copy")
  document.body.removeChild(textarea)
  if (!copied) {
    throw new Error("Copy failed")
  }
}

function normalizePairingServerUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return "http://HOST:4320"
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "")
  }

  return /:\d+$/.test(trimmed) ? `http://${trimmed}` : `http://${trimmed}:4320`
}

export function DeviceManagement({
  initialDevices,
  initialSyncHealth,
  initialSharesByDevice,
  initialShareRequestsByDevice,
  initialRenderedAt,
}: {
  initialDevices: Device[]
  initialSyncHealth: SyncHealth
  initialSharesByDevice: Record<string, DeviceShare[]>
  initialShareRequestsByDevice: Record<string, DeviceShareRequest[]>
  initialRenderedAt: string
}) {
  const [devices, setDevices] = useState(initialDevices)
  const [sharesByDevice, setSharesByDevice] = useState(initialSharesByDevice)
  const [shareRequestsByDevice, setShareRequestsByDevice] = useState(initialShareRequestsByDevice)
  const [syncHealth, setSyncHealth] = useState(initialSyncHealth)
  const [loading, setLoading] = useState(false)
  const [creatingToken, setCreatingToken] = useState(false)
  const [token, setToken] = useState<EnrollmentToken | null>(null)
  const [copiedInstallState, setCopiedInstallState] = useState<"idle" | "copied">("idle")
  const [copiedPairState, setCopiedPairState] = useState<"idle" | "copied">("idle")
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [renderedAtMs, setRenderedAtMs] = useState(() => timestampToMs(initialRenderedAt) ?? Date.now())
  const [pairingHost, setPairingHost] = useState("")
  const [requestDrafts, setRequestDrafts] = useState<Record<string, {
    display_name: string
    source_path: string
    include_globs: string
    exclude_globs: string
  }>>({})

  useEffect(() => {
    setRenderedAtMs(Date.now())
    setPairingHost(window.location.hostname)
  }, [])

  const deviceCountLabel = useMemo(() => `${syncHealth.device_count} total`, [syncHealth.device_count])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const nextDevices = await getDevices()
      const [nextSyncHealth, sharesEntries, requestEntries] = await Promise.all([
        getSyncHealth(),
        Promise.all(nextDevices.map(async (device) => [device.id, await getDeviceShares(device.id)] as const)),
        Promise.all(nextDevices.map(async (device) => [device.id, await getDeviceShareRequests(device.id)] as const)),
      ])
      setDevices(nextDevices)
      setSyncHealth(nextSyncHealth)
      setSharesByDevice(Object.fromEntries(sharesEntries))
      setShareRequestsByDevice(Object.fromEntries(requestEntries))
      setRenderedAtMs(Date.now())
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh devices")
    } finally {
      setLoading(false)
      setBusyKey(null)
    }
  }

  async function handleCreateToken() {
    setCreatingToken(true)
    setError(null)
    try {
      setToken(await createEnrollmentToken())
      setCopiedPairState("idle")
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create token")
    } finally {
      setCreatingToken(false)
    }
  }

  async function handleRevoke(deviceId: string) {
    const confirmed = window.confirm("Revoke this device? It will no longer be able to sync.")
    if (!confirmed) return
    setBusyKey(`revoke:${deviceId}`)
    setError(null)
    try {
      await revokeDevice(deviceId)
      await refresh()
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke device")
      setBusyKey(null)
    }
  }

  async function handleDeleteDevice(device: Device) {
    const confirmed = window.confirm(
      `Delete device \"${device.display_name}\"? This removes all mirrored shares, replicated files, and indexed remote documents for it.`
    )
    if (!confirmed) return
    setBusyKey(`delete-device:${device.id}`)
    setError(null)
    try {
      await deleteDevice(device.id)
      await refresh()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete device")
      setBusyKey(null)
    }
  }

  async function handleToggleShare(deviceId: string, share: DeviceShare) {
    setBusyKey(`share:${share.id}`)
    setError(null)
    try {
      await updateDeviceShare(deviceId, share.id, !share.sync_enabled)
      await refresh()
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Failed to update share")
      setBusyKey(null)
    }
  }

  async function handleRemoveShare(deviceId: string, share: DeviceShare) {
    const confirmed = window.confirm(
      `Remove share \"${share.display_name}\"? Mirrored files and indexed documents on this node will be deleted.`
    )
    if (!confirmed) return
    setBusyKey(`share-remove:${share.id}`)
    setError(null)
    try {
      await deleteDeviceShare(deviceId, share.id)
      await refresh()
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Failed to remove share")
      setBusyKey(null)
    }
  }

  function updateRequestDraft(
    deviceId: string,
    field: "display_name" | "source_path" | "include_globs" | "exclude_globs",
    value: string
  ) {
    setRequestDrafts((current) => ({
      ...current,
      [deviceId]: {
        display_name: current[deviceId]?.display_name ?? "",
        source_path: current[deviceId]?.source_path ?? "",
        include_globs: current[deviceId]?.include_globs ?? "",
        exclude_globs: current[deviceId]?.exclude_globs ?? "",
        [field]: value,
      },
    }))
  }

  async function handleCreateShareRequest(deviceId: string) {
    const draft = requestDrafts[deviceId]
    if (!draft?.display_name?.trim() || !draft?.source_path?.trim()) {
      setError("Share name and source path are required")
      return
    }

    setBusyKey(`create-request:${deviceId}`)
    setError(null)
    try {
      await createDeviceShareRequest(deviceId, {
        display_name: draft.display_name.trim(),
        source_path: draft.source_path.trim(),
        include_globs: draft.include_globs.split(",").map((item) => item.trim()).filter(Boolean),
        exclude_globs: draft.exclude_globs.split(",").map((item) => item.trim()).filter(Boolean),
        sync_enabled: true,
      })
      setRequestDrafts((current) => ({
        ...current,
        [deviceId]: { display_name: "", source_path: "", include_globs: "", exclude_globs: "" },
      }))
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create share request")
      setBusyKey(null)
    }
  }

  async function handleCopyInstallCommand() {
    setError(null)
    try {
      await copyText(installCommand)
      setCopiedInstallState("copied")
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Failed to copy install command")
    }
  }

  async function handleCopyPairCommand() {
    if (!pairingCommand) return
    setError(null)
    try {
      await copyText(pairingCommand)
      setCopiedPairState("copied")
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Failed to copy pairing command")
    }
  }

  const pairingServerUrl = normalizePairingServerUrl(pairingHost)
  const installCommand = `curl -fsSL ${pairingServerUrl}/api/v1/sync/agent/install.sh | sh`
  const pairingCommand = token ? `localdocs pair --server ${pairingServerUrl} --token ${token.token}` : null

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Devices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pair lightweight local agents, manage mirrored shares, and inspect recent sync failures.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <RefreshCw className="mr-1.5 size-4" />}
            Refresh
          </Button>
          <Button onClick={() => void handleCreateToken()} disabled={creatingToken}>
            {creatingToken ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ShieldCheck className="mr-1.5 size-4" />}
            Create pairing token
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Self-hosted agent install</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Central host / IP</span>
              <Input
                value={pairingHost}
                onChange={(event) => setPairingHost(event.target.value)}
                  placeholder="your-server-host"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Use the IP or DNS name that the remote MacBook or Linux device can actually reach.
            </p>
          </div>
          <code className="block overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            {installCommand}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void handleCopyInstallCommand()}>
              {copiedInstallState === "copied" ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
              {copiedInstallState === "copied" ? "Copied install" : "Copy install command"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            First run <code>./scripts/build-agent-dist.sh</code> on the server to publish macOS, Linux, and Windows archives for self-hosted downloads.
          </p>
        </CardContent>
      </Card>

      {token && pairingCommand && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest enrollment token</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">After install, pair the device once, then use <code>localdocs pending</code> to review any requested shares.</p>
            <code className="block overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              {pairingCommand}
            </code>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="block overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{token.token}</code>
              <Button variant="outline" onClick={() => void handleCopyPairCommand()}>
                {copiedPairState === "copied" ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
                {copiedPairState === "copied" ? "Copied pair command" : "Copy pair command"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Expires {formatTimestamp(token.expires_at)}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardContent className="px-5 py-4"><p className="text-sm text-muted-foreground">Devices</p><p className="mt-1 text-2xl font-bold">{syncHealth.device_count}</p><p className="text-xs text-muted-foreground">{deviceCountLabel}</p></CardContent></Card>
        <Card><CardContent className="px-5 py-4"><p className="text-sm text-muted-foreground">Approved</p><p className="mt-1 text-2xl font-bold">{syncHealth.approved_device_count}</p></CardContent></Card>
        <Card><CardContent className="px-5 py-4"><p className="text-sm text-muted-foreground">Stale</p><p className="mt-1 text-2xl font-bold">{syncHealth.stale_device_count}</p></CardContent></Card>
        <Card><CardContent className="px-5 py-4"><p className="text-sm text-muted-foreground">Mirrored shares</p><p className="mt-1 text-2xl font-bold">{syncHealth.share_count}</p></CardContent></Card>
        <Card><CardContent className="px-5 py-4"><p className="text-sm text-muted-foreground">Failed batches</p><p className="mt-1 text-2xl font-bold">{syncHealth.failed_batch_count}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sync failures</CardTitle>
        </CardHeader>
        <CardContent>
          {syncHealth.recent_failures.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent sync failures.</p>
          ) : (
            <div className="space-y-3">
              {syncHealth.recent_failures.map((failure) => (
                <div key={failure.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive">{failure.batch_kind}</Badge>
                    <p className="text-sm font-medium">{failure.device_name ?? "Unknown device"}</p>
                    {failure.share_name && <span className="text-xs text-muted-foreground">· {failure.share_name}</span>}
                  </div>
                  {failure.error && (
                    <p className="mt-2 text-sm text-destructive">{failure.error}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {failure.source_path ?? "Unknown path"} · {failure.received_at ? formatTimestamp(failure.received_at) : "time unavailable"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Smartphone className="mx-auto mb-3 size-8 opacity-40" />
          <p className="text-sm">No paired devices yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {devices.map((device) => {
            const shares = sharesByDevice[device.id] ?? []
            const shareRequests = shareRequestsByDevice[device.id] ?? []
            const requestDraft = requestDrafts[device.id] ?? {
              display_name: "",
              source_path: "",
              include_globs: "",
              exclude_globs: "",
            }
            const lastSeenMs = timestampToMs(device.last_seen_at)
            const stale = lastSeenMs === null || renderedAtMs-lastSeenMs > 5 * 60 * 1000
            return (
              <Card key={device.id}>
                <CardContent className="space-y-4 px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{device.display_name}</p>
                        <Badge variant={device.status === "revoked" ? "destructive" : stale ? "secondary" : "outline"}>
                          {device.status === "revoked" ? "revoked" : stale ? "stale" : "approved"}
                        </Badge>
                        {device.platform && <Badge variant="outline">{device.platform}</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {device.hostname ?? "Unknown host"} · {device.agent_version ?? "agent version unknown"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last seen {device.last_seen_at ? formatTimestamp(device.last_seen_at) : "never"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void handleRevoke(device.id)}
                        disabled={device.status === "revoked" || busyKey === `revoke:${device.id}` || busyKey === `delete-device:${device.id}`}
                      >
                        {busyKey === `revoke:${device.id}` ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Unplug className="mr-1.5 size-4" />}
                        Revoke
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void handleDeleteDevice(device)}
                        disabled={busyKey === `revoke:${device.id}` || busyKey === `delete-device:${device.id}`}
                      >
                        {busyKey === `delete-device:${device.id}` ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Trash2 className="mr-1.5 size-4" />}
                        Delete device
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Requested shares</p>
                    <div className="rounded-lg border border-border p-3 space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Share name</span>
                          <Input
                            value={requestDraft.display_name}
                            onChange={(event) => updateRequestDraft(device.id, "display_name", event.target.value)}
                            placeholder="notes"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Remote source path</span>
                          <Input
                            value={requestDraft.source_path}
                            onChange={(event) => updateRequestDraft(device.id, "source_path", event.target.value)}
                            placeholder={device.platform === "darwin" ? "/Users/name/Documents/Notes" : "/home/user/notes"}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Include globs</span>
                          <Input
                            value={requestDraft.include_globs}
                            onChange={(event) => updateRequestDraft(device.id, "include_globs", event.target.value)}
                            placeholder="notes/**/*.md"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Exclude globs</span>
                          <Input
                            value={requestDraft.exclude_globs}
                            onChange={(event) => updateRequestDraft(device.id, "exclude_globs", event.target.value)}
                            placeholder="**/drafts/**"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleCreateShareRequest(device.id)}
                          disabled={busyKey === `create-request:${device.id}`}
                        >
                          {busyKey === `create-request:${device.id}` ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                          Request share on device
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          The device user can review it with <code>localdocs pending</code> and approve it with <code>localdocs approve REQUEST_ID</code>.
                        </p>
                      </div>
                      {shareRequests.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No share requests yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {shareRequests.map((request) => (
                            <div key={request.id} className="rounded-md border border-border px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium">{request.display_name}</p>
                                <Badge variant={request.status === "approved" ? "secondary" : request.status === "denied" ? "destructive" : "outline"}>
                                  {request.status}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{request.source_path}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Requested {formatTimestamp(request.requested_at)}
                                {request.responded_at ? ` · Responded ${formatTimestamp(request.responded_at)}` : ""}
                              </p>
                              {request.response_message && (
                                <p className="mt-1 text-xs text-muted-foreground">{request.response_message}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shares</p>
                    {shares.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No shares registered yet.</p>
                    ) : (
                      shares.map((share) => {
                        const shareBusy = busyKey === `share:${share.id}` || busyKey === `share-remove:${share.id}`
                        return (
                          <div key={share.id} className="rounded-lg border border-border p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium">{share.display_name}</p>
                                  <Badge variant={share.sync_enabled ? "secondary" : "outline"}>
                                    {share.sync_enabled ? "sync enabled" : "disabled"}
                                  </Badge>
                                  {share.last_snapshot_generation && <Badge variant="outline">snapshot {share.last_snapshot_generation}</Badge>}
                                  {share.failed_batch_count > 0 && (
                                    <Badge variant="destructive">{share.failed_batch_count} failures</Badge>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">Source: {share.source_path}</p>
                                <p className="text-xs text-muted-foreground">Replica: {share.storage_path}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Files {share.active_file_count}/{share.file_count} · Last synced {share.last_sync_at ? formatTimestamp(share.last_sync_at) : "never"}
                                </p>
                                {share.last_error && (
                                  <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                    <div className="flex items-start gap-2">
                                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                      <div>
                                        <p>{share.last_error}</p>
                                        {share.last_error_at && (
                                          <p className="mt-1 text-[11px] text-destructive/80">
                                            Last failure {formatTimestamp(share.last_error_at)}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleToggleShare(device.id, share)}
                                  disabled={shareBusy}
                                >
                                  {busyKey === `share:${share.id}` ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                                  {share.sync_enabled ? "Disable sync" : "Enable sync"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleRemoveShare(device.id, share)}
                                  disabled={shareBusy}
                                >
                                  {busyKey === `share-remove:${share.id}` ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Trash2 className="mr-1.5 size-4" />}
                                  Remove share
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
