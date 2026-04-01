# LocalDocs Hub

## Technical Architecture

### System Overview
LocalDocs Hub is a distributed local-first document system.

It has six main layers:
1. File source layer
2. Device agent layer
3. Index layer
4. Sync layer
5. Control plane layer
6. UI layer

The actual markdown files remain in project folders on each machine.
The system indexes them, synchronizes approved changes, and exposes one central workspace.

### Architecture Principle
Do not make one machine the only source of truth unless you explicitly want that.
Instead, treat each device as a trusted node with local ownership of its files.

### Layer 1: File Source Layer
This is the real filesystem.
Examples:
- project repos
- docs folders
- VM-mounted directories
- user-selected folders anywhere on disk

Files stay in place.
The system only observes and manages them.

### Layer 2: Device Agent
Each machine runs a local agent.
Responsibilities:
- watch selected folders
- detect file changes
- parse markdown
- compute content hashes
- maintain local indexes
- expose a local API
- send sync events
- receive sync events
- enforce permissions

The agent should run on:
- Linux desktop
- macOS
- Windows
- VMs

### Layer 3: Index Layer
Use SQLite for durable local indexing.
Recommended tables:
- devices
- folders
- files
- file_versions
- frontmatter
- headings
- tags
- backlinks
- tasks
- sync_events
- permissions
- audit_logs

Recommended search engine:
- SQLite FTS5 for full-text search

What to index:
- file path
- title
- YAML frontmatter
- headings
- tags
- links
- task items
- file hash
- timestamps
- device ownership
- folder ownership

### Layer 4: Sync Layer
The sync layer moves change events and file content between trusted devices.

Recommended characteristics:
- encrypted transport
- authenticated devices
- selective folder sync
- resumable transfers
- idempotent event handling
- offline queueing
- conflict detection

Recommended sync event types:
- file_created
- file_updated
- file_deleted
- file_moved
- metadata_updated
- permission_updated
- device_joined
- device_revoked

### Layer 5: Control Plane
This is the central coordination layer.
It can run on one of the user’s devices or on a dedicated private server.

Responsibilities:
- unify indexes from all devices
- route search and open requests
- manage trusted devices
- manage permissions
- show sync health
- show conflicts
- provide API for clients

This layer should not be required for the system to function locally.
Each device should still work on its own.

### Layer 6: UI Layer
Possible clients:
- Obsidian plugin
- custom desktop app
- browser-based local app
- command-line interface

UI responsibilities:
- browse all documents
- search across devices
- filter by project, folder, tag, status, device
- open a real file
- edit a real file
- view backlinks and graph data
- resolve conflicts
- inspect history and audit logs

### Trust Model
Each device is individually trusted.
Recommended trust flow:
1. Device A generates identity keys.
2. Device B pairs with Device A.
3. Both sides exchange signed trust material.
4. Folder-level permissions are applied.
5. Sync begins only for approved folders.

### Security Model
Default assumptions:
- local-only API binds to localhost
- no public exposure
- all remote access is opt-in
- all device connections are authenticated
- all sync traffic is encrypted
- audit logs are retained locally

Recommended stronger options:
- mutual TLS between devices
- device certificates
- signed sync events
- encryption at rest for indexes and local caches
- per-folder read/write permissions

### Conflict Strategy
Conflicts will happen.
The system should never silently discard changes.

Recommended rules:
- keep file version history
- detect concurrent edits by hash and version
- if merge is safe, attempt markdown-aware merge
- if not safe, create a conflict copy
- surface conflicts clearly in the UI
- preserve both versions until user resolves them

### Failure Handling
The system must tolerate:
- a device going offline
- a VM being paused
- network interruption
- file watcher restarts
- partial sync completion
- index corruption

Recovery tools should include:
- reindex folder
- replay sync log
- rebuild local database
- resync from peer
- export audit trail
- restore old version

### Suggested Tech Stack
Backend:
- FastAPI or Node.js
- SQLite + FTS5
- filesystem watchers
- websocket or SSE updates

Desktop UI:
- Tauri or Electron
- or a local web app

Security:
- mTLS or signed device tokens
- local secret storage

Optional later:
- CRDTs for live collaboration
- object storage for attachments
- plugin SDK for integrations
