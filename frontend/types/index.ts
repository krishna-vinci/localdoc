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
  source_type: string
  source_path: string | null
  storage_path: string | null
  source_share_id: string | null
  is_read_only: boolean
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
  source_type: string
  source_path: string | null
  is_read_only: boolean
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
  source_type: string
  source_path: string | null
  is_read_only: boolean
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
  source_type: string
  source_path: string | null
  is_read_only: boolean
  device_id: string
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
  folder_path?: string
  active: boolean
  watch_enabled: boolean
  watch_state?: string
  availability_state?: string
  last_checked_at: string | null
  last_event_at: string | null
  last_scan_at: string | null
  last_full_reconcile_at?: string | null
  consecutive_error_count?: number
  last_error: string | null
  last_scan_summary?: ScanSummary | null
  degraded_since?: string | null
}

export interface DocumentFilters {
  folder_id?: string
  project_id?: string
  tag?: string
  status?: string
  orphaned?: boolean
  limit?: number
  skip?: number
}

export interface BackgroundJob {
  id: string
  job_type: string
  status: string
  target_type: string | null
  target_id: string | null
  payload: Record<string, unknown> | null
  summary: Record<string, unknown> | null
  error: string | null
  progress_current: number
  progress_total: number
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

export interface FolderRuntimeState {
  folder_id: string
  folder_name: string
  folder_path: string
  device_id: string
  active: boolean
  watch_enabled: boolean
  watch_state: string
  availability_state: string
  last_checked_at: string | null
  last_event_at: string | null
  last_successful_scan_at: string | null
  last_full_reconcile_at: string | null
  consecutive_error_count: number
  last_error: string | null
  last_scan_summary: ScanSummary | null
  degraded_since: string | null
}

export interface SystemHealth {
  app_version: string
  status: string
  database_status: string
  watcher_started: boolean
  job_runner_started: boolean
  active_folder_count: number
  watched_folder_count: number
  degraded_folder_count: number
  unavailable_folder_count: number
  queued_job_count: number
  running_job_count: number
  failed_job_count: number
  generated_at: string
}

export interface SystemRuntime {
  generated_at: string
  health: SystemHealth
  folders: FolderRuntimeState[]
}

export interface BackupMetadata {
  schema_version: number | null
  app_version: string | null
  generated_at: string | null
}

export interface BackupFile {
  name: string
  path: string
  size_bytes: number
  created_at: string
  metadata: BackupMetadata | null
}

export interface BackupValidation {
  backup_name: string
  valid: boolean
  errors: string[]
  warnings: string[]
  counts: Record<string, number>
  metadata: Record<string, unknown> | null
}

export interface EnrollmentToken {
  id: string
  token: string
  note: string | null
  expires_at: string
  created_at: string
}

export interface Device {
  id: string
  display_name: string
  hostname: string | null
  platform: string | null
  agent_version: string | null
  status: string
  last_seen_at: string | null
  approved_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
  share_count: number
}

export interface DeviceShare {
  id: string
  device_id: string
  display_name: string
  source_path: string
  storage_path: string
  include_globs: string[]
  exclude_globs: string[]
  sync_enabled: boolean
  last_snapshot_generation: string | null
  last_sync_at: string | null
  file_count: number
  active_file_count: number
  failed_batch_count: number
  last_error: string | null
  last_error_at: string | null
  created_at: string
  updated_at: string
}

export interface DeviceShareRequest {
  id: string
  device_id: string
  display_name: string
  source_path: string
  include_globs: string[]
  exclude_globs: string[]
  sync_enabled: boolean
  status: string
  response_message: string | null
  requested_at: string
  responded_at: string | null
  created_at: string
  updated_at: string
}

export interface SyncFailure {
  id: string
  external_batch_id: string
  batch_kind: string
  status: string
  entry_count: number
  share_id: string
  device_id: string
  device_name: string | null
  share_name: string | null
  source_path: string | null
  received_at: string | null
  applied_at: string | null
  error: string | null
}

export interface SyncHealth {
  device_count: number
  approved_device_count: number
  revoked_device_count: number
  stale_device_count: number
  share_count: number
  synced_share_count: number
  pending_batch_count: number
  failed_batch_count: number
  recent_batches: Array<Record<string, string | number | null>>
  recent_failures: SyncFailure[]
}
