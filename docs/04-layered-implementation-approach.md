# LocalDocs Hub

## Layered Implementation Approach

### Purpose
This document turns the original product idea, architecture, and roadmap into a layered delivery plan.

The goal is to:
- preserve the full vision without forcing all complexity into the first build
- build one useful layer at a time
- test each layer before expanding scope
- create explicit stop points where the project can pause before becoming too complex
- keep a clear path from local MVP to the full multi-device vision

This approach is designed so that the project can remain valuable even if development stops before the most advanced layers.

### Core Development Principles
- Files always stay in their original folders.
- Every layer must be useful on its own.
- No hidden duplication as part of normal use.
- No cloud dependency by default.
- Local mode must work without a central coordinator.
- No silent overwrite.
- Recovery must be possible when watchers, indexes, or sync fail.
- Add complexity only after the current layer is stable and clearly useful.

### How to Use This Plan
For every layer:
1. Implement only the scope of that layer.
2. Run the validation checklist.
3. Review whether the value gained justifies the next layer.
4. Decide whether to:
   - stop and polish
   - continue to the next layer
   - simplify the roadmap

---

## Layer 1 — Single-Device Local Indexing Foundation

### Goal
Make one machine safely index and expose markdown files from selected folders without moving them.

### Why This Layer Exists
This is the real core of the product. If this layer is not genuinely useful, the later layers are not worth pursuing.

### In Scope
- manual folder onboarding
- watching selected folders for file changes
- markdown parsing
- SQLite schema for core records
- FTS5 full-text search
- metadata extraction:
  - frontmatter
  - headings
  - tags
  - links
  - tasks
- file path, hash, timestamps, and source folder tracking
- local API for search and file read/open
- minimal UI or CLI for inspection and search

### Out of Scope for This Layer
- project grouping
- editing workflows
- multi-device support
- permissions and trust model
- conflict handling
- audit trail beyond basic logs
- advanced dashboards

### Implementation Focus
- build the folder registry
- build a reliable file scan and reindex flow
- build the parser pipeline
- build the SQLite data model and FTS index
- expose search and file retrieval through a stable local interface

### Validation Checklist
- add a folder and confirm all markdown files are indexed
- create, edit, rename, and delete markdown files and confirm the index updates correctly
- confirm search finds content, headings, and metadata reliably
- verify parser output on representative markdown fixtures
- run a full reindex and confirm the database rebuilds correctly
- confirm the app never moves the original files

### Success Criteria
- one machine can manage many markdown files in place
- search is fast and trustworthy
- extracted metadata is consistent
- reindexing recovers from missed watcher events
- the system is already useful as a local docs hub

### Stop / Go Decision
**Continue only if:**
- indexing is stable
- search quality is good enough for daily use
- reindex is dependable

**Stop here and polish if:**
- the main user value is already delivered by search and browse
- more complexity is not yet justified

### Recommended Output of This Layer
- a usable local search-and-browse tool for markdown folders on one machine

---

## Layer 2 — Single-Device Multi-Folder and Multi-Project Workspace

### Goal
Make the product useful for people with many repos, docs folders, and long-lived project collections on one machine.

### Why This Layer Exists
Layer 1 proves the indexing engine. Layer 2 turns it into a structured workspace instead of only a search utility.

### In Scope
- support many folders and many projects
- folder-to-project mapping
- project records and grouping
- filtering by:
  - project
  - folder
  - tag
  - status
- dashboard-style views:
  - recent docs
  - orphan docs
  - duplicate candidates
- clear file origin visibility
- optional metadata rules/templates per project or folder

### Out of Scope for This Layer
- device pairing
- remote search aggregation
- distributed sync
- distributed permissions
- conflict-safe editing across devices
- central control plane

### Implementation Focus
- strengthen the local data model for folder, file, and project relationships
- make the UI useful for large folder sets
- surface location and ownership clearly so users always know where a file lives
- keep the local structure compatible with later multi-device expansion

### Validation Checklist
- onboard multiple unrelated project folders
- verify search and filters remain fast with larger datasets
- confirm project grouping behaves correctly
- test recent/orphan/duplicate views with known fixtures
- verify metadata rules do not break indexing or search

### Success Criteria
- the workspace feels organized, not just searchable
- users can manage many projects without confusion
- folder/project structure is clear and maintainable
- the data model stays clean as scope grows

### Stop / Go Decision
**Continue only if:**
- local organization adds clear value beyond Layer 1
- the product feels better, not more cluttered

**Stop here and polish if:**
- single-machine use already solves the main pain point
- users mostly need a strong local workspace, not a networked system

### Recommended Output of This Layer
- a polished single-machine markdown workspace for many folders and projects

---

## Layer 3 — Local Editing Path and Atomic File/Index Updates

### Goal
Support safe in-place editing through the product while keeping file state and index state aligned.

### Why This Layer Exists
Search and browsing are valuable, but editing is where users start trusting the system as an actual workspace.

### In Scope
- open the real file through the backend
- edit and save the real file through the backend
- update file and index atomically where possible
- local version entries for every write
- basic local audit trail for writes
- write-precondition checks using hash/version awareness

### Out of Scope for This Layer
- cross-device write sync
- distributed conflict handling
- markdown-aware merge
- manual conflict resolution UI
- fine-grained access control
- enterprise-grade audit/compliance features

### Implementation Focus
- make the backend the trusted write path
- prevent silent overwrite during local edits
- keep file storage and search index in sync
- create minimal local history before moving into multi-device behavior

### Validation Checklist
- edit existing files and verify changes are reflected on disk and in search
- simulate interrupted writes and confirm recovery is safe
- verify version entries are created on each save
- confirm direct external edits are still picked up correctly by watchers
- validate read-after-write behavior through API and UI

### Success Criteria
- users can safely edit real files through the app
- file and index drift is rare and recoverable
- local history exists for rollback and inspection
- the product supports a real read/write workflow

### Stop / Go Decision
**Continue only if:**
- local writes are reliable
- users trust the edit path
- history is useful and understandable

**Stop here and polish if:**
- the project is already a complete local-first markdown workspace
- multi-device complexity is not yet proven necessary

### Recommended Output of This Layer
- a trustworthy local markdown workspace with safe in-place editing

---

## Layer 4 — Local Reliability, Recovery, and Operational Hardening

### Goal
Make the single-device product resilient before introducing distributed behavior.

### Why This Layer Exists
It is far better to harden local correctness now than to discover weaknesses after sync and conflicts are introduced.

### In Scope
- watcher failure detection and recovery
- manual reindex controls
- local database rebuild flow
- backup and restore for index/config
- crash-safe indexing pipeline
- health/status visibility
- error logging and observability basics
- performance testing on larger local datasets

### Out of Scope for This Layer
- multi-device event replay
- signed sync events
- control plane
- network permissions model
- distributed audit and recovery

### Implementation Focus
- make failure states visible instead of silent
- ensure users can recover without losing trust
- make rebuild/reindex operations normal, supported tools
- validate behavior under larger repositories and messy real-world folders

### Validation Checklist
- break watcher flow and confirm recovery paths work
- rebuild the index from scratch and confirm parity
- restore from backup and confirm state returns correctly
- test on large markdown collections
- confirm degraded states are shown clearly in the UI or logs

### Success Criteria
- the local system is operationally trustworthy
- recovery tools work in practice, not just on paper
- failures are diagnosable and reversible
- users can depend on the app for daily work

### Stop / Go Decision
**Continue only if:**
- local reliability is strong enough that adding sync will not multiply hidden problems

**Stop here and polish if:**
- the local app is already valuable enough as a finished product
- robustness work is delivering more value than new feature layers

### Recommended Output of This Layer
- a robust local-first product suitable for daily personal use

---

## Layer 5 — Multi-Device Trust and Basic Sync

### Goal
Connect multiple devices while preserving local ownership and explicit trust.

### Why This Layer Exists
Only start this layer after the local product is stable enough to deserve networked expansion.

### In Scope
- unique device identity per machine
- device pairing with explicit approval
- authenticated encrypted communication
- trusted-device registry
- selective folder sync or selective shared visibility
- sync event log
- offline queueing and replay
- remote search aggregation or federated index sharing
- sync health visibility

### Out of Scope for This Layer
- advanced conflict resolution
- safe automatic merges
- central control plane as a dependency
- fine-grained per-folder distributed permissions
- rich compliance-style audit flows

### Implementation Focus
- keep each device as the owner of its local files
- make sync explicit and selective
- ensure event handling is replayable and idempotent
- keep local-only mode fully functional when networking is unavailable

### Validation Checklist
- pair two devices and approve only selected folders
- make changes on one device and verify remote behavior
- take one device offline, change files, reconnect, and replay
- resend duplicate events and confirm idempotent handling
- revoke a device and confirm access stops appropriately
- verify remote search results clearly show source device/folder

### Success Criteria
- multi-device behavior works without breaking local trust or ownership
- offline interruption does not corrupt state
- paired devices are explicit and manageable
- remote search and basic sync add clear value

### Stop / Go Decision
**Continue only if:**
- users genuinely need cross-device workflows
- pairing and replay are reliable
- the system remains understandable after networking is introduced

**Stop here and polish if:**
- remote search and selective visibility solve most of the multi-device need
- full distributed editing still looks too risky or too expensive

### Recommended Output of This Layer
- a multi-device aware private markdown system with explicit trust and conservative sync

---

## Layer 6 — Conflict-Safe Distributed Editing

### Goal
Prevent data loss when the same file is changed across multiple devices.

### Why This Layer Exists
This is the point where the project shifts from a distributed index/search product into a true distributed editing system.

### In Scope
- version history across devices
- divergence detection using hashes and version lineage
- conflict marking
- conflict copies when merge is unsafe
- conservative markdown-aware merge when safe
- manual conflict resolution workflow
- conflict visibility in the UI

### Out of Scope for This Layer
- real-time collaboration
- CRDT-based editing
- aggressive auto-merge intelligence
- advanced workflow policy systems

### Implementation Focus
- enforce the rule that no change is silently discarded
- keep both sides when safety is uncertain
- attempt merge only under well-defined safe conditions
- make the resolution process inspectable and recoverable

### Validation Checklist
- simulate concurrent edits on two devices
- validate divergence detection for same-file updates
- verify unsafe merges create conflict copies instead of overwrites
- verify safe merge cases with controlled markdown fixtures
- confirm user conflict resolution produces a clean final state
- confirm history remains inspectable after resolution

### Success Criteria
- distributed editing is conservative and trustworthy
- users can understand conflicts and recover safely
- merge logic reduces manual work without hiding risk
- the product can support real-world cross-device writing

### Stop / Go Decision
**Continue only if:**
- users truly need multi-device write support, not just search and access
- conflict behavior is predictable and easy to audit

**Stop here and polish if:**
- merge and conflict complexity starts outweighing user value
- the simpler multi-device model is already enough for most workflows

### Recommended Output of This Layer
- a conservative distributed editing model with visible, recoverable conflicts

---

## Layer 7 — Control Plane, Permissions, and Advanced Hardening

### Goal
Add optional centralized coordination, stronger governance, and production-grade operational tools without breaking local-first behavior.

### Why This Layer Exists
This layer should refine an already working distributed system. It should not be required for the system to function.

### In Scope
- optional central coordination layer
- unified search routing across devices
- device health and trust management
- folder/device permissions
- audit log inspection
- replay sync log
- resync from peer
- restore older versions
- export audit trail
- stronger security options:
  - signed events
  - stronger auth
  - encryption at rest
  - rate limiting

### Out of Scope for This Layer
- plugin SDK
- attachments/object storage
- CRDT live collaboration
- broader ecosystem expansion beyond proven needs

### Implementation Focus
- keep the control plane optional, never the only way the system works
- improve visibility, governance, and recovery
- harden the product for private shared use and long-term maintenance

### Validation Checklist
- confirm local mode still works when the control plane is unavailable
- verify permission changes apply correctly
- simulate corrupted state and recover via rebuild/resync tools
- verify audit logs are complete for major actions
- confirm health views surface lag, offline devices, and failures

### Success Criteria
- failures are diagnosable and recoverable
- permissions are explicit
- central coordination improves the system without becoming a dependency
- the system is suitable for serious long-term use

### Stop / Go Decision
**Continue only if:**
- there is a real operational need for shared private use, governance, and stronger control

**Stop here and polish if:**
- personal or small trusted-device use remains the dominant case
- operational hardening beyond this point is no longer justified

### Recommended Output of This Layer
- a hardened private multi-device platform with optional coordination and recovery tooling

---

## Layer 8 — Client Expansion and Integration Layer

### Goal
Turn the backend into a stable platform that can support multiple client surfaces.

### Why This Layer Exists
By this stage the backend should be mature enough that additional clients are mostly product packaging and UX work, not core systems work.

### In Scope
- stable backend API
- browser-based local app
- desktop packaging
- optional Obsidian plugin
- better UI support for:
  - backlinks
  - graph data
  - conflicts
  - history
  - dashboards

### Out of Scope for This Layer
- broad plugin ecosystem
- non-markdown document expansion unless proven necessary
- real-time collaborative editing

### Implementation Focus
- keep business logic in the backend
- keep clients thin and consistent
- reuse the same semantics across web, desktop, and plugin surfaces

### Validation Checklist
- verify each client can browse, search, open, and edit safely
- verify conflict and history states are represented consistently
- verify API stability across clients
- verify UI-specific needs do not leak into the core backend model

### Success Criteria
- the backend supports multiple clients without fragmentation
- each client behaves like a view into one system
- frontend expansion no longer threatens core correctness

### Stop / Go Decision
**Continue only if:**
- there is clear demand for more than one client surface
- API stability is strong enough to support integrations

**Stop here and polish if:**
- one client already serves the main audience well
- extra clients would stretch maintenance too much

### Recommended Output of This Layer
- a stable platform with one or more polished client surfaces

---

## Recommended Stopping Points

### Best Early Stop: After Layer 2
You already have a useful product:
- local-first
- file-in-place
- searchable
- organized across projects

This is likely the best balance of value and complexity.

### Best Strong Product Stop: After Layer 4
You have:
- a robust local workspace
- safe local editing
- recovery tools

This is a very credible standalone product even without multi-device sync.

### Only Continue Beyond Layer 5 If Demand Is Proven
From Layer 5 onward the system becomes much more expensive to build and maintain.
That path is justified only if real users clearly need it.

---

## Cross-Layer Validation Rules
These rules should remain true throughout all layers:
- no file movement as part of normal operation
- no silent overwrite
- no hidden duplication
- no cloud dependency by default
- local mode remains functional without a control plane
- indexes are rebuildable
- event logs are replayable once sync exists
- device trust is explicit once multi-device support exists
- folder ownership and source are always visible

---

## Suggested Development Rhythm Per Layer

### Step 1 — Define the Layer Boundary
- write down exactly what is in scope
- write down exactly what is deferred

### Step 2 — Build the Core Flow
- implement the minimal end-to-end path for that layer
- avoid optional polish until the core flow works

### Step 3 — Test With Realistic Fixtures
- use real markdown folders and real repo-like structures
- test not just ideal paths, but failure paths

### Step 4 — Review User Value
- ask whether this layer makes the app materially more useful
- ask whether the next layer is solving a proven pain point

### Step 5 — Decide
- continue
- polish and stabilize
- stop at this layer as the product boundary

---

## Traceability: Mapping the Original Plan Into Layers

### Product Goals Coverage
- centralize access without moving files → Layers 1–2
- simple reads, writes, search, and navigation → Layers 1–4
- support multiple local devices and VMs → Layer 5
- privacy-safe and explicit trust → Layers 5 and 7
- conflicts are detectable and recoverable → Layer 6
- Obsidian/custom app support → Layer 8

### Architecture Coverage
- file source layer → all layers
- device agent layer → Layers 1–7
- index layer → Layers 1–4
- sync layer → Layers 5–7
- control plane layer → Layer 7
- UI layer → Layers 1–2 and 8

### Roadmap Coverage
- Phase 1: Local MVP → Layer 1
- Phase 2: Multi-folder and multi-project support → Layer 2
- local editing requirement implied by product goals → Layer 3
- hardening requirement implied by robustness goals → Layer 4
- Phase 3: Multi-device trust network → Layer 5
- Phase 4: Conflict-safe editing → Layer 6
- Phase 5: UI and integrations → Layer 8
- Phase 6: Hardening → Layer 7

### Feature Coverage
- folder onboarding → Layer 1
- unified search → Layers 1–2 and later multi-device search in Layer 5
- markdown parsing → Layer 1
- metadata indexing → Layers 1–2
- document dashboard → Layer 2
- edit in place → Layer 3
- version tracking → Layers 3 and 6
- audit trail → Layers 3 and 7
- recovery tools → Layer 4 and Layer 7
- multi-device sync → Layer 5
- conflict handling → Layer 6
- access control → Layer 7
- backlinks and graph view → foundational extraction in Layer 1, richer UX in Layer 8
- offline-first operation → Layer 1 locally, Layer 5 onward across devices

### Deferred but Not Forgotten
These remain optional future work after the layered core is proven:
- stronger security choices such as mTLS and advanced signing
- richer permissions and governance models
- plugin SDK
- attachments or object storage
- CRDTs or live collaboration

---

## Final Recommendation
The clearest development path is:
1. prove strong value locally
2. harden local correctness and recovery
3. expand to multi-device only if users clearly need it
4. treat conflict-safe distributed editing as an advanced stage, not a starting point

This preserves the full ambition of LocalDocs Hub while giving the project multiple sensible places to stop before complexity outweighs value.
