from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text
from app.core.config import settings

engine = create_engine(
    settings.DB.URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
)

def init_db():
    # Register auth tables with SQLModel metadata before create_all.
    from app.models.user import User as _User  # noqa: F401
    from app.models.auth_session import AuthSession as _AuthSession  # noqa: F401
    from app.models.password_reset import PasswordResetToken as _PasswordResetToken  # noqa: F401
    from app.models.ingest_job import IngestJob as _IngestJob  # noqa: F401
    from app.models.report import DocumentReport as _DocumentReport  # noqa: F401
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
        conn.execute(text(
            "ALTER TABLE chatmessage ADD COLUMN IF NOT EXISTS media JSON"
        ))
        conn.execute(text(
            "ALTER TABLE chatsession ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE"
        ))
        conn.execute(text(
            "ALTER TABLE chatsession ADD COLUMN IF NOT EXISTS user_id UUID"
        ))
        conn.execute(text(
            "ALTER TABLE documentcatalog ADD COLUMN IF NOT EXISTS user_id UUID"
        ))
        conn.commit()

def get_session():
    """Dependency for using FastAPI endpoints"""
    with Session(engine) as session:
        yield session