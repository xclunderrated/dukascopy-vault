"""High-speed HTTP/2 client with adaptive token bucket throttling."""

import asyncio
import random
from typing import Optional
import httpx
from .config import CONFIG
from .constants import DEFAULT_USER_AGENTS
from .rate_limiter import LimiterRegistry


def get_random_headers() -> dict[str, str]:
    return {
        "User-Agent": random.choice(DEFAULT_USER_AGENTS),
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Referer": "https://www.dukascopy.com/",
        "Origin": "https://www.dukascopy.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
    }


def create_http_client(proxy: Optional[str] = None) -> httpx.AsyncClient:
    """Create a persistent HTTP/2 enabled client with optimized keep-alive pools."""
    limits = httpx.Limits(
        max_keepalive_connections=50,
        max_connections=100,
        keepalive_expiry=60.0,
    )
    return httpx.AsyncClient(
        proxy=proxy,
        http2=CONFIG.enable_http2,
        limits=limits,
        headers=get_random_headers(),
        timeout=httpx.Timeout(connect=5.0, read=15.0, write=10.0, pool=10.0),
        follow_redirects=True,
    )


async def fetch_chunk_content(
    client: httpx.AsyncClient,
    url: str,
    proxy: Optional[str] = None,
) -> Optional[bytes]:
    """
    Fetch a single .bi5 tick chunk with rate limit protection and jittered exponential backoff.
    Returns bytes if file exists and has content (200), or None if 404 (no ticks recorded for hour).
    """
    limiter = LimiterRegistry.get(proxy)

    for attempt in range(CONFIG.fetch_max_retry_attempts + 1):
        # 1. Acquire token from shared rate limiter
        await limiter.acquire()

        try:
            response = await client.get(url)

            # Success with content
            if response.status_code == 200:
                limiter.on_success()
                return response.content if len(response.content) > 0 else None

            # 404 means no market activity for that hour (e.g. illiquid hour or holiday)
            if response.status_code == 404:
                limiter.on_success()
                return None

            # 429 Too Many Requests or 503 Server Throttle
            if response.status_code in {429, 503}:
                retry_header = response.headers.get("Retry-After")
                retry_seconds = float(retry_header) if retry_header and retry_header.isdigit() else None
                cooldown = limiter.on_rate_limit(retry_seconds)
                # Jittered backoff
                jitter = random.uniform(0.5, 1.5)
                delay = max(cooldown, CONFIG.fetch_base_retry_delay * (2 ** attempt)) * jitter
                if attempt == CONFIG.fetch_max_retry_attempts:
                    raise RuntimeError(f"Rate limit exceeded after {attempt} retries: {url}")
                await asyncio.sleep(delay)
                continue

            # 5xx Server Errors (transient)
            if 500 <= response.status_code < 600:
                delay = CONFIG.fetch_base_retry_delay * (2 ** attempt) + random.uniform(0.1, 0.5)
                if attempt == CONFIG.fetch_max_retry_attempts:
                    raise RuntimeError(f"Server error {response.status_code} on: {url}")
                await asyncio.sleep(delay)
                continue

            # 403 Forbidden - potential IP block
            if response.status_code == 403:
                limiter.on_rate_limit(30.0)
                raise PermissionError(f"Access forbidden (403) for URL: {url}. Rate limit or IP block.")

            # Other status codes
            response.raise_for_status()

        except (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError) as e:
            if attempt == CONFIG.fetch_max_retry_attempts:
                raise RuntimeError(f"Network failure after {attempt} attempts for {url}: {e}") from e
            delay = CONFIG.fetch_base_retry_delay * (2 ** attempt) + random.uniform(0.1, 0.5)
            await asyncio.sleep(delay)

    return None
