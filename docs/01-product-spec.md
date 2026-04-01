# LocalDocs Hub

## Product Idea Spec

### Summary
LocalDocs Hub is a local-first document management layer for markdown files spread across many project folders and multiple devices. It keeps the original files in place, but gives the user one central place to search, browse, edit, audit, and organize them.

The core promise is:
- files stay in their original project folders
- access is centralized through one private system
- the system works across multiple machines and VMs
- privacy is preserved by default
- the design is robust enough for personal and shared use

### Problem Statement
People who work with code and documentation usually have:
- markdown files scattered across multiple repos and folders
- docs spread across laptops, desktops, VMs, and sometimes servers
- no central search or organization layer
- awkward vaults, symlinks, or duplication hacks
- sync tools that create privacy or conflict risks

This becomes painful when:
- the same docs are needed from multiple devices
- project docs must remain inside project folders
- users want a single interface without moving their files
- local-only privacy is important

### Product Goals
1. Centralize access to markdown files without moving them.
2. Support multiple local devices and VMs.
3. Keep the system local-first and privacy-safe.
4. Make reads, writes, search, and navigation simple.
5. Provide a strong foundation for Obsidian integration or a custom editor.
6. Be robust enough to handle offline devices, conflicts, and folder-specific permissions.

### Non-Goals
- Not a cloud note app.
- Not a replacement for Git.
- Not a forced single vault model.
- Not a symlink-based workaround.
- Not a public remote storage service.

### User Experience Goal
A user should be able to:
- point the system at multiple folders on multiple devices
- see all markdown docs in one central workspace
- search across all files instantly
- open and edit the real file in its real location
- know which device owns which file
- see conflicts instead of losing changes
- keep everything private unless explicitly shared

### Product Shape
The product can ship in three forms:
1. Local web app
2. Desktop app
3. Obsidian plugin

The backend stays the same. Only the front-end changes.

### Core Capabilities
- folder onboarding
- unified search
- markdown parsing
- metadata indexing
- backlinks and graph view
- document dashboard
- edit in place
- version tracking
- conflict handling
- multi-device sync
- access control
- audit trail
- offline-first operation

### Target Users
- developers with multiple code projects
- teams wanting private local documentation management
- power users with multiple machines and VMs
- Obsidian users who want better multi-folder and multi-device control
- users who want local-only privacy

### Why This Is Better Than a Vault Hack
A vault hack tries to make one app pretend multiple folders are one storage area.
LocalDocs Hub treats storage, indexing, and UI as separate layers.
That makes it safer, more scalable, and much easier to extend.

### Success Criteria
- users can manage many markdown folders from one place
- no file duplication is needed for normal use
- edits are saved back to the real file
- search works across devices the user owns
- device trust and privacy controls are explicit
- conflicts are detectable and recoverable

### Recommended Positioning
"Private local document fabric for markdown projects."

This message communicates:
- local-first
- centralized access
- multi-device support
- privacy
- robustness
