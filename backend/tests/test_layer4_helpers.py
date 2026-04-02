from app.services.folder_runtime import (
    AVAILABILITY_PERMISSION_DENIED,
    AVAILABILITY_SUSPECT_UNMOUNTED,
    WATCH_STATE_FAILED,
    classify_error_state,
)
from app.services.system_backup import BACKUP_SCHEMA_VERSION, validate_backup_payload


def test_classify_error_state_handles_permission_errors() -> None:
    watch_state, availability = classify_error_state("Permission denied while reading folder")
    assert watch_state == WATCH_STATE_FAILED
    assert availability == AVAILABILITY_PERMISSION_DENIED


def test_classify_error_state_handles_unmounted_roots() -> None:
    watch_state, availability = classify_error_state("Possible unmounted or misconfigured root")
    assert watch_state == WATCH_STATE_FAILED
    assert availability == AVAILABILITY_SUSPECT_UNMOUNTED


def test_validate_backup_payload_accepts_minimal_valid_shape() -> None:
    payload = {
        "metadata": {
            "schema_version": BACKUP_SCHEMA_VERSION,
            "app_version": "0.1.0-alpha.1",
            "generated_at": "2026-04-02T12:00:00+00:00",
        },
        "projects": [],
        "devices": [],
        "enrollment_tokens": [],
        "device_shares": [],
        "share_files": [],
        "sync_batches": [],
        "folders": [],
        "folder_runtime_states": [],
        "documents": [],
        "document_versions": [],
        "document_write_events": [],
    }

    result = validate_backup_payload(payload)

    assert result["valid"] is True
    assert result["errors"] == []


def test_validate_backup_payload_reports_missing_references() -> None:
    payload = {
        "metadata": {
            "schema_version": BACKUP_SCHEMA_VERSION,
            "app_version": "0.1.0-alpha.1",
            "generated_at": "2026-04-02T12:00:00+00:00",
        },
        "projects": [],
        "devices": [],
        "enrollment_tokens": [],
        "device_shares": [],
        "share_files": [],
        "sync_batches": [],
        "folders": [],
        "folder_runtime_states": [{"folder_id": "missing-folder"}],
        "documents": [{"id": "doc-1", "folder_id": "missing-folder"}],
        "document_versions": [{"id": "ver-1", "document_id": "missing-doc"}],
        "document_write_events": [{"id": "evt-1", "document_id": "missing-doc"}],
    }

    result = validate_backup_payload(payload)

    assert result["valid"] is False
    assert any("missing folder" in error for error in result["errors"])
    assert any("missing document" in error for error in result["errors"])
