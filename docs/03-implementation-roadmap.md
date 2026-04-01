# LocalDocs Hub

## Implementation Logic and Roadmap

### Phase 1: Local MVP
Goal: make one machine index and manage markdown folders safely.

Features:
- add folder paths manually
- watch file changes
- parse markdown
- extract frontmatter, headings, links, tags, tasks
- store everything in SQLite
- provide search API
- provide basic browser/UI or CLI

Implementation logic:
1. Watch selected directories.
2. On file change, read the file.
3. Parse markdown structure.
4. Compute hash and timestamps.
5. Update SQLite tables.
6. Refresh FTS search index.
7. Expose search and open-file API.

### Phase 2: Multi-Folder and Multi-Project Support
Goal: support many projects on one machine.

Features:
- project grouping
- folder permissions
- metadata templates
- dashboard views
- recent docs
- orphan docs
- duplicate detection

Implementation logic:
- each folder belongs to a project record
- each project can have custom metadata rules
- dashboards query the local index by folder and metadata

### Phase 3: Multi-Device Trust Network
Goal: connect multiple machines and VMs.

Features:
- device pairing
- encrypted sync
- peer trust lists
- selective folder replication
- remote search aggregation
- device health monitoring

Implementation logic:
1. Each device has a unique identity.
2. Devices pair through a local approval step.
3. The paired nodes exchange certificates or signed tokens.
4. Sync events are sent over encrypted channels.
5. Each node updates its local cache and index.

### Phase 4: Conflict-Safe Editing
Goal: prevent data loss across devices.

Features:
- version history
- concurrent edit detection
- conflict copies
- markdown-aware merge
- manual resolution UI
- change audit trail

Implementation logic:
- every file update gets a new version entry
- each version stores hash, device ID, and timestamp
- if remote version and local version diverge, mark conflict
- merge only when the parser confirms it is safe
- otherwise preserve both versions

### Phase 5: UI and Integrations
Goal: make it usable through Obsidian or a custom app.

Possible clients:
- Obsidian plugin
- custom note-taking app
- local browser app
- command-line interface

Implementation logic:
- backend exposes a stable local API
- frontend requests document list, search results, and file contents
- editing sends writes back through the backend, not directly through the UI
- backend updates file and index atomically where possible

### Phase 6: Hardening
Goal: make it production-grade.

Hardening tasks:
- encryption at rest for sensitive metadata
- signed sync events
- detailed audit logs
- rate limiting for API calls
- permissions by folder and device
- backup and restore flow
- recovery from partial corruption
- observability and health checks

### Database Design Sketch
Tables:
- devices(id, name, pubkey, status, last_seen)
- folders(id, device_id, path, project_name, permissions)
- files(id, folder_id, path, hash, size, mtime, current_version)
- file_versions(id, file_id, hash, device_id, created_at, content_ref)
- metadata(id, file_id, key, value)
- backlinks(id, source_file_id, target_file_id)
- search_terms(id, file_id, token)
- sync_events(id, device_id, event_type, payload, created_at)
- audit_logs(id, actor_device_id, action, target, created_at)

### API Sketch
Core endpoints:
- POST /folders/add
- POST /devices/pair
- GET /search?q=...
- GET /files/{id}
- PUT /files/{id}
- GET /projects
- GET /conflicts
- POST /conflicts/{id}/resolve
- GET /audit
- POST /reindex

### Markdown Parsing Logic
For each file:
- load content
- parse YAML frontmatter
- extract title from first heading if present
- collect headings
- collect tags
- collect links
- collect tasks
- compute content hash
- store extracted data

### Recommended First Build Order
1. Local folder watcher
2. SQLite schema
3. Markdown parser
4. Search API
5. Simple UI
6. Multi-folder support
7. Device pairing
8. Sync protocol
9. Conflict resolution
10. Obsidian plugin or custom app integration

### Robustness Checklist
- no silent overwrite
- no hidden file duplication
- no symlink dependency
- no cloud dependency by default
- no single point of failure for local mode
- explicit trust for every device
- recoverable indexes
- replayable event logs

### Final Product Vision
A user can open one central workspace and manage markdown files from many project folders across many devices, while the actual files remain where they belong and the system stays private, auditable, and robust.
