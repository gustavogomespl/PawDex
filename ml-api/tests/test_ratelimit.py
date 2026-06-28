from app.ratelimit import RateLimiter


def test_allows_up_to_max_then_blocks_within_window():
    clock = {"t": 1000.0}
    limiter = RateLimiter(max_calls=2, per_seconds=60, clock=lambda: clock["t"])

    assert limiter.allow("user-1") is True
    assert limiter.allow("user-1") is True
    assert limiter.allow("user-1") is False  # third within the window


def test_separate_keys_have_separate_budgets():
    limiter = RateLimiter(max_calls=1, per_seconds=60, clock=lambda: 0.0)
    assert limiter.allow("a") is True
    assert limiter.allow("b") is True
    assert limiter.allow("a") is False


def test_window_slides_so_old_hits_expire():
    clock = {"t": 0.0}
    limiter = RateLimiter(max_calls=1, per_seconds=10, clock=lambda: clock["t"])
    assert limiter.allow("user-1") is True
    assert limiter.allow("user-1") is False
    clock["t"] = 11.0  # past the window
    assert limiter.allow("user-1") is True
