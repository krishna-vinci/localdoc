from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.device_share import DeviceShare
    from app.models.device_share_request import DeviceShareRequest
    from app.models.enrollment_token import EnrollmentToken
    from app.models.sync_batch import SyncBatch


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    platform: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agent_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="approved")
    auth_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    shares: Mapped[list[DeviceShare]] = relationship(
        "DeviceShare", back_populates="device", cascade="all, delete-orphan"
    )
    share_requests: Mapped[list[DeviceShareRequest]] = relationship(
        "DeviceShareRequest", back_populates="device", cascade="all, delete-orphan"
    )
    enrollment_tokens: Mapped[list[EnrollmentToken]] = relationship(
        "EnrollmentToken", back_populates="device", cascade="all, delete-orphan"
    )
    batches: Mapped[list[SyncBatch]] = relationship(
        "SyncBatch", back_populates="device", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_devices_status", "status"),
        Index("ix_devices_last_seen_at", "last_seen_at"),
    )
