from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session

from app.core.config import settings
from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    UserPublic,
)
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_session)):
    user = auth_service.signup(
        db,
        first_name=payload.firstName,
        last_name=payload.lastName,
        username=payload.username,
        password=payload.password,
    )
    return SignupResponse(
        message="Account created. Sign in to continue.",
        user=auth_service.user_to_public(user),
    )


@router.post("/login", response_model=UserPublic)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_session),
):
    if not payload.username.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Username is required.")
    if not payload.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is required.")

    user = auth_service.login(
        db,
        request,
        response,
        username=payload.username,
        password=payload.password,
    )
    return auth_service.user_to_public(user)


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)):
    return auth_service.user_to_public(current_user)


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_session),
):
    auth_service.logout(db, request, response)
    return MessageResponse(message="Signed out.")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_session),
):
    reset_url = auth_service.request_password_reset(
        db, request, username=payload.username
    )
    body = ForgotPasswordResponse(message=auth_service.GENERIC_RESET_SENT)
    if settings.ENVIRONMENT != "production":
        body.resetUrl = reset_url
    return body


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_session),
):
    auth_service.reset_password(
        db, request, token=payload.token, password=payload.password
    )
    return MessageResponse(message="Your password has been reset successfully.")


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    auth_service.change_password(
        db,
        request,
        current_user,
        current_password=payload.currentPassword,
        new_password=payload.newPassword,
    )
    return MessageResponse(message="Password changed successfully.")
