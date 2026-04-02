import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.device import Device
from app.schemas.sync import (
    AgentConfigResponse,
    AgentHeartbeatRequest,
    DeviceAuthResponse,
    DeviceEnrollRequest,
    DeviceResponse,
    DeviceShareRequestCreateRequest,
    DeviceShareRequestDecisionRequest,
    DeviceShareRequestResponse,
    DeviceShareResponse,
    DeviceShareUpdateRequest,
    DeviceShareUpsertRequest,
    EnrollmentTokenCreateRequest,
    EnrollmentTokenResponse,
    SnapshotCompleteRequest,
    SnapshotStartRequest,
    SyncBatchRequest,
    SyncBatchResponse,
    SyncHealthResponse,
)
from app.services.sync_service import (
    apply_snapshot_complete,
    apply_sync_batch,
    build_sync_health,
    create_enrollment_token,
    create_share_request,
    delete_device,
    delete_share,
    enroll_device,
    get_agent_distribution_root,
    get_authenticated_device,
    get_share_for_device,
    list_devices_with_counts,
    list_share_requests_for_device,
    list_shares_for_device,
    register_snapshot_start,
    respond_to_share_request,
    revoke_device,
    serialize_device,
    serialize_share,
    serialize_share_request,
    serialize_share_with_stats,
    set_share_sync_enabled,
    touch_device_heartbeat,
    upsert_share,
)

router = APIRouter()

SUPPORTED_AGENT_TARGETS = {
    ("darwin", "amd64"),
    ("darwin", "arm64"),
    ("linux", "amd64"),
    ("linux", "arm64"),
    ("windows", "amd64"),
}


def _agent_binary_name(target_os: str) -> str:
    return "localdocs.exe" if target_os == "windows" else "localdocs"


def _agent_archive_extension(target_os: str) -> str:
    return "zip" if target_os == "windows" else "tar.gz"


def _agent_archive_name(target_os: str, target_arch: str) -> str:
    return f"localdocs-{target_os}-{target_arch}.{_agent_archive_extension(target_os)}"


def _agent_archive_path(target_os: str, target_arch: str) -> Path:
    return get_agent_distribution_root() / _agent_archive_name(target_os, target_arch)


def _build_install_script(base_url: str) -> str:
    base_url = base_url.rstrip("/")
    return f'''#!/usr/bin/env sh
set -eu

detect_os() {{
  case "$(uname -s)" in
    Linux) printf 'linux' ;;
    Darwin) printf 'darwin' ;;
    *) printf 'unsupported' ;;
  esac
}}

detect_arch() {{
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *) printf 'unsupported' ;;
  esac
}}

OS=$(detect_os)
ARCH=$(detect_arch)

if [ "$OS" = unsupported ] || [ "$ARCH" = unsupported ]; then
  printf 'Unsupported platform: %s/%s\n' "$(uname -s)" "$(uname -m)" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
cleanup() {{
  rm -rf "$TMP_DIR"
}}
trap cleanup EXIT INT TERM

ARCHIVE_URL="{base_url}/api/v1/sync/agent/downloads/$OS/$ARCH"
ARCHIVE_PATH="$TMP_DIR/localdocs.tar.gz"
INSTALL_DIR="${{HOME}}/.local/bin"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$ARCHIVE_URL" -o "$ARCHIVE_PATH"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$ARCHIVE_PATH" "$ARCHIVE_URL"
else
  printf 'curl or wget is required\n' >&2
  exit 1
fi

mkdir -p "$TMP_DIR/extract" "$INSTALL_DIR"
tar -C "$TMP_DIR/extract" -xzf "$ARCHIVE_PATH"
BINARY_PATH=$(find "$TMP_DIR/extract" -type f -name localdocs | head -n 1)

if [ -z "$BINARY_PATH" ]; then
  printf 'Archive missing localdocs binary\n' >&2
  exit 1
fi

cp "$BINARY_PATH" "$INSTALL_DIR/localdocs"
chmod 755 "$INSTALL_DIR/localdocs"

printf 'Installed localdocs to %s/localdocs\n' "$INSTALL_DIR"

case ":$PATH:" in
  *":$INSTALL_DIR:"*)
    printf 'You can now run: localdocs config\n'
    ;;
  *)
    printf 'If needed, add this to your shell profile:\n'
    printf '  export PATH="%s:$PATH"\n' "$INSTALL_DIR"
    printf 'Then run: localdocs config\n'
    ;;
esac
'''


def _batch_summary_count(summary: str | None, key: str) -> int:
    if not summary:
        return 0
    try:
        parsed = json.loads(summary)
    except json.JSONDecodeError:
        return 0
    value = parsed.get(key)
    return value if isinstance(value, int) else 0


@router.get("/agent/install.sh", response_class=PlainTextResponse)
async def get_agent_install_script(request: Request) -> PlainTextResponse:
    return PlainTextResponse(_build_install_script(str(request.base_url).rstrip("/")))


@router.get("/agent/downloads/{target_os}/{target_arch}")
async def download_agent_archive(target_os: str, target_arch: str) -> FileResponse:
    normalized_target = (target_os.lower(), target_arch.lower())
    if normalized_target not in SUPPORTED_AGENT_TARGETS:
        raise HTTPException(status_code=404, detail="Unsupported agent target")

    archive_path = _agent_archive_path(*normalized_target)
    if not archive_path.exists() or not archive_path.is_file():
        archive_name = _agent_archive_name(*normalized_target)
        raise HTTPException(
            status_code=404,
            detail=(
                f"Agent archive {archive_name} is not available yet. "
                "Build it with ./scripts/build-agent-dist.sh from the repo root."
            ),
        )

    media_type = "application/zip" if normalized_target[0] == "windows" else "application/gzip"
    return FileResponse(path=archive_path, media_type=media_type, filename=archive_path.name)


@router.post(
    "/enrollment-tokens",
    response_model=EnrollmentTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_sync_enrollment_token(
    data: EnrollmentTokenCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> EnrollmentTokenResponse:
    token, raw_token = await create_enrollment_token(
        db,
        note=data.note,
        expires_in_minutes=data.expires_in_minutes,
    )
    return EnrollmentTokenResponse(
        id=token.id,
        token=raw_token,
        note=token.note,
        expires_at=token.expires_at,
        created_at=token.created_at,
    )


@router.get("/devices", response_model=list[DeviceResponse])
async def list_devices(db: AsyncSession = Depends(get_db)) -> list[DeviceResponse]:
    rows = await list_devices_with_counts(db)
    return [serialize_device(device, share_count=share_count) for device, share_count in rows]


@router.get("/devices/{device_id}/shares", response_model=list[DeviceShareResponse])
async def list_device_shares(device_id: str, db: AsyncSession = Depends(get_db)) -> list[DeviceShareResponse]:
    shares = await list_shares_for_device(db, device_id)
    return [await serialize_share_with_stats(db, share) for share in shares]


@router.get("/devices/{device_id}/share-requests", response_model=list[DeviceShareRequestResponse])
async def list_device_share_requests(
    device_id: str, db: AsyncSession = Depends(get_db)
) -> list[DeviceShareRequestResponse]:
    share_requests = await list_share_requests_for_device(db, device_id)
    return [serialize_share_request(item) for item in share_requests]


@router.post(
    "/devices/{device_id}/share-requests",
    response_model=DeviceShareRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_device_share_request(
    device_id: str,
    data: DeviceShareRequestCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> DeviceShareRequestResponse:
    share_request = await create_share_request(
        db,
        device_id=device_id,
        display_name=data.display_name,
        source_path=data.source_path,
        include_globs=data.include_globs,
        exclude_globs=data.exclude_globs,
        sync_enabled=data.sync_enabled,
    )
    return serialize_share_request(share_request)


@router.patch("/devices/{device_id}/shares/{share_id}", response_model=DeviceShareResponse)
async def update_device_share(
    device_id: str,
    share_id: str,
    data: DeviceShareUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> DeviceShareResponse:
    share = await set_share_sync_enabled(
        db,
        device_id=device_id,
        share_id=share_id,
        sync_enabled=data.sync_enabled,
    )
    return await serialize_share_with_stats(db, share)


@router.delete("/devices/{device_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_device_share(
    device_id: str,
    share_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    await delete_share(db, device_id=device_id, share_id=share_id)


@router.post("/devices/{device_id}/revoke", response_model=DeviceResponse)
async def revoke_sync_device(device_id: str, db: AsyncSession = Depends(get_db)) -> DeviceResponse:
    rows = await list_devices_with_counts(db)
    share_count_map = {device.id: share_count for device, share_count in rows}
    device = await revoke_device(db, device_id)
    return serialize_device(device, share_count=share_count_map.get(device.id, 0))


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sync_device(device_id: str, db: AsyncSession = Depends(get_db)) -> None:
    await delete_device(db, device_id=device_id)


@router.get("/health", response_model=SyncHealthResponse)
async def get_sync_health(db: AsyncSession = Depends(get_db)) -> SyncHealthResponse:
    return SyncHealthResponse.model_validate(await build_sync_health(db))


@router.post("/agents/enroll", response_model=DeviceAuthResponse)
async def agent_enroll(
    data: DeviceEnrollRequest,
    db: AsyncSession = Depends(get_db),
) -> DeviceAuthResponse:
    device, device_token = await enroll_device(
        db,
        enrollment_token=data.enrollment_token,
        display_name=data.display_name,
        hostname=data.hostname,
        platform=data.platform,
        agent_version=data.agent_version,
    )
    return DeviceAuthResponse(device_id=device.id, device_token=device_token, status=device.status)


@router.post("/agents/heartbeat", response_model=DeviceResponse)
async def agent_heartbeat(
    data: AgentHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
    device: Device = Depends(get_authenticated_device),
) -> DeviceResponse:
    rows = await list_devices_with_counts(db)
    share_count_map = {item.id: share_count for item, share_count in rows}
    updated = await touch_device_heartbeat(
        db,
        device,
        display_name=data.display_name,
        hostname=data.hostname,
        platform=data.platform,
        agent_version=data.agent_version,
    )
    return serialize_device(updated, share_count=share_count_map.get(updated.id, 0))


@router.get("/agents/config", response_model=AgentConfigResponse)
async def agent_config(
    db: AsyncSession = Depends(get_db),
    device: Device = Depends(get_authenticated_device),
) -> AgentConfigResponse:
    rows = await list_devices_with_counts(db)
    share_count_map = {item.id: share_count for item, share_count in rows}
    shares = await list_shares_for_device(db, device.id)
    share_requests = await list_share_requests_for_device(db, device.id, pending_only=True)
    return AgentConfigResponse(
        device=serialize_device(device, share_count=share_count_map.get(device.id, 0)),
        shares=[serialize_share(share) for share in shares],
        share_requests=[serialize_share_request(item) for item in share_requests],
    )


@router.post("/agents/share-requests/{request_id}/decision", response_model=DeviceShareRequestResponse)
async def agent_share_request_decision(
    request_id: str,
    data: DeviceShareRequestDecisionRequest,
    db: AsyncSession = Depends(get_db),
    device: Device = Depends(get_authenticated_device),
) -> DeviceShareRequestResponse:
    share_request, _ = await respond_to_share_request(
        db,
        device=device,
        request_id=request_id,
        approve=data.approve,
        response_message=data.response_message,
    )
    return serialize_share_request(share_request)


@router.post("/agents/shares/upsert", response_model=DeviceShareResponse)
async def agent_upsert_share(
    data: DeviceShareUpsertRequest,
    db: AsyncSession = Depends(get_db),
    device: Device = Depends(get_authenticated_device),
) -> DeviceShareResponse:
    share = await upsert_share(
        db,
        device=device,
        share_id=data.id,
        display_name=data.display_name,
        source_path=data.source_path,
        include_globs=data.include_globs,
        exclude_globs=data.exclude_globs,
        sync_enabled=data.sync_enabled,
    )
    return serialize_share(share)


@router.post("/agents/shares/{share_id}/snapshot/start", response_model=SyncBatchResponse)
async def agent_snapshot_start(
    share_id: str,
    data: SnapshotStartRequest,
    db: AsyncSession = Depends(get_db),
    device: Device = Depends(get_authenticated_device),
) -> SyncBatchResponse:
    share = await get_share_for_device(db, device=device, share_id=share_id)
    batch = await register_snapshot_start(
        db,
        device=device,
        share=share,
        batch_id=data.batch_id,
        generation_id=data.generation_id,
    )
    return SyncBatchResponse(
        status=batch.status,
        batch_id=batch.external_batch_id,
        applied_entries=0,
        generation_id=batch.generation_id,
    )


@router.post("/agents/shares/{share_id}/batch", response_model=SyncBatchResponse)
async def agent_apply_batch(
    share_id: str,
    data: SyncBatchRequest,
    db: AsyncSession = Depends(get_db),
    device: Device = Depends(get_authenticated_device),
) -> SyncBatchResponse:
    share = await get_share_for_device(db, device=device, share_id=share_id)
    batch = await apply_sync_batch(
        db,
        device=device,
        share=share,
        batch_id=data.batch_id,
        generation_id=data.generation_id,
        entries=[entry.model_dump() for entry in data.entries],
    )
    return SyncBatchResponse(
        status=batch.status,
        batch_id=batch.external_batch_id,
        applied_entries=_batch_summary_count(batch.summary, "applied_entries") or batch.entry_count,
        generation_id=batch.generation_id,
    )


@router.post("/agents/shares/{share_id}/snapshot/complete", response_model=SyncBatchResponse)
async def agent_snapshot_complete(
    share_id: str,
    data: SnapshotCompleteRequest,
    db: AsyncSession = Depends(get_db),
    device: Device = Depends(get_authenticated_device),
) -> SyncBatchResponse:
    share = await get_share_for_device(db, device=device, share_id=share_id)
    batch = await apply_snapshot_complete(
        db,
        device=device,
        share=share,
        batch_id=data.batch_id,
        generation_id=data.generation_id,
    )
    return SyncBatchResponse(
        status=batch.status,
        batch_id=batch.external_batch_id,
        applied_entries=_batch_summary_count(batch.summary, "removed"),
        generation_id=batch.generation_id,
    )
