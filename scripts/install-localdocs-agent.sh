#!/usr/bin/env sh
set -eu

usage() {
  cat <<'EOF'
Install the LocalDocs CLI from a local archive or URL.

Usage:
  install-localdocs-agent.sh --archive /path/to/localdocs-linux-amd64.tar.gz
  install-localdocs-agent.sh --url https://host/path/localdocs-linux-amd64.tar.gz

Options:
  --archive PATH     Install from a local tar.gz archive
  --url URL          Download and install from a tar.gz URL
  --install-dir DIR  Destination directory (default: ~/.local/bin)
  --help             Show this help message
EOF
}

ARCHIVE_PATH=""
ARCHIVE_URL=""
INSTALL_DIR=${HOME}/.local/bin

while [ "$#" -gt 0 ]; do
  case "$1" in
    --archive)
      ARCHIVE_PATH=${2:-}
      shift 2
      ;;
    --url)
      ARCHIVE_URL=${2:-}
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR=${2:-}
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      printf 'error: unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -n "$ARCHIVE_PATH" ] && [ -n "$ARCHIVE_URL" ]; then
  printf 'error: use either --archive or --url, not both\n' >&2
  exit 1
fi

if [ -z "$ARCHIVE_PATH" ] && [ -z "$ARCHIVE_URL" ]; then
  printf 'error: one of --archive or --url is required\n' >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

if [ -n "$ARCHIVE_URL" ]; then
  ARCHIVE_PATH="$TMP_DIR/localdocs.tar.gz"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$ARCHIVE_URL" -o "$ARCHIVE_PATH"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$ARCHIVE_PATH" "$ARCHIVE_URL"
  else
    printf 'error: curl or wget is required to download the archive\n' >&2
    exit 1
  fi
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
  printf 'error: archive not found: %s\n' "$ARCHIVE_PATH" >&2
  exit 1
fi

mkdir -p "$TMP_DIR/extract" "$INSTALL_DIR"
tar -C "$TMP_DIR/extract" -xzf "$ARCHIVE_PATH"

BINARY_PATH=$(find "$TMP_DIR/extract" -type f -name localdocs | head -n 1)
if [ -z "$BINARY_PATH" ]; then
  printf 'error: localdocs binary not found in archive\n' >&2
  exit 1
fi

cp "$BINARY_PATH" "$INSTALL_DIR/localdocs"
chmod 755 "$INSTALL_DIR/localdocs"

printf 'Installed localdocs to %s/localdocs\n' "$INSTALL_DIR"

case ":$PATH:" in
  *":$INSTALL_DIR:"*)
    printf 'Run: localdocs config\n'
    ;;
  *)
    printf 'Add this to your shell profile if needed:\n'
    printf '  export PATH="%s:$PATH"\n' "$INSTALL_DIR"
    printf 'Then run: localdocs config\n'
    ;;
esac
