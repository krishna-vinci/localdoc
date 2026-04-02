# LocalDocs Hub

Your markdown files live everywhere — project folders, laptops, servers, VMs. LocalDocs Hub indexes, searches, and manages all of them from one place, without moving a single file.

Built with **Next.js 15 · FastAPI · PostgreSQL · SQLAlchemy 2 · Go CLI**

---

## What it does

- **Unified search** across every markdown file on every connected device
- **Local-first storage** — files stay exactly where they are, never relocated
- **Simple device pairing** via the `localdocs` CLI
- **Document versioning and recovery** with per-file history
- **Read-only mirrored remote shares** — central visibility without central ownership
- **Operational control plane** for indexing, sync, rebuilds, and diagnostics

---

## Quick start

### 1. Start the stack

```bash
docker compose up -d
```

| Service      | URL                            |
|--------------|--------------------------------|
| Frontend     | http://localhost:4321          |
| Backend API  | http://localhost:4320          |
| API docs     | http://localhost:4320/docs     |

### 2. Build CLI distributions

```bash
./scripts/build-agent-dist.sh
```

Outputs to `backend/public/agent/` for macOS (amd64/arm64), Linux (amd64/arm64), and Windows (amd64).

### 3. Install the CLI on a remote device

```bash
# macOS / Linux
curl -fsSL http://YOUR_SERVER_HOST:4320/api/v1/sync/agent/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

Windows: extract `localdocs.exe` from `backend/public/agent/` and run from PowerShell.

### 4. Pair a device

Generate a pairing token in the Devices page, then:

```bash
localdocs pair --server http://YOUR_SERVER_HOST:4320 --token YOUR_TOKEN
```

---

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

---

## Architecture

```
Central node                     Remote devices
────────────────────             ──────────────────────
Next.js frontend          ←───   localdocs CLI
FastAPI backend                    pairing
PostgreSQL (metadata,              folder scan + hashing
  index, versions)                 batched sync
search · device registry           heartbeat
sync coordination
```

Source files remain on the originating device. The central node keeps read-only mirrored copies for indexing and browsing.

---

## Why LocalDocs Hub exists

Transport tools like Syncthing move files reliably. Git handles versioning within a repo. Neither gives you centralized search, per-file recovery, device governance, or an operational view across everything at once.

LocalDocs Hub is built for markdown workflows that span real project folders across real machines — where a single vault model creates friction, and file ownership actually matters.

---

## Status

**Alpha.** Core direction is stable. Active work is focused on multi-device workflows, diagnostics, packaging, and sync hardening.

---

## Contributing

1. Read the project docs in `docs/`
2. Open an issue or discussion for larger changes
3. Keep changes focused and reviewable
4. Run tests, lint, and type checks before submitting

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`RELEASING.md`](RELEASING.md).

---

## License

[MIT](LICENSE)
