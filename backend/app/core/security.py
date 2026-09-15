import hashlib
import re
import secrets
from typing import Final

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._]{2,49}$")
SPECIAL_CHAR_PATTERN = re.compile(r"[^A-Za-z0-9]")

password_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=2,
    hash_len=32,
    salt_len=16,
)

# Constant-time dummy verify when the username does not exist.
_DUMMY_PASSWORD_HASH: Final[str] = password_hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def verify_dummy_password(password: str) -> None:
    """Consume roughly the same work as a real verify, discarding the result."""
    verify_password(_DUMMY_PASSWORD_HASH, password)


def needs_rehash(password_hash: str) -> bool:
    try:
        return password_hasher.check_needs_rehash(password_hash)
    except (InvalidHashError, Exception):
        return False


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_url_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def normalize_username(username: str) -> str:
    return username.strip().lower()


def validate_username(username: str) -> str | None:
    value = username.strip()
    if not value:
        return "Username is required."
    if not USERNAME_PATTERN.fullmatch(value):
        return "Username must be 3–50 characters and may contain letters, numbers, underscores, and periods."
    return None


def password_requirement_errors(password: str) -> list[str]:
    errors: list[str] = []
    if len(password) < 12:
        errors.append("Password must be at least 12 characters.")
    if not re.search(r"[A-Z]", password):
        errors.append("Password must include an uppercase letter.")
    if not re.search(r"[a-z]", password):
        errors.append("Password must include a lowercase letter.")
    if not re.search(r"[0-9]", password):
        errors.append("Password must include a number.")
    if not SPECIAL_CHAR_PATTERN.search(password):
        errors.append("Password must include a special character.")
    return errors


def validate_password(password: str) -> str | None:
    errors = password_requirement_errors(password)
    if errors:
        return errors[0]
    return None
