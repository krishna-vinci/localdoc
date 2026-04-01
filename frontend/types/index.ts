export interface Project {
  id: string
  name: string
  description: string | null
  color: string | null
  metadata_rules: string | null
  default_template: string | null
  folder_count: number
  created_at: string
  updated_at: string
}

export interface ProjectCreate {
  name: string
  description?: string | null
  color?: string | null
  metadata_rules?: string | null
  default_template?: string | null
}

export interface Folder {
  id: string
  path: string
  name: string
  project_id: string | null
  project_name: string | null
  is_active: boolean
  watch_enabled: boolean
  device_id: string
  metadata_rules: string | null
  default_template: string | null
  created_at: string
  updated_at: string
}

export interface FolderCreate {
  path: string
  name: string
  device_id?: string
  project_id?: string | null
  watch_enabled?: boolean
  metadata_rules?: string | null
  default_template?: string | null
}

export interface Document {
  id: string
  folder_id: string
  folder_name: string | null
  project_id: string | null
  project_name: string | null
  file_path: string
  file_name: string
  title: string
  content_hash: string
  content: string
   raw_content: string
  frontmatter: string | null
  tags: string | null
  status: string | null
  headings: string | null
  links: string | null
  tasks: string | null
  task_count: number
  size_bytes: number
  is_deleted: boolean
  device_id: string
  created_at: string
  updated_at: string
  indexed_at: string
   version_counter: number
   file_exists: boolean
   disk_content_hash: string | null
   has_unindexed_changes: boolean
}

export interface DocumentListItem {
  id: string
  folder_id: string
  folder_name: string | null
  project_id: string | null
  project_name: string | null
  file_path: string
  file_name: string
  title: string
  tags: string | null
  status: string | null
  task_count: number
  updated_at: string
}

export interface SearchResult {
  id: string
  folder_id: string
  folder_name: string | null
  project_id: string | null
  project_name: string | null
  file_name: string
  title: string
  file_path: string
  snippet: string | null
  tags: string | null
  status: string | null
  task_count: number
  updated_at: string
}

export interface DocumentVersionSummary {
  id: string
  version_number: number
  change_type: string
  content_hash: string
  size_bytes: number
  created_at: string
}

export interface DocumentVersionDetail extends DocumentVersionSummary {
  content: string
}

export interface DocumentWriteEvent {
  id: string
  action: string
  actor: string
  previous_content_hash: string
  new_content_hash: string
  message: string | null
  created_at: string
}

export interface Stats {
  document_count: number
  folder_count: number
  project_count: number
  tag_count: number
  orphan_document_count: number
  duplicate_candidate_count: number
  watched_folder_count: number
}

export interface ScanSummary {
  indexed: number
  skipped: number
  errors: number
}

export interface WatchStatus {
  folder_id: string
  folder_name: string
  active: boolean
  watch_enabled: boolean
  last_checked_at: string | null
  last_event_at: string | null
  last_scan_at: string | null
  last_error: string | null
}

export interface DocumentFilters {
  folder_id?: string
  project_id?: string
  tag?: string
  status?: string
  orphaned?: boolean
}
