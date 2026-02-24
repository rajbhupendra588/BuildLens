from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class AppSetting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: Optional[str] = Field(default=None)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
