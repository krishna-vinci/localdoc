"""Add devices, shares, sync batches, and remote mirror metadata

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=True),
        sa.Column("platform", sa.String(length=64), nullable=True),
        sa.Column("agent_version", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'approved'")),
        sa.Column("auth_token_hash", sa.String(length=64), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_devices_status", "devices", ["status"])
    op.create_index("ix_devices_last_seen_at", "devices", ["last_seen_at"])

    op.create_table(
        "enrollment_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("devices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("token_hash", name="uq_enrollment_tokens_token_hash"),
    )
    op.create_index("ix_enrollment_tokens_expires_at", "enrollment_tokens", ["expires_at"])

    op.create_table(
        "device_shares",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("source_path", sa.String(length=2048), nullable=False),
        sa.Column("storage_path", sa.String(length=2048), nullable=False),
        sa.Column("include_globs", sa.Text(), nullable=True),
        sa.Column("exclude_globs", sa.Text(), nullable=True),
        sa.Column("sync_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_snapshot_generation", sa.String(length=128), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_device_shares_device_id", "device_shares", ["device_id"])
    op.create_index("ix_device_shares_last_sync_at", "device_shares", ["last_sync_at"])

    op.create_table(
        "share_files",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "share_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("device_shares.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("relative_path", sa.String(length=2048), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("modified_time_ns", sa.BigInteger(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("last_seen_generation", sa.String(length=64), nullable=True),
        sa.Column("last_received_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("share_id", "relative_path", name="uq_share_files_share_path"),
    )
    op.create_index("ix_share_files_share_id", "share_files", ["share_id"])

    op.create_table(
        "sync_batches",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "share_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("device_shares.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("external_batch_id", sa.String(length=128), nullable=False),
        sa.Column("generation_id", sa.String(length=128), nullable=True),
        sa.Column("batch_kind", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'received'")),
        sa.Column("entry_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "device_id", "external_batch_id", name="uq_sync_batches_device_external_batch"
        ),
    )
    op.create_index("ix_sync_batches_share_id", "sync_batches", ["share_id"])
    op.create_index("ix_sync_batches_status", "sync_batches", ["status"])

    op.drop_constraint("folders_path_key", "folders", type_="unique")
    op.add_column(
        "folders",
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default=sa.text("'local'")),
    )
    op.add_column("folders", sa.Column("source_path", sa.String(length=2048), nullable=True))
    op.add_column("folders", sa.Column("storage_path", sa.String(length=2048), nullable=True))
    op.add_column(
        "folders",
        sa.Column(
            "source_share_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("device_shares.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "folders",
        sa.Column("is_read_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_folders_device_path", "folders", ["device_id", "path"])
    op.create_index("ix_folders_source_type", "folders", ["source_type"])


def downgrade() -> None:
    op.drop_index("ix_folders_source_type", table_name="folders")
    op.drop_index("ix_folders_device_path", table_name="folders")
    op.drop_column("folders", "is_read_only")
    op.drop_column("folders", "source_share_id")
    op.drop_column("folders", "storage_path")
    op.drop_column("folders", "source_path")
    op.drop_column("folders", "source_type")
    op.create_unique_constraint("folders_path_key", "folders", ["path"])

    op.drop_index("ix_sync_batches_status", table_name="sync_batches")
    op.drop_index("ix_sync_batches_share_id", table_name="sync_batches")
    op.drop_table("sync_batches")

    op.drop_index("ix_share_files_share_id", table_name="share_files")
    op.drop_table("share_files")

    op.drop_index("ix_device_shares_last_sync_at", table_name="device_shares")
    op.drop_index("ix_device_shares_device_id", table_name="device_shares")
    op.drop_table("device_shares")

    op.drop_index("ix_enrollment_tokens_expires_at", table_name="enrollment_tokens")
    op.drop_table("enrollment_tokens")

    op.drop_index("ix_devices_last_seen_at", table_name="devices")
    op.drop_index("ix_devices_status", table_name="devices")
    op.drop_table("devices")
