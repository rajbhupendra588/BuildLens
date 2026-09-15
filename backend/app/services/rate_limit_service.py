import threading
import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """In-process sliding-window limiter for login and reset endpoints."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def too_many(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            return len(bucket) >= max_attempts

    def hit(self, key: str) -> None:
        with self._lock:
            self._hits[key].append(time.monotonic())

    def is_limited(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        if self.too_many(key, max_attempts, window_seconds):
            return True
        self.hit(key)
        return False


login_rate_limiter = SlidingWindowRateLimiter()
forgot_password_rate_limiter = SlidingWindowRateLimiter()
reset_password_rate_limiter = SlidingWindowRateLimiter()
