from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text
from app.core.config import settings

engine = create_engine(
    settings.DB.URL,
    echo=True # config to False on Production
)

def init_db():
    """Create all tables defined in Models, then apply incremental migrations."""
    SQLModel.metadata.create_all(engine)
    _migrate()

def _migrate():
    """Idempotent schema additions for existing databases."""
    with engine.connect() as conn:
        # Add sources column if it was not present in the original schema
        conn.execute(text(
            "ALTER TABLE chatmessage ADD COLUMN IF NOT EXISTS sources JSON"
        ))
        # Add detected_mode column for intent-based prompting
        conn.execute(text(
            "ALTER TABLE chatmessage ADD COLUMN IF NOT EXISTS detected_mode VARCHAR(50)"
        ))
        conn.commit()

def get_session():
    """Dependency for using FastAPI endpoints"""
    with Session(engine) as session:
        yield session