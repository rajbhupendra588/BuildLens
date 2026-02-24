from datetime import datetime
from typing import Optional
from sqlmodel import Session, select
from app.models.settings import AppSetting


class SettingsService:
    def get(self, key: str, db: Session) -> Optional[str]:
        setting = db.get(AppSetting, key)
        return setting.value if setting else None

    def set(self, key: str, value: Optional[str], db: Session):
        setting = db.get(AppSetting, key)
        if setting:
            setting.value = value
            setting.updated_at = datetime.utcnow()
        else:
            setting = AppSetting(key=key, value=value)
        db.add(setting)
        db.commit()

    def get_all(self, db: Session) -> dict[str, Optional[str]]:
        statement = select(AppSetting)
        settings = db.exec(statement).all()
        return {s.key: s.value for s in settings}


settings_service = SettingsService()
