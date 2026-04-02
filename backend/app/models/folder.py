from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.folder_runtime_state import FolderRuntimeState
    from app.models.project import Project


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="local")
    source_path: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    source_share_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("device_shares.id", ondelete="SET NULL"), nullable=True
    )
    is_read_only: Mapped[bool] = mapped_column(Boolean, default=False)
    project_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    watch_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    device_id: Mapped[str] = mapped_column(String(255), nullable=False)
    metadata_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped[Project | None] = relationship("Project", back_populates="folders")
    documents: Mapped[list[Document]] = relationship(
        "Document", back_populates="folder", cascade="all, delete-orphan"
    )
    runtime_state: Mapped[FolderRuntimeState | None] = relationship(
        "FolderRuntimeState", back_populates="folder", cascade="all, delete-orphan", uselist=False
    )

    __table_args__ = (
        Index("ix_folders_device_path", "device_id", "path"),
        Index("ix_folders_source_type", "source_type"),
    )
