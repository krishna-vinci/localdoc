"""Add device share requests

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "device_share_requests",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("source_path", sa.String(length=2048), nullable=False),
        sa.Column("include_globs", sa.Text(), nullable=True),
        sa.Column("exclude_globs", sa.Text(), nullable=True),
        sa.Column("sync_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("response_message", sa.Text(), nullable=True),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_device_share_requests_device_id", "device_share_requests", ["device_id"])
    op.create_index("ix_device_share_requests_status", "device_share_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_device_share_requests_status", table_name="device_share_requests")
    op.drop_index("ix_device_share_requests_device_id", table_name="device_share_requests")
    op.drop_table("device_share_requests")
