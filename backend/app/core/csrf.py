from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class OriginCheckMiddleware(BaseHTTPMiddleware):
    """Reject cross-site state-changing requests whose Origin is not allowed."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method.upper() in SAFE_METHODS:
            return await call_next(request)

        origin = request.headers.get("origin")
        if not origin:
            return await call_next(request)

        allowed = set(settings.AUTH.cors_origin_list)
        if origin in allowed:
            return await call_next(request)

        return JSONResponse(
            status_code=403,
            content={"detail": "Request origin is not allowed."},
        )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Cache-Control", "no-store")
        if settings.ENVIRONMENT == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response
