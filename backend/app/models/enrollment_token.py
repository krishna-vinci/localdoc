from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.device import Device


class EnrollmentToken(Base):
    __tablename__ = "enrollment_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    device_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    device: Mapped[Device | None] = relationship("Device", back_populates="enrollment_tokens")

    __table_args__ = (Index("ix_enrollment_tokens_expires_at", "expires_at"),)
