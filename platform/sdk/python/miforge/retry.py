"""
MiForge Retry Utilities — Exponential backoff for all API calls.

Retries on: ThrottlingException, 429, 503, ECONNRESET, timeout.
Max 3 retries with 1s → 2s → 4s delays.
"""

import asyncio
import time
import functools
from typing import TypeVar, Callable, Any

import httpx

T = TypeVar("T")

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
RETRYABLE_EXCEPTIONS = (
    httpx.ConnectError,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.ConnectTimeout,
    ConnectionResetError,
    TimeoutError,
)

DEFAULT_MAX_RETRIES = 3
DEFAULT_BASE_DELAY = 1.0  # seconds
DEFAULT_MAX_DELAY = 8.0


def retry_sync(
    fn: Callable[..., T],
    *args: Any,
    max_retries: int = DEFAULT_MAX_RETRIES,
    base_delay: float = DEFAULT_BASE_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
    **kwargs: Any,
) -> T:
    """Synchronous retry with exponential backoff."""
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            result = fn(*args, **kwargs)
            # Check for httpx Response objects with retryable status
            if isinstance(result, httpx.Response) and result.status_code in RETRYABLE_STATUS_CODES:
                if attempt == max_retries:
                    return result  # Return the bad response on last attempt
                delay = min(base_delay * (2 ** attempt), max_delay)
                time.sleep(delay)
                continue
            return result
        except RETRYABLE_EXCEPTIONS as e:
            last_error = e
            if attempt == max_retries:
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            time.sleep(delay)
        except Exception:
            raise  # Non-retryable — raise immediately

    if last_error:
        raise last_error
    raise RuntimeError("Retry exhausted without result")


async def retry_async(
    fn: Callable[..., Any],
    *args: Any,
    max_retries: int = DEFAULT_MAX_RETRIES,
    base_delay: float = DEFAULT_BASE_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
    **kwargs: Any,
) -> Any:
    """Async retry with exponential backoff."""
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            result = await fn(*args, **kwargs)
            return result
        except RETRYABLE_EXCEPTIONS as e:
            last_error = e
            if attempt == max_retries:
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            await asyncio.sleep(delay)
        except Exception:
            raise

    if last_error:
        raise last_error
    raise RuntimeError("Retry exhausted without result")


def with_retry(max_retries: int = DEFAULT_MAX_RETRIES, base_delay: float = DEFAULT_BASE_DELAY):
    """Decorator: adds retry with exponential backoff to any function."""
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return retry_sync(fn, *args, max_retries=max_retries, base_delay=base_delay, **kwargs)
        return wrapper
    return decorator
