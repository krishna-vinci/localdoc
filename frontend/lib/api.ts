import type {
  BackupFile,
  BackupValidation,
  BackgroundJob,
  Device,
  DeviceShare,
  DeviceShareRequest,
  Document,
  DocumentFilters,
  DocumentListItem,
  DocumentVersionDetail,
  DocumentVersionSummary,
  DocumentWriteEvent,
  Folder,
  FolderCreate,
  EnrollmentToken,
  SyncHealth,
  SystemHealth,
  SystemRuntime,
  Project,
  ProjectCreate,
  ScanSummary,
  SearchResult,
  Stats,
  WatchStatus,
} from "@/types"

const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4320"
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? PUBLIC_API_URL

function getBrowserApiUrl(): string {
  const configuredUrl = new URL(PUBLIC_API_URL)
  const currentHostname = window.location.hostname
  const isConfiguredLocalHost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(
    configuredUrl.hostname
  )

  if (isConfiguredLocalHost && !["localhost", "127.0.0.1"].includes(currentHostname)) {
    configuredUrl.hostname = currentHostname
  }

  return configuredUrl.toString().replace(/\/$/, "")
}

function getBaseUrl(): string {
  if (typeof window === "undefined") {
    return INTERNAL_API_URL.replace(/\/$/, "")
  }

  return getBrowserApiUrl()
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function toQueryString(params: object) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params) as Array<[
    string,
    string | number | boolean | undefined,
  ]>) {
    if (value === undefined || value === "") continue
    searchParams.set(key, String(value))
  }
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ""
}

// --- Projects ---

export async function getProjects(): Promise<Project[]> {
  return apiFetch<Project[]>("/api/v1/projects/")
}

export async function createProject(data: ProjectCreate): Promise<Project> {
  return apiFetch<Project>("/api/v1/projects/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateProject(id: string, data: Partial<ProjectCreate>): Promise<Project> {
  return apiFetch<Project>(`/api/v1/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteProject(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/projects/${id}`, { method: "DELETE" })
}

// --- Folders ---

export async function getFolders(): Promise<Folder[]> {
  return apiFetch<Folder[]>("/api/v1/folders/")
}

export async function createFolder(data: FolderCreate): Promise<Folder> {
  return apiFetch<Folder>("/api/v1/folders/", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateFolder(id: string, data: Partial<FolderCreate> & { is_active?: boolean }): Promise<Folder> {
  return apiFetch<Folder>(`/api/v1/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteFolder(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/folders/${id}`, { method: "DELETE" })
}

export async function scanFolder(id: string): Promise<ScanSummary> {
  return apiFetch<ScanSummary>(`/api/v1/folders/${id}/scan`, { method: "POST" })
}

export async function reindexFolders(): Promise<ScanSummary & { folders: number }> {
  return apiFetch<ScanSummary & { folders: number }>("/api/v1/folders/reindex-all", { method: "POST" })
}

export async function getWatchStatuses(): Promise<WatchStatus[]> {
  return apiFetch<WatchStatus[]>("/api/v1/folders/watch/status")
}

export async function rebuildFolder(id: string): Promise<BackgroundJob> {
  return apiFetch<BackgroundJob>(`/api/v1/folders/${id}/rebuild`, { method: "POST" })
}

export async function rebuildAllFolders(): Promise<BackgroundJob> {
  return apiFetch<BackgroundJob>("/api/v1/folders/rebuild-all", { method: "POST" })
}

// --- Documents ---

export async function getDocuments(filters: DocumentFilters = {}): Promise<DocumentListItem[]> {
  return apiFetch<DocumentListItem[]>(`/api/v1/documents/${toQueryString(filters)}`)
}

export async function getDocument(id: string): Promise<Document> {
  return apiFetch<Document>(`/api/v1/documents/${id}`)
}

export async function saveDocument(
  id: string,
  data: { raw_content: string; expected_content_hash: string; message?: string | null }
): Promise<Document> {
  return apiFetch<Document>(`/api/v1/documents/${id}/content`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function getDocumentVersions(id: string): Promise<DocumentVersionSummary[]> {
  return apiFetch<DocumentVersionSummary[]>(`/api/v1/documents/${id}/versions`)
}

export async function getDocumentVersion(
  id: string,
  versionId: string
): Promise<DocumentVersionDetail> {
  return apiFetch<DocumentVersionDetail>(`/api/v1/documents/${id}/versions/${versionId}`)
}

export async function restoreDocumentVersion(
  id: string,
  versionId: string,
  data: { expected_content_hash: string; message?: string | null }
): Promise<Document> {
  return apiFetch<Document>(`/api/v1/documents/${id}/restore/${versionId}`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function getDocumentAudit(id: string): Promise<DocumentWriteEvent[]> {
  return apiFetch<DocumentWriteEvent[]>(`/api/v1/documents/${id}/audit`)
}

export async function getOrphanDocuments(limit = 20): Promise<DocumentListItem[]> {
  return apiFetch<DocumentListItem[]>(`/api/v1/documents/insights/orphans${toQueryString({ limit })}`)
}

export async function getDuplicateDocuments(limit = 20): Promise<DocumentListItem[]> {
  return apiFetch<DocumentListItem[]>(`/api/v1/documents/insights/duplicates${toQueryString({ limit })}`)
}

// --- Search ---

export async function searchDocuments(
  query: string,
  filters: DocumentFilters = {},
  limit?: number
): Promise<SearchResult[]> {
  return apiFetch<SearchResult[]>(`/api/v1/search/${toQueryString({ q: query, ...filters, limit })}`)
}

// --- Stats ---

export async function getStats(): Promise<Stats> {
  return apiFetch<Stats>("/api/v1/stats/")
}

// --- System / Operations ---

export async function getSystemHealth(): Promise<SystemHealth> {
  return apiFetch<SystemHealth>("/api/v1/system/health")
}

export async function getSystemRuntime(): Promise<SystemRuntime> {
  return apiFetch<SystemRuntime>("/api/v1/system/runtime")
}

export async function triggerDriftCheck(): Promise<BackgroundJob> {
  return apiFetch<BackgroundJob>("/api/v1/system/drift-check", { method: "POST" })
}

export async function createSystemBackup(): Promise<BackgroundJob> {
  return apiFetch<BackgroundJob>("/api/v1/system/backup", { method: "POST" })
}

export async function getSystemBackups(): Promise<BackupFile[]> {
  return apiFetch<BackupFile[]>("/api/v1/system/backups")
}

export async function validateSystemBackup(backupName: string): Promise<BackupValidation> {
  return apiFetch<BackupValidation>("/api/v1/system/restore/validate", {
    method: "POST",
    body: JSON.stringify({ backup_name: backupName }),
  })
}

export async function restoreSystemBackup(backupName: string): Promise<BackgroundJob> {
  return apiFetch<BackgroundJob>("/api/v1/system/restore", {
    method: "POST",
    body: JSON.stringify({ backup_name: backupName }),
  })
}

export async function getSupportBundle(): Promise<unknown> {
  return apiFetch<unknown>("/api/v1/system/support-bundle")
}

export async function getJobs(status?: string, limit = 50): Promise<BackgroundJob[]> {
  return apiFetch<BackgroundJob[]>(`/api/v1/jobs/${toQueryString({ status, limit })}`)
}

export async function getJob(id: string): Promise<BackgroundJob> {
  return apiFetch<BackgroundJob>(`/api/v1/jobs/${id}`)
}

// --- Layer 5 Sync / Devices ---

export async function createEnrollmentToken(note?: string): Promise<EnrollmentToken> {
  return apiFetch<EnrollmentToken>("/api/v1/sync/enrollment-tokens", {
    method: "POST",
    body: JSON.stringify({ note: note || null, expires_in_minutes: 30 }),
  })
}

export async function getDevices(): Promise<Device[]> {
  return apiFetch<Device[]>("/api/v1/sync/devices")
}

export async function revokeDevice(id: string): Promise<Device> {
  return apiFetch<Device>(`/api/v1/sync/devices/${id}/revoke`, { method: "POST" })
}

export async function deleteDevice(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/sync/devices/${id}`, { method: "DELETE" })
}

export async function getDeviceShares(deviceId: string): Promise<DeviceShare[]> {
  return apiFetch<DeviceShare[]>(`/api/v1/sync/devices/${deviceId}/shares`)
}

export async function getDeviceShareRequests(deviceId: string): Promise<DeviceShareRequest[]> {
  return apiFetch<DeviceShareRequest[]>(`/api/v1/sync/devices/${deviceId}/share-requests`)
}

export async function createDeviceShareRequest(
  deviceId: string,
  data: {
    display_name: string
    source_path: string
    include_globs: string[]
    exclude_globs: string[]
    sync_enabled: boolean
  }
): Promise<DeviceShareRequest> {
  return apiFetch<DeviceShareRequest>(`/api/v1/sync/devices/${deviceId}/share-requests`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateDeviceShare(deviceId: string, shareId: string, syncEnabled: boolean): Promise<DeviceShare> {
  return apiFetch<DeviceShare>(`/api/v1/sync/devices/${deviceId}/shares/${shareId}`, {
    method: "PATCH",
    body: JSON.stringify({ sync_enabled: syncEnabled }),
  })
}

export async function deleteDeviceShare(deviceId: string, shareId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/sync/devices/${deviceId}/shares/${shareId}`, { method: "DELETE" })
}

export async function getSyncHealth(): Promise<SyncHealth> {
  return apiFetch<SyncHealth>("/api/v1/sync/health")
}
