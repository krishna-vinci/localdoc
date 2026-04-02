# LocalDocs CLI Installation

You do **not** need to clone the full LocalDocs repo on a remote device just to run the LocalDocs CLI.

## Recommended private/LAN flow

### 1. Build agent archives on the central node

From the repo root:

```bash
./scripts/build-agent-dist.sh
```

This builds the common self-host targets:

```bash
backend/public/agent/localdocs-darwin-amd64.tar.gz
backend/public/agent/localdocs-darwin-arm64.tar.gz
backend/public/agent/localdocs-linux-amd64.tar.gz
backend/public/agent/localdocs-linux-arm64.tar.gz
backend/public/agent/localdocs-windows-amd64.zip
```

You can still build a single target if you want:

```bash
./scripts/build-agent-dist.sh darwin arm64
./scripts/build-agent-dist.sh linux arm64
```

### 2. Install directly from your self-hosted server

Once those archives exist, the backend serves them automatically.

On the remote Mac or Linux machine, run:

```bash
curl -fsSL http://YOUR_SERVER_HOST:4320/api/v1/sync/agent/install.sh | sh
```

That script:
- detects macOS/Linux and CPU architecture automatically
- downloads the matching archive from your LocalDocs server
- installs `localdocs` into `~/.local/bin`

If `~/.local/bin` is not in your `PATH`, add:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### 3. Optional manual archive flow

If you prefer, you can still copy an archive manually:

```bash
scp backend/public/agent/localdocs-linux-amd64.tar.gz user@REMOTE_HOST:/tmp/
```

Then install it with:

```bash
./scripts/install-localdocs.sh --archive /tmp/localdocs-linux-amd64.tar.gz
```

### 4. Pair the device

Use the Devices page in LocalDocs to generate a pairing token and copy the pair command.

Example:

```bash
localdocs pair --server http://YOUR_SERVER_HOST:4320 --token YOUR_TOKEN
```

Use the **IP or hostname of the central node** that the remote device can actually reach.

### 5. Review pending requests, approve, and sync

The recommended flow is to create share requests from the central Devices page, then approve them on the remote device:

```bash
localdocs pending
localdocs approve REQUEST_ID
localdocs run --interval-seconds 30
```

You can also deny a request:

```bash
localdocs deny REQUEST_ID --message "Path not approved on this device"
```

You can still add a share directly from the CLI if you want:

```bash
localdocs add-share --path /home/user/Documents/notes --name notes
localdocs sync
```

Windows users can download `backend/public/agent/localdocs-windows-amd64.zip`, extract `localdocs.exe`, then use the same `pair`, `pending`, `approve`, `deny`, `sync`, and `run` commands from PowerShell or Command Prompt.

## Notes

- This is intended for **private repo / LAN / self-managed** setups.
- Remote devices no longer need the full repo clone just to install the CLI.
