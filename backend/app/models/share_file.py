from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.device_share import DeviceShare


class ShareFile(Base):
    __tablename__ = "share_files"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    share_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("device_shares.id", ondelete="CASCADE"), nullable=False
    )
    relative_path: Mapped[str] = mapped_column(String(2048), nullable=False)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    modified_time_ns: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_seen_generation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    share: Mapped[DeviceShare] = relationship("DeviceShare", back_populates="files")

    __table_args__ = (
        UniqueConstraint("share_id", "relative_path", name="uq_share_files_share_path"),
        Index("ix_share_files_share_id", "share_id"),
    )
