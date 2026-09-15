from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

from sqlalchemy import Column, String
from sqlmodel import SQLModel, Field


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    LOCKED = "LOCKED"
    DISABLED = "DISABLED"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    first_name: str = Field(max_length=80)
    last_name: str = Field(max_length=80)
    username: str = Field(max_length=50)
    username_normalized: str = Field(
        sa_column=Column(String(50), unique=True, index=True, nullable=False)
    )
    password_hash: str = Field(max_length=255)
    status: str = Field(default=UserStatus.ACTIVE.value, max_length=20, index=True)
    failed_login_count: int = Field(default=0)
    locked_until: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: Optional[datetime] = Field(default=None)
