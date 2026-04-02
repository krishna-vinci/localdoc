# LocalDocs Hub

Local-first markdown operations for teams and individuals who want durable files, central visibility, and practical multi-device workflows.
Built with **Next.js 15, FastAPI, PostgreSQL, SQLAlchemy 2, and a Go CLI**.

## Overview

LocalDocs Hub is a central workspace for markdown that keeps files in their real locations while making them searchable, version-aware, and operationally manageable from one place.

It is designed for a common but under-served workflow: markdown files spread across folders, repositories, laptops, desktops, and servers, with no reliable way to unify search, recovery, device management, and cross-device visibility without introducing friction or lock-in.

## The problem

Markdown is a strong storage format. The surrounding workflow is usually weak.

In practice, teams and power users run into the same issues repeatedly:

- documents are scattered across many folders and devices
- search is fragmented and context-dependent
- file transport does not provide indexing, governance, or recovery
- versioning is inconsistent outside Git-centric paths
- sync and indexing failures are hard to inspect and repair

Tools like Syncthing solve transport well. They do not solve centralized indexing, document workflow, per-file recovery, device/share governance, or an operational control plane.

## The solution

LocalDocs Hub provides a central markdown workspace with a local-first architecture:

- original files stay on their source device
- a central node handles indexing, search, visibility, and operations
- remote devices connect through a thin native CLI
- device pairing is simple
- share approval is explicit
- mirrored remote shares are read-only on the central node
- indexed documents participate in versioning and recovery workflows

The result is a system that keeps markdown practical at scale without forcing a monolithic vault, proprietary storage, or a heavy application footprint on every machine.

## Core capabilities

- Centralized markdown search across local and remote shares
- Local-first storage with files kept in their original folders
- Simple device pairing through the `localdocs` CLI
- Central device and share management
- Read-only mirrored remote shares for safe central visibility
- Document versioning and recovery workflows
- Operational visibility for indexing, sync, rebuilds, and repair paths

## Architecture

### Central node
- Next.js frontend
- FastAPI backend
- PostgreSQL metadata and index store
- search, device registry, sync coordination, versions, and operations UI

### Remote devices
- lightweight native `localdocs` CLI
- pairing, folder scan, hashing, batching, sync, heartbeat, and approval actions

### Storage model
- source files remain on the originating device
- the central node keeps managed mirrored copies for indexing and browsing
- mirrored remote content is read-only in the current alpha design

## Quick start

### 1. Start the stack

From the repository root:

```bash
docker compose up -d
```

Default endpoints:

- Frontend: `http://localhost:4321`
- Backend API: `http://localhost:4320`
- API docs: `http://localhost:4320/docs`

### 2. Build CLI distributions

```bash
./scripts/build-agent-dist.sh
```

Artifacts are published under:

```text
backend/public/agent/
```

Default targets:

- macOS amd64
- macOS arm64
- Linux amd64
- Linux arm64
- Windows amd64

### 3. Install the CLI on a remote device

macOS / Linux:

```bash
curl -fsSL http://YOUR_SERVER_HOST:4320/api/v1/sync/agent/install.sh | sh
```

If needed:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Windows: extract `localdocs.exe` from the generated archive in `backend/public/agent/` and run it from PowerShell or Command Prompt.

### 4. Pair a device

Generate a pairing token in the Devices page, then run:

```bash
localdocs pair --server http://YOUR_SERVER_HOST:4320 --token YOUR_TOKEN
```

## CLI usage

```bash
localdocs config
localdocs shares
localdocs pending
localdocs approve REQUEST_ID
localdocs deny REQUEST_ID --message "Not approved on this device"
localdocs add-share --path /path/to/docs --name docs
localdocs sync
localdocs run --interval-seconds 30
```

## Why this project matters

LocalDocs Hub closes a real gap in markdown infrastructure:

- transport is not enough when you also need indexing, search, and recovery
- Git is not enough when documents live across many folders and devices
- a single-vault model is not enough when files must remain in real project locations

This project is intended to make markdown operationally credible in environments where simplicity, file ownership, and controlled device access matter.

## Development

### Backend

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 4320
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### CLI

```bash
cd agent
go build -o localdocs .
./localdocs config
```

## Status

LocalDocs Hub is currently **alpha**.

The core direction is stable. Current work is focused on deeper multi-device workflows, stronger diagnostics, packaging polish, and broader sync hardening.

## Contributing

Contributions are welcome.

If you want to contribute:

1. read the project docs in `docs/`
2. open an issue or discussion for larger changes
3. keep changes focused and reviewable
4. run relevant tests, lint, and type checks before submitting

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution guidelines.

Versioning and release flow are documented in [`RELEASING.md`](RELEASING.md).

## License

This project is licensed under the [MIT License](LICENSE).
