from fastapi import Request, status
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

try:
    from qdrant_client.http.exceptions import UnexpectedResponse
except ImportError:  # pragma: no cover
    UnexpectedResponse = None  # type: ignore[misc, assignment]


def _is_missing_collection_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "collection" in text and (
        "doesn't exist" in text or "does not exist" in text or "not found" in text
    )


async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception: {exc}", exc_info=True)

    origin = request.headers.get("origin", "*")
    if UnexpectedResponse is not None and isinstance(exc, UnexpectedResponse):
        detail = (
            "Knowledge base is not ready. Refresh and try again."
            if _is_missing_collection_error(exc)
            else "Vector store request failed."
        )
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    else:
        detail = "An internal server error occurred."
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    response = JSONResponse(
        status_code=status_code,
        content={"detail": detail},
    )
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response
