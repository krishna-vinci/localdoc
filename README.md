# LocalDocs Hub

LocalDocs Hub brings scattered markdown files under one operational workspace. It indexes, searches, versions, and manages markdown that already lives across project folders, laptops, servers, and VMs, without relocating the source files.

**Stack:** Next.js 15, FastAPI, PostgreSQL, SQLAlchemy 2, Go CLI

## What it does

- Unified search across markdown files on connected devices
- Local-first storage with source files left in place
- Simple device pairing through the `localdocs` CLI
- Per-document versioning and recovery
- Read-only mirrored remote shares for central visibility
- Operational controls for indexing, sync, rebuilds, and diagnostics

## Quick start

### Get the code

```bash
git clone https://github.com/krishna-tb/localdocs-hub.git
cd localdocs-hub
```

### Configuration

First, set up your environment variables by copying the example file:

```bash
cp .env.example .env
```

Review and edit `.env` if you need to modify default credentials or allowed origins.

### Start the stack

```bash
docker compose up -d --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:4321 |
| Backend API | http://localhost:4320 |
| API docs | http://localhost:4320/docs |

### Build CLI distributions

```bash
./scripts/build-agent-dist.sh
```

Artifacts are written to `backend/public/agent/` for:

- macOS amd64
- macOS arm64
- Linux amd64
- Linux arm64
- Windows amd64

### Install the CLI on a remote device

macOS and Linux:

```bash
curl -fsSL http://YOUR_SERVER_HOST:4320/api/v1/sync/agent/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

Windows:

- extract `localdocs.exe` from `backend/public/agent/`
- run it from PowerShell or Command Prompt

### Pair a device

Generate a pairing token in the Devices page, then run:

```bash
localdocs pair --server http://YOUR_SERVER_HOST:4320 --token YOUR_TOKEN
```

## CLI reference

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

## Architecture

```text
Central node                     Remote devices
────────────────────             ──────────────────────
Next.js frontend          ←───   localdocs CLI
FastAPI backend                    pairing
PostgreSQL                         folder scan + hashing
metadata, index, versions          batched sync
search and sync coordination       heartbeat
```

Source files remain on the originating device. The central node keeps read-only mirrored copies for indexing and browsing.

## Why this project exists

File transport and document operations are different problems.

Tools like Syncthing move files reliably. Git versions files inside a repository. Neither provides centralized search, per-file recovery, device governance, or an operational view across markdown that spans many machines and many folders.

LocalDocs Hub addresses that gap with a central control plane and a thin device CLI. The goal is straightforward: keep markdown files where they belong, while making the overall system searchable, recoverable, and manageable.

## Status

LocalDocs Hub is in alpha. The architecture and direction are stable. Current work is focused on multi-device workflows, diagnostics, packaging, and sync hardening.

## Contributing

Contributions are welcome.

1. Read the project docs in `docs/`
2. Open an issue or discussion for larger changes
3. Keep changes focused and reviewable
4. Run tests, lint, and type checks before submitting

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`RELEASING.md`](RELEASING.md).

## License

[MIT](LICENSE)
