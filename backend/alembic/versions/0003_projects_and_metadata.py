"""Add projects and richer document metadata

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("metadata_rules", sa.Text(), nullable=True),
        sa.Column("default_template", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.add_column("folders", sa.Column("project_id", postgresql.UUID(as_uuid=False), nullable=True))
    op.add_column(
        "folders",
        sa.Column("watch_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("folders", sa.Column("metadata_rules", sa.Text(), nullable=True))
    op.add_column("folders", sa.Column("default_template", sa.Text(), nullable=True))
    op.create_foreign_key(
        "folders_project_id_fkey",
        "folders",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("documents", sa.Column("status", sa.String(length=100), nullable=True))
    op.add_column("documents", sa.Column("headings", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("links", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("tasks", sa.Text(), nullable=True))
    op.add_column(
        "documents",
        sa.Column("task_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_documents_status", "documents", ["status"])


def downgrade() -> None:
    op.drop_index("ix_documents_status", table_name="documents")
    op.drop_column("documents", "task_count")
    op.drop_column("documents", "tasks")
    op.drop_column("documents", "links")
    op.drop_column("documents", "headings")
    op.drop_column("documents", "status")

    op.drop_constraint("folders_project_id_fkey", "folders", type_="foreignkey")
    op.drop_column("folders", "default_template")
    op.drop_column("folders", "metadata_rules")
    op.drop_column("folders", "watch_enabled")
    op.drop_column("folders", "project_id")

    op.drop_table("projects")
