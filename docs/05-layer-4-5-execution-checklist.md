# LocalDocs Hub

## Layer 4 and Layer 5 Execution Checklist

### Purpose

This document turns the Layer 4 and Layer 5 direction into an implementation checklist for this repository.

It is intentionally grounded in the current codebase:

- backend: FastAPI + SQLAlchemy async + Alembic + PostgreSQL
- frontend: Next.js 15 + TypeScript + shadcn/ui
- existing local capabilities already in repo:
  - folder registry
  - event-based watcher
  - recursive markdown scan and metadata extraction
  - search and workspace UI
  - safe local edit path with version snapshots and audit events

This checklist assumes the agreed product direction:

- Layer 4 hardens the current single-node app
- Layer 5 adds multi-device support with a central node and thin remote agent
- remote devices should not need Docker
- remote devices should only run a very small native sync agent
- the current FastAPI + Next.js app remains the central node

---

## Current Starting Point

### Backend capabilities already present

- folder CRUD and project mapping
- `watchfiles`-based folder watching
- recursive scan and reindex logic
- markdown parsing and metadata extraction
- safe document save path using atomic replace
- optimistic save precondition using content hash
- document versions and document write audit trail
- basic SSE sync stub

### Frontend capabilities already present

- dashboard, folders, projects, documents, and search pages
- folder watch status visibility
- manual scan and reindex controls
- document detail workspace with edit/preview/history/audit

### Current code areas most relevant to extend

#### Backend
- `backend/app/services/watcher.py`
- `backend/app/services/scanner.py`
- `backend/app/services/document_editor.py`
- `backend/app/api/folders.py`
- `backend/app/api/documents.py`
- `backend/app/api/sync.py`
- `backend/app/main.py`

#### Frontend
- `frontend/app/(app)/page.tsx`
- `frontend/app/(app)/folders/page.tsx`
- `frontend/app/(app)/documents/[id]/page.tsx`
- `frontend/app/(app)/documents/[id]/document-workspace.tsx`
- `frontend/components/app-shell.tsx`
- `frontend/components/app-sidebar.tsx`
- `frontend/lib/api.ts`
- `frontend/types/index.ts`

---

## Layer 4 — Local Reliability, Recovery, and Operational Hardening

### Goal

Make the current local system operationally trustworthy before introducing real networking or remote sync.

### In-scope Layer 4 outcome

By the end of Layer 4, the central/local app should have:

- persisted operational state
- DB-backed maintenance jobs
- startup reconciliation and drift detection
- explicit rebuild and recovery flows
- visible degraded states in the UI
- better logging and diagnostics
- confidence on larger markdown datasets

### Out of scope for Layer 4

- device pairing
- remote file mirroring
- remote agent deployment
- conflict-safe cross-device editing
- peer-to-peer sync

---

## Layer 4 Checklist

### A. Persist runtime and health state

#### A1. Add persistent runtime status
- [ ] Create a persistent runtime status model instead of relying only on in-memory status inside `FolderWatcher`
- [ ] Track at minimum per folder:
  - watch state (`watching`, `disabled`, `degraded`, `failed`)
  - availability state (`available`, `missing`, `permission_denied`, `suspect_unmounted`)
  - last event time
  - last successful scan time
  - last full reconcile time
  - consecutive error count
  - last error summary
  - degraded since
- [ ] Expose persisted state through a new API so the UI survives backend restarts

Suggested additions:
- model: `backend/app/models/folder_runtime_state.py`
- schemas under `backend/app/schemas/`
- service helpers under `backend/app/services/`
- migration in `backend/alembic/versions/`

#### A2. Persist system-level health
- [ ] Add a lightweight system runtime model for:
  - watcher service state
  - background worker state
  - DB health snapshot
  - recent fatal/recoverable errors
- [ ] Store compact summaries, not giant logs

#### A3. Separate watch failures from scan failures
- [ ] Keep watch registration failures distinct from file parse failures
- [ ] Record path missing, permission issues, scan partial failure, and targeted sync failure separately
- [ ] Do not collapse all problems into one generic watcher error string

---

### B. Introduce a DB-backed background job model

#### B1. Add a background jobs table
- [ ] Create `background_jobs` table
- [ ] Support job types:
  - `scan_folder`
  - `reindex_all`
  - `rebuild_folder`
  - `rebuild_all`
  - `startup_reconcile`
  - `drift_check`
  - `document_recovery_sync`
- [ ] Track:
  - status (`queued`, `running`, `succeeded`, `failed`, `cancelled`)
  - payload JSON
  - progress fields
  - compact result summary
  - error summary
  - timestamps

#### B2. Keep execution simple first
- [ ] Start with an in-process async worker started from FastAPI lifespan
- [ ] Use the DB table as source of truth
- [ ] Ensure jobs survive backend restarts
- [ ] Avoid Redis/Celery in Layer 4 unless clearly needed

#### B3. Idempotency and coalescing rules
- [ ] Retrying `scan_folder` must be safe
- [ ] Retrying `rebuild_folder` must be safe
- [ ] Duplicate queued scan jobs for the same folder should coalesce where reasonable
- [ ] Rebuild jobs should be mutually exclusive per folder

---

### C. Add startup reconciliation and drift detection

#### C1. Startup reconciliation
- [ ] On app startup, verify every active folder path before watching it
- [ ] If a path is missing, mark it unavailable instead of treating everything as deleted
- [ ] Run a lightweight reconcile job after startup for active folders

#### C2. Guard against accidental mass deletion
- [ ] Add explicit protection for unmounted or suddenly unavailable roots
- [ ] Never interpret a previously populated folder turning empty as immediate deletion without stronger confirmation
- [ ] Mark suspicious cases as `suspect_unmounted`
- [ ] Require later confirmed scan or manual recovery action before applying destructive state

#### C3. Add periodic drift detection
- [ ] Add a maintenance job that samples indexed docs versus on-disk content
- [ ] If drift is found, queue targeted sync or rebuild
- [ ] Surface drift count and last drift check time in the UI

---

### D. Harden the scanner and save path

#### D1. Scanner hardening
- [ ] Standardize error classification in `scanner.py`
- [ ] Record counts for:
  - indexed
  - skipped
  - soft-deleted
  - parse failed
  - permission failed
  - missing during read
- [ ] Persist scan summaries for later inspection

#### D2. Watcher hardening
- [ ] Persist watcher task lifecycle changes
- [ ] Retry watch registration with bounded backoff when safe
- [ ] Surface folders that are no longer actively watched

#### D3. Save-path recovery hardening
- [ ] Strengthen the post-write DB failure recovery path in `document_editor.py`
- [ ] Add explicit recovery audit events when a document is written to disk but requires DB re-sync
- [ ] Mark documents or folders as `recovery_pending` until a targeted sync clears them

#### D4. Maintain predictable conflict behavior
- [ ] Keep `409` save rejection behavior stable for stale `expected_content_hash`
- [ ] Add tests for stale save, missing file, and changed-on-disk cases

---

### E. Add rebuild, recovery, and backup flows

#### E1. Rebuild APIs
- [ ] Add folder-level rebuild endpoint
- [ ] Add all-folders rebuild endpoint
- [ ] Decide and document rebuild behavior:
  - soft rebuild: recreate document-derived state from live folders
  - hard rebuild: optional later, not required first

Suggested endpoints:
- [ ] `POST /api/v1/folders/{id}/rebuild`
- [ ] `POST /api/v1/folders/rebuild-all`

#### E2. Backup and restore support
- [ ] Add backup/export for app metadata and Postgres-backed index state
- [ ] Add restore validation flow
- [ ] After restore, require reconcile/rebuild before the system is marked healthy again

#### E3. Support bundle export
- [ ] Add a support/debug export that includes:
  - recent job summaries
  - runtime state
  - recent errors
  - app version and config summary with sensitive values omitted

---

### F. Layer 4 API surface

- [ ] `GET /api/v1/system/health`
- [ ] `GET /api/v1/system/runtime`
- [ ] `GET /api/v1/jobs`
- [ ] `GET /api/v1/jobs/{id}`
- [ ] `POST /api/v1/folders/{id}/rebuild`
- [ ] `POST /api/v1/folders/rebuild-all`
- [ ] `POST /api/v1/system/drift-check`
- [ ] `POST /api/v1/system/backup`
- [ ] `POST /api/v1/system/restore/validate`

Rules:
- [ ] keep error responses in the current `{"detail": "message"}` shape
- [ ] keep health responses compact and UI-friendly
- [ ] do not expose raw stack traces through API responses

---

### G. Frontend work for Layer 4

#### G1. Add an Operations surface
- [ ] Add a new top-level route such as `/operations` or `/settings/system`
- [ ] Show:
  - overall system health
  - degraded folders
  - active and recent jobs
  - recent failures
  - recovery actions

#### G2. Improve global shell visibility
- [ ] Add a small global health badge in `AppShell`
- [ ] Add a background activity indicator for running jobs
- [ ] Add non-intrusive warning state when the system is degraded

#### G3. Improve folders page
- [ ] Keep existing scan and watch controls
- [ ] Add rebuild action
- [ ] Add degraded badge
- [ ] Add missing-path / unavailable state
- [ ] Show last successful scan and last failed scan separately

#### G4. Improve document workspace drift handling
- [ ] Reuse existing `has_unindexed_changes`
- [ ] Add clear CTAs:
  - reload from disk
  - trigger containing folder rescan
  - show recovery pending state if relevant

#### G5. Show jobs clearly
- [ ] Poll jobs endpoint from frontend
- [ ] Show active jobs, failed jobs, and recent success summaries
- [ ] Do not require WebSocket or SSE for Layer 4 job UI

---

### H. Layer 4 testing checklist

#### Backend tests
- [ ] watcher startup with valid folders
- [ ] watcher startup with missing path
- [ ] file create/update/delete event handling
- [ ] startup reconcile after backend downtime
- [ ] rebuild after partial document-table corruption
- [ ] save rejection on stale content hash
- [ ] save recovery after simulated DB failure post-write
- [ ] job retry and restart behavior
- [ ] drift detection behavior
- [ ] mass-delete guard for unavailable root

#### Frontend tests
- [ ] operations page renders healthy, degraded, and failed states
- [ ] folders page shows runtime state and rebuild controls
- [ ] document workspace handles drift and missing file cleanly
- [ ] header health badge changes correctly

#### Manual validation
- [ ] large markdown set
- [ ] nested folders
- [ ] large files
- [ ] malformed frontmatter
- [ ] invalid UTF-8 replacement behavior
- [ ] rapid edit bursts
- [ ] backend restart during background jobs

---

### Layer 4 exit criteria

Layer 4 is done when:

- [ ] backend restarts no longer erase operational visibility
- [ ] watcher failure is visible and recoverable
- [ ] rebuild flows work for one folder and all folders
- [ ] save conflict and recovery behavior is predictable
- [ ] degraded states are visible in the UI
- [ ] large dataset validation has passed
- [ ] the team is comfortable operating the app daily before adding remote devices

---

## Layer 5 — Thin Agent + Central Sync / Mirror / Index

### Goal

Add multi-device support using a central-node model that keeps remote deployment easy:

- central node runs the full app
- remote devices run a tiny native agent
- remote agents sync selected markdown files to the central node
- central node materializes mirrored files and indexes them
- central node remains the only required UI/search surface

### Key product decision

For the first Layer 5 release:

- remote devices do not need Docker
- remote agents are outbound-only
- central node stores a mirrored copy of approved remote folders
- mirrored folders are read-only in the central UI
- central node should queue targeted reindex after each accepted upload
- central mirror watcher may exist as a safety net, but should not be the only freshness mechanism

### Out of scope for first Layer 5 release

- central-to-agent write-back
- automatic merge across devices
- peer-to-peer mesh sync
- live collaborative editing
- advanced per-folder distributed permissions

---

## Layer 5 Checklist

### A. Central schema and source modeling

#### A1. Add device registry
- [ ] Create `devices` table
- [ ] Track:
  - id
  - display name
  - hostname
  - platform
  - agent version
  - status (`pending`, `approved`, `offline`, `revoked`)
  - auth material reference
  - last seen time
  - approval and revocation timestamps

#### A2. Add remote share model
- [ ] Create `device_shares` table
- [ ] Track:
  - device id
  - display name
  - source path on device
  - include/exclude rules
  - status
  - last snapshot generation
  - last sync time

#### A3. Distinguish local folders from mirrored folders
- [ ] Extend folder/source modeling with fields like:
  - `source_type` (`local`, `remote_mirror`)
  - `source_device_id`
  - `source_share_id`
  - `source_path`
  - `storage_path`
  - `is_read_only`
- [ ] Keep local watcher assumptions from applying blindly to remote mirror folders

#### A4. Add sync state tables
- [ ] Create `sync_batches`
- [ ] Create `share_files`
- [ ] Add per-share cursor/checkpoint tracking
- [ ] Enforce idempotency with unique batch identifiers and external event identifiers where relevant

---

### B. Central backend implementation

#### B1. Replace the current sync stub
Current file:
- `backend/app/api/sync.py`

Replace it with real agent-facing APIs such as:
- [ ] `POST /api/v1/agents/enroll`
- [ ] `POST /api/v1/agents/heartbeat`
- [ ] `GET /api/v1/agents/config`
- [ ] `POST /api/v1/agents/shares/upsert`
- [ ] `POST /api/v1/agents/shares/{share_id}/snapshot/start`
- [ ] `POST /api/v1/agents/shares/{share_id}/batch`
- [ ] `POST /api/v1/agents/shares/{share_id}/snapshot/complete`

#### B2. Add a mirror-apply service
- [ ] Create a service that writes mirrored files into central storage
- [ ] Suggested storage root:
  - `/var/lib/localdocs/replicas/{device_id}/{share_id}/...`
- [ ] Validate and normalize every incoming relative path
- [ ] Reject traversal attempts and unsafe paths
- [ ] Treat rename/move as delete + upsert in first version

#### B3. Queue targeted reindex after ingest
- [ ] After accepting a batch, queue targeted reindex for changed paths
- [ ] Do not rely only on the central watcher to notice newly mirrored files
- [ ] Keep central watcher on mirrored roots only as recovery/safety support

#### B4. Reuse the existing document index
- [ ] Keep Postgres-backed `documents` as the central search source
- [ ] Extend document/source responses to show:
  - local vs mirrored
  - source device
  - source share/folder
- [ ] Avoid introducing a second search stack in Layer 5

---

### C. Thin agent v1 contract

#### C1. Keep the agent intentionally small
- [ ] no Docker dependency
- [ ] no local web UI
- [ ] no Postgres dependency
- [ ] no local search/index service in remote mode
- [ ] no merge/conflict engine

#### C2. Agent responsibilities
- [ ] store device identity and auth
- [ ] maintain configured shares
- [ ] perform initial full scan
- [ ] perform periodic reconciliation scan
- [ ] compute hashes only when file metadata indicates likely change
- [ ] upload changed and deleted markdown files
- [ ] keep a small local spool for retries
- [ ] send heartbeat and basic health

#### C3. Watcher strategy
- [ ] start with scan-first correctness
- [ ] use periodic full or partial reconciliation as the real safety net
- [ ] add native filesystem watching later only as a latency optimization if needed

#### C4. Minimal local agent state
- [ ] store under OS-native app-data path
- [ ] include:
  - config
  - auth token or key material
  - share manifest/checkpoints
  - pending batch spool
  - compact logs
- [ ] SQLite is acceptable for spool/state, but not required for search

---

### D. Layer 5 background jobs

Reuse the Layer 4 DB-backed job model.

#### D1. Central jobs
- [ ] `agent_batch_ingest`
- [ ] `mirror_apply`
- [ ] `mirror_reindex_paths`
- [ ] `share_full_reconcile`
- [ ] `device_replay`
- [ ] `device_revocation_cleanup`

#### D2. Ordering rules
- [ ] preserve ordering within one device/share stream
- [ ] allow concurrency across different devices/shares
- [ ] quarantine or fail clearly on invalid cursor or out-of-order cases

#### D3. Failure rules
- [ ] retry transient failures with bounded backoff
- [ ] keep failed batches inspectable
- [ ] allow explicit re-run or forced full resync from central UI

---

### E. Frontend work for Layer 5

#### E1. Devices page
- [ ] list devices
- [ ] show platform, version, status, last seen, and assigned shares
- [ ] allow approve/revoke actions

#### E2. Sync health page
- [ ] show per-device sync lag
- [ ] show pending and failed jobs
- [ ] show last successful heartbeat and last successful apply
- [ ] show offline/stale warnings clearly

#### E3. Search and document surfaces
- [ ] show source device in document list/detail/search results
- [ ] show source path and mirrored/read-only state
- [ ] do not imply that mirrored content is the original owner copy

#### E4. Share administration
- [ ] enable/disable approved remote shares centrally
- [ ] trigger resync or rebuild for one share
- [ ] inspect last batch summary and last error

---

### F. Thin agent implementation milestones

#### Milestone 5.1 — central registry and trust
- [ ] devices table
- [ ] enroll and approve flow
- [ ] heartbeat
- [ ] devices UI

#### Milestone 5.2 — central ingest foundation
- [ ] sync batch schema
- [ ] idempotent batch ingest endpoint
- [ ] cursor/checkpoint handling

#### Milestone 5.3 — mirror apply and indexing
- [ ] replica storage root
- [ ] mirror apply service
- [ ] targeted reindex after accepted batch
- [ ] search results show mirrored content correctly

#### Milestone 5.4 — thin agent MVP
- [ ] Go binary prototype
- [ ] pair/enroll command
- [ ] add-share command
- [ ] sync command
- [ ] service/run mode with periodic scan and replay

#### Milestone 5.5 — sync operations UI
- [ ] sync health page
- [ ] backlog/error visibility
- [ ] rebuild/resync controls

#### Milestone 5.6 — optional latency improvement
- [ ] add native filesystem watch on the agent side if periodic scan latency is not good enough

---

### G. Layer 5 testing checklist

#### Central/backend tests
- [ ] device enrollment and approval
- [ ] heartbeat updates `last_seen_at`
- [ ] duplicate batch replay is idempotent
- [ ] upsert and delete apply correctly to mirror storage
- [ ] targeted reindex runs after accepted batch
- [ ] central restart during queued apply/reindex work
- [ ] revoked device can no longer sync
- [ ] full share resync recreates mirrored state correctly

#### Agent integration tests
- [ ] first full sync of large share
- [ ] central offline during sync
- [ ] agent offline while files change
- [ ] reconnect and replay
- [ ] file changed during upload
- [ ] file deleted before queued upload finishes
- [ ] batch partially accepted then retried
- [ ] token revoked while agent is running

#### Frontend tests
- [ ] devices page empty, pending, approved, offline, revoked states
- [ ] sync health page with backlog and failures
- [ ] mixed local and mirrored search results are clearly labeled

---

### H. Rollout gates

#### Before starting Layer 5
- [ ] Layer 4 health and rebuild flows exist
- [ ] degraded state is visible in the UI
- [ ] job model survives restart
- [ ] save conflict behavior is already trusted

#### Before calling Layer 5 usable
- [ ] one remote device can join without Docker
- [ ] one approved remote share can mirror to central
- [ ] central search can find mirrored docs
- [ ] replay after offline period works
- [ ] duplicate delivery is harmless
- [ ] revoked device stops syncing
- [ ] mirrored documents are clearly marked read-only

---

## Recommended implementation order across both layers

1. persist runtime and watcher health
2. add DB-backed background jobs
3. add rebuild, drift detection, and recovery flows
4. add operations UI and global health visibility
5. add central `devices`, `device_shares`, and sync batch schema
6. replace sync stub with real agent API
7. implement mirror apply and targeted reindex
8. add devices and sync health UI
9. build thin native agent against the stable API
10. validate with one real remote device before expanding scope
