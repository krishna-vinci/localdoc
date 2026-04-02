# LocalDocs Hub

## Thin Agent + Central Sync / Mirror / Index Architecture

### Status

Proposed architecture for the first multi-device expansion beyond the current single-node implementation.

### Decision summary

LocalDocs Hub will use a **central node plus thin native agents**.

The central node remains the main application:

- FastAPI backend
- PostgreSQL database
- Next.js frontend
- central search, indexing, device registry, sync coordination, and operations UI

Remote devices run a **small native binary agent**.

The thin agent only needs to:

- know which folders are shared
- scan those folders for markdown files
- detect changed or deleted files
- upload changed content to the central node
- keep a small retry spool while offline
- report basic health

The central node then:

- stores mirrored copies
- watches or rescans the mirror as a safety net
- queues targeted reindex after accepted uploads
- serves the unified UI and search experience

This model is optimized for:

- easy local deployment
- no Docker requirement on remote devices
- minimal agent footprint
- conservative sync behavior
- low operational complexity

---

## 1. Goals

### Primary goals

- support multiple local devices without requiring the full stack on every device
- keep the remote agent as small and simple as possible
- centralize indexing, search, sync state, and operations UI
- preserve source-device ownership of original files
- support offline queueing and replay
- keep deployment understandable for one user or a small trusted local setup

### Secondary goals

- reuse as much of the current repository as possible
- avoid early distributed-edit complexity
- keep a clean path toward richer sync and conflict handling later

---

## 2. Non-goals for the first multi-device release

This architecture does not attempt to provide, in its first version:

- peer-to-peer mesh sync
- automatic central-to-agent write-back
- distributed merge or conflict resolution
- real-time collaboration
- full local search/UI on every remote device
- attachments/object storage
- advanced enterprise permissions

Mirrored remote content is **read-only at the central node** in the first release.

---

## 3. Architecture principles

### 3.1 Source ownership stays local

Original markdown files remain on the source device.

The central node may keep a mirrored copy for indexing and browsing, but that mirror is not the original owner location.

### 3.2 The remote agent stays thin

Only the filesystem-adjacent work belongs on the remote device.

### 3.3 The central node does the heavy work

The current FastAPI + Postgres + Next.js app remains the primary product surface.

### 3.4 Local-only mode still matters

The current single-node app must remain fully useful even with no remote agents configured.

### 3.5 No silent overwrite

Any later write-back or distributed edit support must preserve explicit conflict handling. That is intentionally outside this first design.

---

## 4. High-level system model

### 4.1 Components

#### Central node
Runs the existing application stack and adds:

- device registry
- share registry
- sync ingest API
- replica storage root on disk
- background workers for mirror apply and reindex
- devices and sync health UI

#### Thin remote agent
Runs as a native binary on a remote device or VM.

Responsibilities:

- register with the central node
- maintain local share configuration
- perform initial full scan
- perform periodic reconcile scans
- optionally use native watch later for faster updates
- compute hashes
- upload changed and deleted markdown files
- keep a small spool for retries
- send heartbeat

#### Source filesystem
The user’s real markdown folders on the remote device.

#### Central replica filesystem
A managed mirror root on the central node used for indexing and recovery.

---

## 5. Responsibility split

### 5.1 Thin agent responsibilities

The agent should do only this:

- device identity and auth
- share configuration
- file enumeration
- change detection
- content hashing
- file upload and delete notifications
- offline spool and replay
- heartbeat and compact error reporting

The agent should **not** do this in the first release:

- markdown parsing
- search
- versions/audit history for global use
- local web UI
- heavy embedded database
- merge/conflict logic
- peer-to-peer sync

### 5.2 Central node responsibilities

The central node should do:

- pairing and trust approval
- share approval and disable/revoke
- receipt and persistence of sync batches
- mirrored file materialization
- targeted reindex after accepted uploads
- central watcher/reconcile on mirrored folders as a safety net
- search, browse, versions, audit, and operations UI
- replay, rebuild, and recovery controls

---

## 6. Deployment model

### 6.1 Central node

The central node can run on:

- a primary desktop
- a home server
- a local VM
- a dedicated private host on the LAN

Docker is acceptable here because it is the one heavier node.

### 6.2 Remote devices

Remote devices should only need:

- one native binary
- one small app-data directory
- optional service registration with the host OS

### 6.3 Service mode

Preferred remote execution modes:

- foreground CLI for setup and testing
- systemd service on Linux
- launchd service on macOS
- Windows service later

---

## 7. Sync strategy

### 7.1 Core strategy

Use a **push-only, hub-and-spoke** model.

- agents push to central
- central never needs inbound access to remote filesystems
- central remains the single UI/search point

### 7.2 Correctness strategy

The system should be **scan-first for correctness**.

That means:

- the agent does an initial full scan
- the agent does periodic reconcile scans
- native filesystem watching on the agent is optional later for lower latency

This avoids making correctness depend on watch-event delivery.

### 7.3 Mirroring strategy

The central node stores mirrored files under a managed root such as:

`/var/lib/localdocs/replicas/{device_id}/{share_id}/...`

The central node should:

- validate incoming relative paths
- write mirrored files atomically
- queue targeted reindex for changed paths
- optionally watch mirrored roots as a safety/recovery mechanism

The central node should **not** rely only on its mirror watcher to detect freshly uploaded files.

---

## 8. Protocol design

### 8.1 Transport

Use:

- HTTPS
- JSON payloads
- gzip compression where helpful

Do not start with:

- gRPC
- peer discovery protocols
- peer-to-peer sockets
- control-plane dependencies outside the central node

### 8.2 Pairing flow

Recommended first version:

1. User creates a one-time enrollment token in the central UI.
2. Agent starts with central URL and token.
3. Agent exchanges token for a long-lived device credential.
4. Central marks the device as pending or approved.
5. User approves the device in the central UI if approval is not automatic.

### 8.3 Security baseline

Minimum recommended security for the first release:

- outbound-only agent connections
- HTTPS transport
- per-device token or equivalent credential
- explicit device approval
- explicit device revocation
- audit trail for pairing and revocation actions

More advanced options like mTLS and signed payload chains can come later.

---

## 9. Suggested API surface

All routes stay under `/api/v1/`.

### 9.1 Agent-facing endpoints

#### Enrollment and health
- `POST /api/v1/agents/enroll`
- `POST /api/v1/agents/heartbeat`
- `GET /api/v1/agents/config`

#### Share management
- `POST /api/v1/agents/shares/upsert`
- `POST /api/v1/agents/shares/{share_id}/disable`

#### Sync ingest
- `POST /api/v1/agents/shares/{share_id}/snapshot/start`
- `POST /api/v1/agents/shares/{share_id}/batch`
- `POST /api/v1/agents/shares/{share_id}/snapshot/complete`

#### Replay/cursor
- `GET /api/v1/agents/shares/{share_id}/cursor`
- `POST /api/v1/agents/shares/{share_id}/cursor/ack`

### 9.2 Browser-facing endpoints

- `GET /api/v1/devices`
- `POST /api/v1/devices/{id}/approve`
- `POST /api/v1/devices/{id}/revoke`
- `GET /api/v1/sync/health`
- `GET /api/v1/sync/batches`
- `POST /api/v1/sync/rebuild/share/{share_id}`

---

## 10. Batch model

### 10.1 Why batches

Batch-based sync is easier to reason about than single-event chatty sync.

It also gives:

- easier idempotency
- easier replay
- better backoff behavior
- lower request overhead

### 10.2 Minimal batch shape

Each batch should include:

- `batch_id`
- `generation_id`
- `device_id`
- `share_id`
- entries array

Each entry should be one of:

- `upsert`
- `delete`

Suggested entry shape:

```json
{
  "op": "upsert",
  "path": "docs/intro.md",
  "size_bytes": 1823,
  "mtime_ns": 1712000000000000000,
  "sha256": "abc123...",
  "content_b64": "..."
}
```

Delete example:

```json
{
  "op": "delete",
  "path": "docs/old.md"
}
```

### 10.3 Snapshot model

Use explicit snapshot boundaries for reconciliation:

- `snapshot/start`
- one or more `batch`
- `snapshot/complete`

At snapshot completion, the central node can safely mark previously known files not seen in that generation as deleted.

### 10.4 Simplifications for the first release

- rename/move is modeled as delete + upsert
- only `.md` and `.markdown` participate
- symlinks are skipped
- remote mirrored content is read-only in the UI

---

## 11. Central data model

### 11.1 Core tables

#### `devices`
Suggested fields:

- `id`
- `display_name`
- `hostname`
- `platform`
- `agent_version`
- `status`
- `last_seen_at`
- `approved_at`
- `revoked_at`
- `created_at`
- `updated_at`

#### `device_shares`
Suggested fields:

- `id`
- `device_id`
- `display_name`
- `source_path`
- `include_rules`
- `exclude_rules`
- `status`
- `last_snapshot_generation`
- `last_sync_at`
- `created_at`
- `updated_at`

#### `sync_batches`
Suggested fields:

- `id`
- `device_id`
- `share_id`
- `generation_id`
- `kind`
- `status`
- `received_at`
- `applied_at`
- `error_summary`

#### `share_files`
Suggested fields:

- `id`
- `share_id`
- `relative_path`
- `content_hash`
- `size_bytes`
- `mtime_ns`
- `deleted_at`
- `last_seen_generation`
- `last_received_at`

#### `device_sync_cursors`
Suggested fields:

- `id`
- `device_id`
- `share_id`
- `last_acked_batch_id`
- `last_acked_at`

### 11.2 Extending current document/folder modeling

The current `documents` table can remain the main search/index table.

Add source metadata such as:

- `source_type` (`local`, `remote_mirror`)
- `source_device_id`
- `source_share_id`
- `source_relative_path`

The folder/source side should also carry:

- `storage_path`
- `is_read_only`

This keeps current search and workspace APIs reusable.

---

## 12. Background job model

### 12.1 Why jobs are required

Agent ingest should be fast.

Mirror apply and indexing can take longer and should not block agent uploads.

### 12.2 Recommended job types

- `agent_batch_ingest`
- `mirror_apply`
- `mirror_reindex_paths`
- `share_full_reconcile`
- `device_replay`
- `device_revocation_cleanup`

### 12.3 Execution model

Use:

- DB-backed job records
- in-process async workers at first
- bounded concurrency
- retry with capped backoff

Avoid Redis/Celery until throughput proves it necessary.

### 12.4 Ordering model

- ordering must be preserved within a single device/share stream
- work may run concurrently across different device/share streams
- invalid cursor or out-of-order situations must be visible and recoverable

---

## 13. Thin agent design

### 13.1 Required behaviors

- read local config and device state
- enumerate markdown files in approved shares
- compute file metadata and hashes
- maintain a small manifest/checkpoint view
- upload changes and deletions in batches
- retry failed uploads with backoff
- keep replayable local spool while central is unavailable
- send heartbeat

### 13.2 Local state expectations

The agent should keep only a minimal durable state directory containing:

- config
- device credential
- share definitions
- file manifest/checkpoints
- pending batches
- compact logs

SQLite is acceptable if it makes spool/checkpoint logic easier, but the agent should not need a heavy embedded data model.

### 13.3 Language recommendation

Prefer **Go** for the first agent implementation.

Why:

- easy cross-platform single-binary packaging
- low deployment friction
- good standard library support for HTTP/TLS
- low implementation risk

Rust is also viable, especially for lower memory use, but likely slows delivery.

### 13.4 Expected footprint

Realistic expectations:

#### Go agent
- binary size: roughly **8–20 MB** stripped
- idle RSS: roughly **15–40 MB**

#### Rust agent
- binary size: roughly **6–18 MB** stripped
- idle RSS: roughly **8–30 MB**

#### Python packaged agent
- much larger disk and memory footprint
- worse fit for the “small native agent” goal

Sub-megabyte RAM usage is not realistic for this job.

---

## 14. UI surfaces on the central node

### 14.1 Devices page

Show:

- device name
- platform
- version
- status
- last seen
- assigned shares
- approve/revoke actions

### 14.2 Sync health page

Show:

- pending and failed batches
- lag per device/share
- last successful apply
- last successful heartbeat
- stale/offline warnings
- forced resync controls

### 14.3 Search and document views

Show clearly:

- local vs mirrored source
- source device
- source share/folder path
- read-only mirrored status

Users must always know where a file really comes from.

---

## 15. Edge cases and failure handling

### 15.1 Agent-side cases

- central offline
- agent offline for long periods
- file changes during upload
- file deleted before queued upload finishes
- local permission error
- partial batch failure
- duplicated retry after timeout

### 15.2 Central-side cases

- duplicate batch replay
- out-of-order batch delivery
- invalid cursor
- path traversal attempts
- mirror disk full
- DB failure after mirror write
- reindex failure after successful mirror apply
- device revoked while batches are in flight

### 15.3 Filesystem cases

- rename/move
- temporary editor files
- deeply nested paths
- invalid UTF-8
- case sensitivity differences
- symlinks or junctions

### 15.4 Recommended first-release behaviors

- treat rename as delete + upsert
- skip symlinks
- reject unsafe relative paths
- use hash as the real content identity and timestamps only as optimization
- if mirror write succeeds but indexing fails, mark reindex pending rather than silently dropping state
- if a full snapshot completes, missing files become deletions for that generation

---

## 16. Rollout plan

### Milestone 1 — Layer 4 readiness

Before remote agents, the central node must already have:

- persistent health state
- DB-backed jobs
- rebuild and recovery flows
- operations UI basics

### Milestone 2 — Device registry

- add devices schema
- add enroll/approve/revoke flow
- add heartbeat
- add devices UI

### Milestone 3 — Batch ingest and replay

- add sync batch schema
- add idempotent ingest
- add cursor/checkpoint handling

### Milestone 4 — Mirror apply and indexing

- add replica storage root
- write mirror apply service
- queue targeted reindex after accepted upload
- surface mirrored docs in search and workspace

### Milestone 5 — Thin agent MVP

- Go prototype
- enroll command
- add-share command
- sync-once command
- service/run mode with periodic reconcile and replay

### Milestone 6 — Controlled rollout

- one remote device
- one real folder
- offline/reconnect validation
- revoke/resync validation

### Milestone 7 — Optional latency optimization

- add native watch support on the agent if periodic scan latency is not good enough

---

## 17. Rollout criteria

### Ready for internal testing

- one remote agent can enroll and be approved
- one share can sync to central
- mirrored documents appear in central search
- sync backlog and failures are visible in UI

### Ready for limited real use

- offline replay works reliably
- duplicate delivery is harmless
- revocation blocks further sync
- forced resync works
- mirrored documents are clearly labeled read-only

### Not ready if any of these are true

- ordering is unreliable within one device/share stream
- mirror apply can silently lose updates
- search cannot distinguish local vs mirrored content
- operators cannot see backlog or failures
- agent installation still feels like a dev setup instead of a product install

---

## 18. Final decision

The recommended first multi-device architecture for LocalDocs Hub is:

- **central FastAPI + Postgres + Next.js node**
- **thin native remote agent**
- **central mirrored file storage**
- **targeted reindex after accepted uploads**
- **central mirror watching only as a safety net**
- **no Docker required on remote devices**
- **read-only mirrored content in the first release**

This is the lowest-risk path to useful local multi-device support while keeping the remote agent as small and deployable as possible.
