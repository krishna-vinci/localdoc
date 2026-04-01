export interface Folder {
  id: string
  path: string
  name: string
  is_active: boolean
  device_id: string
  created_at: string
  updated_at: string
}

export interface FolderCreate {
  path: string
  name: string
  device_id?: string
}

export interface Document {
  id: string
  folder_id: string
  file_path: string
  file_name: string
  title: string
  content_hash: string
  content: string
  frontmatter: string | null
  tags: string | null
  size_bytes: number
  is_deleted: boolean
  device_id: string
  created_at: string
  updated_at: string
  indexed_at: string
}

export interface DocumentListItem {
  id: string
  folder_id: string
  file_name: string
  title: string
  tags: string | null
  updated_at: string
}

export interface SearchResult {
  id: string
  folder_id: string
  file_name: string
  title: string
  snippet: string | null
  tags: string | null
  updated_at: string
}

export interface Stats {
  document_count: number
  folder_count: number
  tag_count: number
}

export interface ScanSummary {
  indexed: number
  skipped: number
  errors: number
}
