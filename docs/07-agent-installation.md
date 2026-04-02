# Thin Agent Installation

You do **not** need to clone the full LocalDocs repo on a remote device just to run the thin sync agent.

## Recommended private/LAN flow

### 1. Build an agent archive on the central node

From the repo root:

```bash
./scripts/build-agent-dist.sh linux amd64
```

This creates an archive like:

```bash
agent/dist/localdocs-agent-linux-amd64.tar.gz
```

You can also build for other targets by changing the two arguments:

```bash
./scripts/build-agent-dist.sh darwin arm64
./scripts/build-agent-dist.sh linux arm64
```

### 2. Copy the archive to the remote device

Example with `scp`:

```bash
scp agent/dist/localdocs-agent-linux-amd64.tar.gz user@REMOTE_HOST:/tmp/
```

### 3. Install the agent on the remote device

Run the installer script from this repo if it is available locally:

```bash
./scripts/install-localdocs-agent.sh --archive /tmp/localdocs-agent-linux-amd64.tar.gz
```

The binary is installed to:

```bash
~/.local/bin/localdocs-agent
```

If `~/.local/bin` is not in your `PATH`, add:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### 4. Pair the device

Use the Devices page in LocalDocs to generate a pairing token and copy the pair command.

Example:

```bash
localdocs-agent pair --server http://192.168.1.10:4320 --token YOUR_TOKEN
```

Use the **IP or hostname of the central node** that the remote device can actually reach.

### 5. Add a share and sync

```bash
localdocs-agent add-share --path /home/user/Documents/notes --name notes
localdocs-agent sync-once
```

Or run continuously:

```bash
localdocs-agent run --interval-seconds 30
```

## Notes

- The current installer is intended for **private repo / LAN / self-managed** setups.
- A future improvement can publish private release artifacts so remote devices can install directly from a URL.
