from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UpstoxToken(Base):
    __tablename__ = "upstox_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    access_token: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
