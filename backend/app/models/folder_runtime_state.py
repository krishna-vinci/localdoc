from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.folder import Folder


class FolderRuntimeState(Base):
    __tablename__ = "folder_runtime_states"

    folder_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("folders.id", ondelete="CASCADE"), primary_key=True
    )
    watch_state: Mapped[str] = mapped_column(String(32), nullable=False, default="idle")
    availability_state: Mapped[str] = mapped_column(
        String(32), nullable=False, default="unknown"
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_successful_scan_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_full_reconcile_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    consecutive_error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_scan_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    degraded_since: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    folder: Mapped[Folder] = relationship("Folder", back_populates="runtime_state")
