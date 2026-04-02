"""Add runtime state and background jobs

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "background_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("job_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("target_type", sa.String(length=64), nullable=True),
        sa.Column("target_id", sa.String(length=1024), nullable=True),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("progress_current", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("progress_total", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_background_jobs_status", "background_jobs", ["status"])
    op.create_index("ix_background_jobs_job_type", "background_jobs", ["job_type"])
    op.create_index("ix_background_jobs_created_at", "background_jobs", ["created_at"])

    op.create_table(
        "folder_runtime_states",
        sa.Column(
            "folder_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("folders.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("watch_state", sa.String(length=32), nullable=False, server_default=sa.text("'idle'")),
        sa.Column(
            "availability_state",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'unknown'"),
        ),
        sa.Column("last_checked_at", sa.DateTime(), nullable=True),
        sa.Column("last_event_at", sa.DateTime(), nullable=True),
        sa.Column("last_successful_scan_at", sa.DateTime(), nullable=True),
        sa.Column("last_full_reconcile_at", sa.DateTime(), nullable=True),
        sa.Column("consecutive_error_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_scan_summary", sa.Text(), nullable=True),
        sa.Column("degraded_since", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("folder_runtime_states")

    op.drop_index("ix_background_jobs_created_at", table_name="background_jobs")
    op.drop_index("ix_background_jobs_job_type", table_name="background_jobs")
    op.drop_index("ix_background_jobs_status", table_name="background_jobs")
    op.drop_table("background_jobs")
