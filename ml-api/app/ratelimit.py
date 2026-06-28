from __future__ import annotations

import time
from collections.abc import Callable


class RateLimiter:
    """In-memory sliding-window limiter (per-process; fine for a single replica).

    Keyed by an arbitrary string (e.g. user id). For multi-replica deployments
    swap in a shared store (Redis) behind the same `allow` interface.
    """

    def __init__(
        self,
        max_calls: int,
        per_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_calls = max_calls
        self.per_seconds = per_seconds
        self.clock = clock
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        if self.max_calls <= 0:
            return True
        now = self.clock()
        cutoff = now - self.per_seconds
        window = [t for t in self._hits.get(key, []) if t > cutoff]
        if len(window) >= self.max_calls:
            self._hits[key] = window
            return False
        window.append(now)
        self._hits[key] = window
        return True
