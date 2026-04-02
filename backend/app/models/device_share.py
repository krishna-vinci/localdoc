from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.share_file import ShareFile
    from app.models.sync_batch import SyncBatch


class DeviceShare(Base):
    __tablename__ = "device_shares"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    device_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_path: Mapped[str] = mapped_column(String(2048), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(2048), nullable=False)
    include_globs: Mapped[str | None] = mapped_column(Text, nullable=True)
    exclude_globs: Mapped[str | None] = mapped_column(Text, nullable=True)
    sync_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_snapshot_generation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    device: Mapped[Device] = relationship("Device", back_populates="shares")
    files: Mapped[list[ShareFile]] = relationship(
        "ShareFile", back_populates="share", cascade="all, delete-orphan"
    )
    batches: Mapped[list[SyncBatch]] = relationship(
        "SyncBatch", back_populates="share", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_device_shares_device_id", "device_id"),
        Index("ix_device_shares_last_sync_at", "last_sync_at"),
    )
