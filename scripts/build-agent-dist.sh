#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
AGENT_DIR="$ROOT_DIR/agent"
OUTPUT_DIR=${LOCALDOCS_AGENT_OUTPUT_DIR:-$ROOT_DIR/backend/public/agent}
VERSION=${LOCALDOCS_AGENT_VERSION:-$(tr -d '\n' < "$ROOT_DIR/VERSION")}

if ! command -v go >/dev/null 2>&1; then
  printf 'error: go is required to build the LocalDocs CLI\n' >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

build_target() {
  target_os=$1
  target_arch=$2
  binary_name="localdocs"
  archive_ext="tar.gz"
  if [ "$target_os" = "windows" ]; then
    binary_name="localdocs.exe"
    archive_ext="zip"
  fi

  name="localdocs-${target_os}-${target_arch}"
  build_dir="$OUTPUT_DIR/$name"
  archive_path="$OUTPUT_DIR/${name}.${archive_ext}"

  mkdir -p "$build_dir"
  rm -f "$build_dir/$binary_name" "$archive_path"

  printf 'Building %s for %s/%s...\n' "$name" "$target_os" "$target_arch"

  cd "$AGENT_DIR"
  CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" go build -ldflags "-s -w -X main.agentVersion=$VERSION" -o "$build_dir/$binary_name" .

  cat > "$build_dir/README.txt" <<EOF
LocalDocs CLI

Contents:
- $binary_name

Quick start:
1. Install from your self-hosted server on macOS/Linux:
   curl -fsSL http://YOUR_SERVER_HOST:4320/api/v1/sync/agent/install.sh | sh

2. Pair the device:
   localdocs pair --server http://YOUR_SERVER_HOST:4320 --token YOUR_TOKEN

3. View and approve requests:
   localdocs pending
   localdocs approve REQUEST_ID

4. Run background sync:
   localdocs run --interval-seconds 30
EOF

  if [ "$target_os" = "windows" ]; then
    if ! command -v python3 >/dev/null 2>&1; then
      printf 'error: python3 is required to package the Windows archive\n' >&2
      exit 1
    fi
    python3 - <<PY
import pathlib
import zipfile
root = pathlib.Path(r"$OUTPUT_DIR")
folder = root / "$name"
archive = root / f"$name.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in folder.rglob("*"):
        zf.write(path, path.relative_to(root))
PY
  else
    tar -C "$OUTPUT_DIR" -czf "$archive_path" "$name"
  fi

  printf 'Created archive: %s\n' "$archive_path"
}

if [ "$#" -eq 0 ]; then
  build_target darwin amd64
  build_target darwin arm64
  build_target linux amd64
  build_target linux arm64
  build_target windows amd64
else
  if [ "$#" -ne 2 ]; then
    printf 'usage: %s [os arch]\n' "$0" >&2
    exit 1
  fi
  build_target "$1" "$2"
fi
