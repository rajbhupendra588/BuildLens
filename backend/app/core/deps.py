from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from app.core.config import settings
from app.core.database import get_session
from app.models.user import User
from app.services import auth_service


async def get_current_user(
    request: Request,
    db: Session = Depends(get_session),
) -> User:
    raw_token = request.cookies.get(settings.AUTH.COOKIE_NAME)
    user = auth_service.get_session_user(db, raw_token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    return user
