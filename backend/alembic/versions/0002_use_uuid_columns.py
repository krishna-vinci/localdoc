"""Align folder/document IDs with UUID columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("documents_folder_id_fkey", "documents", type_="foreignkey")

    op.alter_column(
        "documents",
        "id",
        existing_type=sa.String(),
        type_=postgresql.UUID(as_uuid=False),
        postgresql_using="id::uuid",
    )
    op.alter_column(
        "documents",
        "folder_id",
        existing_type=sa.String(),
        type_=postgresql.UUID(as_uuid=False),
        postgresql_using="folder_id::uuid",
    )
    op.alter_column(
        "folders",
        "id",
        existing_type=sa.String(),
        type_=postgresql.UUID(as_uuid=False),
        postgresql_using="id::uuid",
    )

    op.create_foreign_key(
        "documents_folder_id_fkey",
        "documents",
        "folders",
        ["folder_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("documents_folder_id_fkey", "documents", type_="foreignkey")

    op.alter_column(
        "folders",
        "id",
        existing_type=postgresql.UUID(as_uuid=False),
        type_=sa.String(),
        postgresql_using="id::text",
    )
    op.alter_column(
        "documents",
        "folder_id",
        existing_type=postgresql.UUID(as_uuid=False),
        type_=sa.String(),
        postgresql_using="folder_id::text",
    )
    op.alter_column(
        "documents",
        "id",
        existing_type=postgresql.UUID(as_uuid=False),
        type_=sa.String(),
        postgresql_using="id::text",
    )

    op.create_foreign_key(
        "documents_folder_id_fkey",
        "documents",
        "folders",
        ["folder_id"],
        ["id"],
        ondelete="CASCADE",
    )
