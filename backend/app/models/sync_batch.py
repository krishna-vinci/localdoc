from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.device_share import DeviceShare


class SyncBatch(Base):
    __tablename__ = "sync_batches"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    device_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False
    )
    share_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("device_shares.id", ondelete="CASCADE"), nullable=False
    )
    external_batch_id: Mapped[str] = mapped_column(String(128), nullable=False)
    generation_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    batch_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="received")
    entry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    device: Mapped[Device] = relationship("Device", back_populates="batches")
    share: Mapped[DeviceShare] = relationship("DeviceShare", back_populates="batches")

    __table_args__ = (
        UniqueConstraint(
            "device_id", "external_batch_id", name="uq_sync_batches_device_external_batch"
        ),
        Index("ix_sync_batches_share_id", "share_id"),
        Index("ix_sync_batches_status", "status"),
    )
