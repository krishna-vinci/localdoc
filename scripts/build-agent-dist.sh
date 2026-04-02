#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
AGENT_DIR="$ROOT_DIR/agent"
OUTPUT_DIR="$AGENT_DIR/dist"

OS=${1:-linux}
ARCH=${2:-amd64}
VERSION=${LOCALDOCS_AGENT_VERSION:-dev}
NAME="localdocs-agent-${OS}-${ARCH}"
BUILD_DIR="$OUTPUT_DIR/$NAME"
ARCHIVE_PATH="$OUTPUT_DIR/${NAME}.tar.gz"

if ! command -v go >/dev/null 2>&1; then
  printf 'error: go is required to build the agent\n' >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"
rm -f "$BUILD_DIR/localdocs-agent" "$ARCHIVE_PATH"

printf 'Building %s for %s/%s...\n' "$NAME" "$OS" "$ARCH"

cd "$AGENT_DIR"
CGO_ENABLED=0 GOOS="$OS" GOARCH="$ARCH" go build -ldflags "-s -w -X main.agentVersion=$VERSION" -o "$BUILD_DIR/localdocs-agent" .

cat > "$BUILD_DIR/README.txt" <<EOF
LocalDocs thin agent

Contents:
- localdocs-agent

Quick start on the target device:
1. Install the binary:
   ./localdocs-agent show-config

2. Pair with your central node:
   ./localdocs-agent pair --server http://YOUR_SERVER_IP:4320 --token YOUR_TOKEN

3. Add a share:
   ./localdocs-agent add-share --path /path/to/markdown/folder --name docs

4. Run one sync:
   ./localdocs-agent sync-once

Or run continuously:
   ./localdocs-agent run --interval-seconds 30

Installer script in the repo can also install this archive:
  scripts/install-localdocs-agent.sh --archive $ARCHIVE_PATH
EOF

tar -C "$OUTPUT_DIR" -czf "$ARCHIVE_PATH" "$NAME"

printf 'Created archive: %s\n' "$ARCHIVE_PATH"
