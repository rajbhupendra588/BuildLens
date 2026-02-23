from sqlmodel import create_engine, SQLModel, Session
from app.core.config import settings

engine = create_engine(
    settings.DB.URL,
    echo=True # config to False on Production
)

def init_db():
    """Create all tables that define in Models"""
    SQLModel.metadata.create_all(engine)

def get_session():
    """Dependency for using FastAPI endpoints"""
    with Session(engine) as session:
        yield session