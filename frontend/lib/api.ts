import type {
  Document,
  DocumentListItem,
  Folder,
  FolderCreate,
  ScanSummary,
  SearchResult,
  Stats,
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

export async function deleteFolder(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/folders/${id}`, { method: "DELETE" })
}

export async function scanFolder(id: string): Promise<ScanSummary> {
  return apiFetch<ScanSummary>(`/api/v1/folders/${id}/scan`, { method: "POST" })
}

// --- Documents ---

export async function getDocuments(folderId?: string): Promise<DocumentListItem[]> {
  const qs = folderId ? `?folder_id=${folderId}` : ""
  return apiFetch<DocumentListItem[]>(`/api/v1/documents/${qs}`)
}

export async function getDocument(id: string): Promise<Document> {
  return apiFetch<Document>(`/api/v1/documents/${id}`)
}

// --- Search ---

export async function searchDocuments(query: string): Promise<SearchResult[]> {
  return apiFetch<SearchResult[]>(
    `/api/v1/search/?q=${encodeURIComponent(query)}`
  )
}

// --- Stats ---

export async function getStats(): Promise<Stats> {
  return apiFetch<Stats>("/api/v1/stats/")
}
