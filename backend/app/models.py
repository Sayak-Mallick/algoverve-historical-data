from datetime import datetime

from app.database import Base
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class User(Base):
    """An Algoverve account (the person using the app)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    broker_accounts: Mapped[list["BrokerAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class BrokerAccount(Base):
    """One broker connection (Upstox, Zerodha, ...) owned by one user."""

    __tablename__ = "broker_accounts"
    __table_args__ = (UniqueConstraint("user_id", "broker", name="uq_user_broker"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    broker: Mapped[str] = mapped_column(String(32))  # "upstox", "zerodha", ...
    broker_user_id: Mapped[str | None] = mapped_column(String(64))
    access_token: Mapped[str] = mapped_column(Text)  # encrypted
    refresh_token: Mapped[str | None] = mapped_column(
        Text
    )  # encrypted, if broker gives one
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="broker_accounts")
