from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import (
    generate_url_token,
    hash_password,
    hash_token,
    needs_rehash,
    normalize_username,
    password_requirement_errors,
    validate_password,
    validate_username,
    verify_dummy_password,
    verify_password,
)
from app.models.auth_session import AuthSession
from app.models.password_reset import PasswordResetToken
from app.models.user import User, UserStatus
from app.schemas.auth import UserPublic
from app.services.rate_limit_service import (
    forgot_password_rate_limiter,
    login_rate_limiter,
    reset_password_rate_limiter,
)

GENERIC_AUTH_ERROR = "Invalid username or password."
GENERIC_RESET_SENT = (
    "If the account exists, password reset instructions have been sent."
)
TOO_MANY_ATTEMPTS = "Too many attempts. Please try again later."


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return "unknown"


def user_to_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        firstName=user.first_name,
        lastName=user.last_name,
        username=user.username,
        status=user.status,
        createdAt=user.created_at,
        updatedAt=user.updated_at,
        lastLoginAt=user.last_login_at,
    )


def _cookie_secure() -> bool:
    return settings.ENVIRONMENT == "production" or settings.AUTH.COOKIE_SECURE


def set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=settings.AUTH.COOKIE_NAME,
        value=raw_token,
        max_age=settings.AUTH.SESSION_TTL_SECONDS,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.AUTH.COOKIE_NAME,
        path="/",
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
    )


def _is_locked(user: User, now: datetime) -> bool:
    if user.status == UserStatus.DISABLED.value:
        return True
    if user.locked_until and user.locked_until > now:
        return True
    if user.status == UserStatus.LOCKED.value:
        if user.locked_until and user.locked_until <= now:
            return False
        if user.locked_until is None:
            return True
    return False


def _unlock_if_expired(db: Session, user: User, now: datetime) -> None:
    if (
        user.status == UserStatus.LOCKED.value
        and user.locked_until
        and user.locked_until <= now
    ):
        user.status = UserStatus.ACTIVE.value
        user.locked_until = None
        user.failed_login_count = 0
        user.updated_at = now
        db.add(user)


def _register_failed_login(db: Session, user: User, now: datetime) -> None:
    user.failed_login_count = (user.failed_login_count or 0) + 1
    if user.failed_login_count >= settings.AUTH.LOGIN_MAX_FAILURES:
        user.status = UserStatus.LOCKED.value
        user.locked_until = now + timedelta(minutes=settings.AUTH.LOGIN_LOCKOUT_MINUTES)
        user.failed_login_count = 0
    user.updated_at = now
    db.add(user)
    db.commit()


def signup(
    db: Session,
    *,
    first_name: str,
    last_name: str,
    username: str,
    password: str,
) -> User:
    first = first_name.strip()
    last = last_name.strip()
    if not first:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "First name is required.")
    if not last:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Last name is required.")

    username_error = validate_username(username)
    if username_error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, username_error)

    password_error = validate_password(password)
    if password_error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, password_error)

    normalized = normalize_username(username)
    existing = db.exec(
        select(User).where(User.username_normalized == normalized)
    ).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username is already in use.")

    now = datetime.utcnow()
    user = User(
        first_name=first,
        last_name=last,
        username=username.strip(),
        username_normalized=normalized,
        password_hash=hash_password(password),
        status=UserStatus.ACTIVE.value,
        created_at=now,
        updated_at=now,
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Username is already in use.")


def login(
    db: Session,
    request: Request,
    response: Response,
    username: str,
    password: str,
) -> User:
    ip = client_ip(request)
    if login_rate_limiter.too_many(
        f"ip:{ip}",
        settings.AUTH.LOGIN_RATE_LIMIT_PER_MINUTE,
        60,
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS)
    login_rate_limiter.hit(f"ip:{ip}")

    normalized = normalize_username(username)
    if login_rate_limiter.too_many(
        f"user:{normalized}",
        settings.AUTH.LOGIN_MAX_FAILURES,
        settings.AUTH.LOGIN_LOCKOUT_MINUTES * 60,
    ):
        verify_dummy_password(password)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, GENERIC_AUTH_ERROR)

    user = db.exec(
        select(User).where(User.username_normalized == normalized)
    ).first()
    now = datetime.utcnow()

    if user is None:
        verify_dummy_password(password)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, GENERIC_AUTH_ERROR)

    _unlock_if_expired(db, user, now)

    if _is_locked(user, now):
        verify_dummy_password(password)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, GENERIC_AUTH_ERROR)

    if not verify_password(user.password_hash, password):
        login_rate_limiter.hit(f"user:{normalized}")
        _register_failed_login(db, user, now)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, GENERIC_AUTH_ERROR)

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    user.failed_login_count = 0
    user.locked_until = None
    if user.status == UserStatus.LOCKED.value:
        user.status = UserStatus.ACTIVE.value
    user.last_login_at = now
    user.updated_at = now
    db.add(user)

    raw_token = generate_url_token()
    session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=now + timedelta(seconds=settings.AUTH.SESSION_TTL_SECONDS),
        created_at=now,
        last_seen_at=now,
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        ip_address=ip,
    )
    db.add(session)
    db.commit()
    db.refresh(user)
    set_session_cookie(response, raw_token)
    return user


def logout(db: Session, request: Request, response: Response) -> None:
    raw_token = request.cookies.get(settings.AUTH.COOKIE_NAME)
    if raw_token:
        token_hash = hash_token(raw_token)
        session = db.exec(
            select(AuthSession).where(AuthSession.token_hash == token_hash)
        ).first()
        if session and session.revoked_at is None:
            session.revoked_at = datetime.utcnow()
            db.add(session)
            db.commit()
    clear_session_cookie(response)


def get_session_user(db: Session, raw_token: Optional[str]) -> Optional[User]:
    if not raw_token:
        return None
    now = datetime.utcnow()
    session = db.exec(
        select(AuthSession).where(AuthSession.token_hash == hash_token(raw_token))
    ).first()
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at <= now
    ):
        return None

    user = db.get(User, session.user_id)
    if user is None or user.status == UserStatus.DISABLED.value:
        return None
    _unlock_if_expired(db, user, now)
    if _is_locked(user, now):
        db.commit()
        return None

    if (now - session.last_seen_at).total_seconds() > 300:
        session.last_seen_at = now
        db.add(session)
    db.commit()
    return user


def revoke_user_sessions(
    db: Session, user_id, except_token_hash: Optional[str] = None
) -> None:
    now = datetime.utcnow()
    sessions = db.exec(
        select(AuthSession).where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at == None,  # noqa: E711
        )
    ).all()
    for session in sessions:
        if except_token_hash and session.token_hash == except_token_hash:
            continue
        session.revoked_at = now
        db.add(session)


def invalidate_reset_tokens(db: Session, user_id) -> None:
    now = datetime.utcnow()
    tokens = db.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.used_at == None,  # noqa: E711
        )
    ).all()
    for token in tokens:
        token.used_at = now
        db.add(token)


def request_password_reset(
    db: Session, request: Request, username: str
) -> Optional[str]:
    ip = client_ip(request)
    if forgot_password_rate_limiter.is_limited(
        f"ip:{ip}",
        settings.AUTH.FORGOT_RATE_LIMIT_PER_MINUTE,
        60,
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS)

    normalized = normalize_username(username)
    user = db.exec(
        select(User).where(User.username_normalized == normalized)
    ).first()

    decoy = generate_url_token()
    decoy_url = f"{settings.AUTH.PUBLIC_APP_URL.rstrip('/')}/reset-password?token={decoy}"

    if user is None or user.status == UserStatus.DISABLED.value:
        return decoy_url if settings.ENVIRONMENT != "production" else None

    invalidate_reset_tokens(db, user.id)
    raw_token = generate_url_token()
    now = datetime.utcnow()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=now + timedelta(minutes=settings.AUTH.RESET_TOKEN_TTL_MINUTES),
            created_at=now,
        )
    )
    db.commit()
    reset_url = (
        f"{settings.AUTH.PUBLIC_APP_URL.rstrip('/')}/reset-password?token={raw_token}"
    )
    return reset_url if settings.ENVIRONMENT != "production" else None


def reset_password(db: Session, request: Request, token: str, password: str) -> None:
    ip = client_ip(request)
    if reset_password_rate_limiter.is_limited(
        f"ip:{ip}",
        settings.AUTH.LOGIN_RATE_LIMIT_PER_MINUTE,
        60,
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS)

    password_error = validate_password(password)
    if password_error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, password_error)

    now = datetime.utcnow()
    row = db.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_token(token)
        )
    ).first()
    if row is None or row.used_at is not None or row.expires_at <= now:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This reset link is invalid or has expired.",
        )

    user = db.get(User, row.user_id)
    if user is None or user.status == UserStatus.DISABLED.value:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This reset link is invalid or has expired.",
        )

    user.password_hash = hash_password(password)
    user.failed_login_count = 0
    user.locked_until = None
    if user.status == UserStatus.LOCKED.value:
        user.status = UserStatus.ACTIVE.value
    user.updated_at = now
    row.used_at = now
    db.add(user)
    db.add(row)
    invalidate_reset_tokens(db, user.id)
    revoke_user_sessions(db, user.id)
    db.commit()


def change_password(
    db: Session,
    request: Request,
    user: User,
    current_password: str,
    new_password: str,
) -> None:
    if not verify_password(user.password_hash, current_password):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Current password is incorrect."
        )
    if current_password == new_password:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "New password must be different from the current password.",
        )
    errors = password_requirement_errors(new_password)
    if errors:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, errors[0])

    now = datetime.utcnow()
    user.password_hash = hash_password(new_password)
    user.updated_at = now
    db.add(user)
    raw_token = request.cookies.get(settings.AUTH.COOKIE_NAME)
    except_hash = hash_token(raw_token) if raw_token else None
    revoke_user_sessions(db, user.id, except_token_hash=except_hash)
    invalidate_reset_tokens(db, user.id)
    db.commit()
