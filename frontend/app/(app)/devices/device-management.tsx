"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { useState } from "react"
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
import { StatChip } from "@/components/shared/stat-chip"
import { StatusDot } from "@/components/shared/status-dot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { formatRelativeTime, formatTimestamp, parseTimestamp } from "@/lib/format"
import type { Device, DeviceShare, DeviceShareRequest, EnrollmentToken, SyncHealth } from "@/types"

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

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

async function loadDevicesData() {
  const devices = await getDevices()
  const [syncHealth, sharesEntries, requestEntries] = await Promise.all([
    getSyncHealth(),
    Promise.all(devices.map(async (device) => [device.id, await getDeviceShares(device.id)] as const)),
    Promise.all(devices.map(async (device) => [device.id, await getDeviceShareRequests(device.id)] as const)),
  ])

  return {
    devices,
    syncHealth,
    sharesByDevice: Object.fromEntries(sharesEntries),
    shareRequestsByDevice: Object.fromEntries(requestEntries),
    refreshedAt: new Date().toISOString(),
  }
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
  const queryClient = useQueryClient()
  const [token, setToken] = useState<EnrollmentToken | null>(null)
  const [copiedInstallState, setCopiedInstallState] = useState<"idle" | "copied">("idle")
  const [copiedPairState, setCopiedPairState] = useState<"idle" | "copied">("idle")
  const [pairingHost, setPairingHost] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hostname
  )
  const [requestDrafts, setRequestDrafts] = useState<
    Record<
      string,
      {
        display_name: string
        source_path: string
        include_globs: string
        exclude_globs: string
      }
    >
  >({})

  const devicesQuery = useQuery({
    queryKey: ["devices-dashboard"],
    queryFn: loadDevicesData,
    initialData: {
      devices: initialDevices,
      syncHealth: initialSyncHealth,
      sharesByDevice: initialSharesByDevice,
      shareRequestsByDevice: initialShareRequestsByDevice,
      refreshedAt: initialRenderedAt,
    },
    initialDataUpdatedAt: 0,
  })

  async function invalidateDevices() {
    await queryClient.invalidateQueries({ queryKey: ["devices-dashboard"] })
  }

  const revokeMutation = useMutation({
    mutationFn: revokeDevice,
    onSuccess: async () => {
      await invalidateDevices()
      toast.success("Device revoked")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to revoke device"),
  })

  const deleteDeviceMutation = useMutation({
    mutationFn: deleteDevice,
    onSuccess: async () => {
      await invalidateDevices()
      toast.success("Device deleted")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete device"),
  })

  const toggleShareMutation = useMutation({
    mutationFn: ({ deviceId, shareId, syncEnabled }: { deviceId: string; shareId: string; syncEnabled: boolean }) =>
      updateDeviceShare(deviceId, shareId, syncEnabled),
    onSuccess: async () => {
      await invalidateDevices()
      toast.success("Share updated")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update share"),
  })

  const deleteShareMutation = useMutation({
    mutationFn: ({ deviceId, shareId }: { deviceId: string; shareId: string }) => deleteDeviceShare(deviceId, shareId),
    onSuccess: async () => {
      await invalidateDevices()
      toast.success("Share removed")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove share"),
  })

  const requestShareMutation = useMutation({
    mutationFn: ({
      deviceId,
      display_name,
      source_path,
      include_globs,
      exclude_globs,
    }: {
      deviceId: string
      display_name: string
      source_path: string
      include_globs: string[]
      exclude_globs: string[]
    }) =>
      createDeviceShareRequest(deviceId, {
        display_name,
        source_path,
        include_globs,
        exclude_globs,
        sync_enabled: true,
      }),
    onSuccess: async (_, variables) => {
      setRequestDrafts((current) => ({
        ...current,
        [variables.deviceId]: { display_name: "", source_path: "", include_globs: "", exclude_globs: "" },
      }))
      await invalidateDevices()
      toast.success("Share request created")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create share request"),
  })

  const createTokenMutation = useMutation({
    mutationFn: createEnrollmentToken,
    onSuccess: (createdToken) => {
      setToken(createdToken)
      setCopiedPairState("idle")
      toast.success("Pairing token created")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create token"),
  })

  const pairingServerUrl = normalizePairingServerUrl(pairingHost)
  const installCommand = `curl -fsSL ${pairingServerUrl}/api/v1/sync/agent/install.sh | sh`
  const pairingCommand = token ? `localdocs pair --server ${pairingServerUrl} --token ${token.token}` : null

  const devices = devicesQuery.data.devices
  const syncHealth = devicesQuery.data.syncHealth
  const sharesByDevice = devicesQuery.data.sharesByDevice
  const shareRequestsByDevice = devicesQuery.data.shareRequestsByDevice
  const refreshedAt = parseTimestamp(devicesQuery.data.refreshedAt)

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sync"
        title="Devices"
        description="Pair agents, request shared folders from remote devices, and keep a clear view of what is mirrored into this hub."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => devicesQuery.refetch()} disabled={devicesQuery.isFetching}>
              {devicesQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh
            </Button>
            <Button onClick={() => createTokenMutation.mutate(undefined)} disabled={createTokenMutation.isPending}>
              {createTokenMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Create pairing token
            </Button>
          </div>
        }
      />

      {devicesQuery.isError ? (
        <AppAlert variant="error">{devicesQuery.error instanceof Error ? devicesQuery.error.message : "Failed to load devices"}</AppAlert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatChip label="Devices" value={syncHealth.device_count} icon={Smartphone} />
        <StatChip label="Approved" value={syncHealth.approved_device_count} icon={Smartphone} />
        <StatChip label="Stale" value={syncHealth.stale_device_count} icon={AlertTriangle} />
        <StatChip label="Shares" value={syncHealth.share_count} icon={Copy} />
        <StatChip label="Failed batches" value={syncHealth.failed_batch_count} icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SectionPanel>
          <SectionPanelHeader>
            <SectionPanelTitle>Install and pair</SectionPanelTitle>
            <SectionPanelDescription>Use a reachable host or IP, install the agent, and then pair it once with a fresh enrollment token.</SectionPanelDescription>
          </SectionPanelHeader>
          <SectionPanelContent className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Central host / IP</span>
              <Input value={pairingHost} onChange={(event) => setPairingHost(event.target.value)} placeholder="your-server-host" />
            </label>

            <div className="rounded-[1.25rem] border border-border/70 bg-muted/35 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Install command</p>
              <code className="mt-2 block overflow-x-auto text-sm leading-6 text-foreground">{installCommand}</code>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    await copyText(installCommand)
                    setCopiedInstallState("copied")
                    toast.success("Install command copied")
                  }}
                >
                  {copiedInstallState === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiedInstallState === "copied" ? "Copied" : "Copy install command"}
                </Button>
              </div>
            </div>

            {token && pairingCommand ? (
              <div className="rounded-[1.25rem] border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Latest pairing command</p>
                <code className="mt-2 block overflow-x-auto text-sm leading-6 text-foreground">{pairingCommand}</code>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await copyText(pairingCommand)
                      setCopiedPairState("copied")
                      toast.success("Pair command copied")
                    }}
                  >
                    {copiedPairState === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copiedPairState === "copied" ? "Copied" : "Copy pair command"}
                  </Button>
                  <Badge variant="outline">Expires {formatTimestamp(token.expires_at)}</Badge>
                </div>
              </div>
            ) : null}
          </SectionPanelContent>
        </SectionPanel>

        <SectionPanel>
          <SectionPanelHeader>
            <SectionPanelTitle>Recent sync failures</SectionPanelTitle>
            <SectionPanelDescription>Failures are grouped here so device cards can stay readable until something actually needs attention.</SectionPanelDescription>
          </SectionPanelHeader>
          <SectionPanelContent>
            {syncHealth.recent_failures.length === 0 ? (
              <AppAlert>No recent sync failures.</AppAlert>
            ) : (
              <div className="space-y-3">
                {syncHealth.recent_failures.map((failure) => (
                  <div key={failure.id} className="rounded-[1.25rem] border border-border/70 bg-background/80 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive">{failure.batch_kind}</Badge>
                      <p className="text-sm font-semibold tracking-tight">{failure.device_name ?? "Unknown device"}</p>
                    </div>
                    {failure.error ? <p className="mt-2 text-sm text-destructive">{failure.error}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {failure.source_path ?? "Unknown path"} · {failure.received_at ? formatTimestamp(failure.received_at) : "time unavailable"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionPanelContent>
        </SectionPanel>
      </div>

      <SectionPanel>
        <SectionPanelHeader>
          <SectionPanelTitle>Paired devices</SectionPanelTitle>
          <SectionPanelDescription>Each device can expose one or more shares. Keep inactive complexity tucked into each card until you need it.</SectionPanelDescription>
        </SectionPanelHeader>
        <SectionPanelContent>
          {devices.length === 0 ? (
            <EmptyState icon={Smartphone} title="No paired devices yet" description="Create a token, pair an agent, and it will appear here." />
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
                const lastSeen = parseTimestamp(device.last_seen_at)
                const stale = !lastSeen || !refreshedAt || refreshedAt.getTime() - lastSeen.getTime() > 5 * 60 * 1000

                return (
                  <div key={device.id} className="rounded-[1.5rem] border border-border/70 bg-background/80 px-5 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold tracking-tight">{device.display_name}</h3>
                          <StatusDot
                            tone={device.status === "revoked" ? "danger" : stale ? "warning" : "success"}
                            label={device.status === "revoked" ? "Revoked" : stale ? "Stale" : "Approved"}
                          />
                          {device.platform ? <Badge variant="outline">{device.platform}</Badge> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {device.hostname ?? "Unknown host"} · {device.agent_version ?? "agent version unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last seen {device.last_seen_at ? formatRelativeTime(device.last_seen_at) : "never"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (window.confirm("Revoke this device? It will no longer be able to sync.")) {
                              revokeMutation.mutate(device.id)
                            }
                          }}
                          disabled={device.status === "revoked" || revokeMutation.isPending}
                        >
                          {revokeMutation.isPending && revokeMutation.variables === device.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Unplug className="size-4" />
                          )}
                          Revoke
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete device “${device.display_name}”? This removes mirrored shares, replicated files, and indexed remote documents for it.`
                              )
                            ) {
                              deleteDeviceMutation.mutate(device.id)
                            }
                          }}
                          disabled={deleteDeviceMutation.isPending}
                        >
                          {deleteDeviceMutation.isPending && deleteDeviceMutation.variables === device.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-5 xl:grid-cols-2">
                      <div className="space-y-3 rounded-[1.25rem] border border-border/70 bg-muted/25 p-4">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Request a share</p>
                          <p className="mt-1 text-sm text-muted-foreground">Ask the remote device to expose a folder. The remote user still approves it locally.</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Share name</span>
                            <Input
                              value={requestDraft.display_name}
                              onChange={(event) => updateRequestDraft(device.id, "display_name", event.target.value)}
                              placeholder="notes"
                            />
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Remote source path</span>
                            <Input
                              value={requestDraft.source_path}
                              onChange={(event) => updateRequestDraft(device.id, "source_path", event.target.value)}
                              placeholder={device.platform === "darwin" ? "/Users/name/Documents/Notes" : "/home/user/notes"}
                            />
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Include globs</span>
                            <Input
                              value={requestDraft.include_globs}
                              onChange={(event) => updateRequestDraft(device.id, "include_globs", event.target.value)}
                              placeholder="notes/**/*.md"
                            />
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Exclude globs</span>
                            <Input
                              value={requestDraft.exclude_globs}
                              onChange={(event) => updateRequestDraft(device.id, "exclude_globs", event.target.value)}
                              placeholder="**/drafts/**"
                            />
                          </label>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (!requestDraft.display_name.trim() || !requestDraft.source_path.trim()) {
                              toast.error("Share name and source path are required")
                              return
                            }

                            requestShareMutation.mutate({
                              deviceId: device.id,
                              display_name: requestDraft.display_name.trim(),
                              source_path: requestDraft.source_path.trim(),
                              include_globs: requestDraft.include_globs
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean),
                              exclude_globs: requestDraft.exclude_globs
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean),
                            })
                          }}
                          disabled={requestShareMutation.isPending}
                        >
                          {requestShareMutation.isPending && requestShareMutation.variables?.deviceId === device.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Request share on device
                        </Button>

                        <div className="space-y-2">
                          {shareRequests.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No share requests yet.</p>
                          ) : (
                            shareRequests.map((request) => (
                              <div key={request.id} className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium">{request.display_name}</p>
                                  <Badge variant={request.status === "approved" ? "secondary" : request.status === "denied" ? "destructive" : "outline"}>
                                    {request.status}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{request.source_path}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 rounded-[1.25rem] border border-border/70 bg-muted/25 p-4">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Mirrored shares</p>
                          <p className="mt-1 text-sm text-muted-foreground">Once a share is approved, it appears here with sync state and failure signals.</p>
                        </div>
                        {shares.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No shares registered yet.</p>
                        ) : (
                          shares.map((share) => (
                            <div key={share.id} className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold tracking-tight">{share.display_name}</p>
                                    <StatusDot tone={share.sync_enabled ? "success" : "neutral"} label={share.sync_enabled ? "Sync enabled" : "Disabled"} />
                                    {share.failed_batch_count > 0 ? <Badge variant="destructive">{share.failed_batch_count} failures</Badge> : null}
                                  </div>
                                  <p className="text-xs text-muted-foreground">Source: {share.source_path}</p>
                                  <p className="text-xs text-muted-foreground">Replica: {share.storage_path}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Files {share.active_file_count}/{share.file_count} · Last synced {share.last_sync_at ? formatRelativeTime(share.last_sync_at) : "never"}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      toggleShareMutation.mutate({
                                        deviceId: device.id,
                                        shareId: share.id,
                                        syncEnabled: !share.sync_enabled,
                                      })
                                    }
                                  >
                                    {toggleShareMutation.isPending &&
                                    toggleShareMutation.variables?.shareId === share.id ? (
                                      <Loader2 className="size-4 animate-spin" />
                                    ) : null}
                                    {share.sync_enabled ? "Disable sync" : "Enable sync"}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `Remove share “${share.display_name}”? Mirrored files and indexed documents on this node will be deleted.`
                                        )
                                      ) {
                                        deleteShareMutation.mutate({ deviceId: device.id, shareId: share.id })
                                      }
                                    }}
                                  >
                                    {deleteShareMutation.isPending && deleteShareMutation.variables?.shareId === share.id ? (
                                      <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="size-4" />
                                    )}
                                    Remove share
                                  </Button>
                                </div>
                              </div>

                              {share.last_error ? (
                                <AppAlert variant="warning" className="mt-3">
                                  {share.last_error}
                                  {share.last_error_at ? ` · ${formatTimestamp(share.last_error_at)}` : ""}
                                </AppAlert>
                              ) : null}
                            </div>
                          ))
                        )}
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
