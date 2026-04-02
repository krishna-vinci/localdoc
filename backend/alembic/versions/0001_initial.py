"""Initial migration

Revision ID: 0001
Revises:
Create Date: 2026-04-01

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create folders table
    op.create_table(
        'folders',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('path', sa.String(length=1024), nullable=False, unique=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('device_id', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Create documents table
    op.create_table(
        'documents',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('folder_id', sa.String(), sa.ForeignKey('folders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('file_path', sa.String(length=2048), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('title', sa.String(length=512), nullable=False),
        sa.Column('content_hash', sa.String(length=64), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('frontmatter', sa.Text(), nullable=True),
        sa.Column('tags', sa.String(length=512), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=False, default=0),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, default=False),
        sa.Column('device_id', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('indexed_at', sa.DateTime(), nullable=False),
    )

    op.create_index('ix_documents_folder_id', 'documents', ['folder_id'])
    op.create_index('ix_documents_content_hash', 'documents', ['content_hash'])
    op.create_index('ix_documents_file_path', 'documents', ['file_path'])


def downgrade() -> None:
    op.drop_index('ix_documents_file_path')
    op.drop_index('ix_documents_content_hash')
    op.drop_index('ix_documents_folder_id')
    op.drop_table('documents')
    op.drop_table('folders')
