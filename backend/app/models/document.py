from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.folder import Folder


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    folder_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("folders.id", ondelete="CASCADE"), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(2048), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    frontmatter: Mapped[str] = mapped_column(Text, nullable=True)
    tags: Mapped[str] = mapped_column(String(512), nullable=True)
    status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    headings: Mapped[str | None] = mapped_column(Text, nullable=True)
    links: Mapped[str | None] = mapped_column(Text, nullable=True)
    tasks: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_count: Mapped[int] = mapped_column(Integer, default=0)
    size_bytes: Mapped[int] = mapped_column(default=0)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    device_id: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    indexed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    folder: Mapped[Folder] = relationship("Folder", back_populates="documents")

    __table_args__ = (
        Index("ix_documents_folder_id", "folder_id"),
        Index("ix_documents_content_hash", "content_hash"),
        Index("ix_documents_file_path", "file_path"),
        Index("ix_documents_status", "status"),
    )
