"""Adaptive AIMD Token Bucket Rate Limiter and Proxy Circuit Breaker."""

import asyncio
import time
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class LimiterStats:
    proxy: Optional[str]
    current_rate: float
    max_rate: float
    min_rate: float
    available_tokens: float
    total_requests: int = 0
    rate_limited_count: int = 0
    consecutive_success: int = 0
    circuit_breaker_tripped: bool = False
    cooldown_until: float = 0.0


class AdaptiveRateLimiter:
    """
    Token-bucket rate limiter with Additive Increase / Multiplicative Decrease (AIMD)
    and per-proxy circuit breaker functionality.
    """

    def __init__(
        self,
        proxy: Optional[str] = None,
        initial_rate: float = 40.0,
        min_rate: float = 5.0,
        max_rate: float = 80.0,
        burst_capacity: int = 60,
    ):
        self.proxy = proxy
        self.rate = initial_rate  # tokens per second
        self.min_rate = min_rate
        self.max_rate = max_rate
        self.capacity = burst_capacity
        self.tokens = float(burst_capacity)
        self.last_update = time.monotonic()
        self.lock = asyncio.Lock()
        
        self.total_requests = 0
        self.rate_limited_count = 0
        self.consecutive_success = 0
        self.consecutive_errors = 0
        self.circuit_breaker_tripped = False
        self.cooldown_until = 0.0

    async def acquire(self) -> None:
        """Wait until a token is available to issue an HTTP request."""
        while True:
            async with self.lock:
                now = time.monotonic()
                # Check circuit breaker
                if self.circuit_breaker_tripped:
                    if now < self.cooldown_until:
                        wait_remaining = self.cooldown_until - now
                    else:
                        # Reset circuit breaker after cooldown
                        self.circuit_breaker_tripped = False
                        self.consecutive_errors = 0
                        self.rate = self.min_rate
                        self.tokens = 1.0
                        wait_remaining = 0.0
                else:
                    wait_remaining = 0.0

                if wait_remaining > 0:
                    pass  # Must sleep outside lock
                else:
                    # Refill tokens based on elapsed time
                    elapsed = now - self.last_update
                    self.last_update = now
                    self.tokens = min(float(self.capacity), self.tokens + elapsed * self.rate)

                    if self.tokens >= 1.0:
                        self.tokens -= 1.0
                        self.total_requests += 1
                        return
                    else:
                        wait_remaining = (1.0 - self.tokens) / max(self.rate, 0.1)

            await asyncio.sleep(min(max(wait_remaining, 0.01), 2.0))

    def on_rate_limit(self, retry_after: Optional[float] = None) -> float:
        """
        Multiplicative Decrease: instantly slash rate and trip circuit breaker if persistent.
        """
        self.rate_limited_count += 1
        self.consecutive_success = 0
        self.consecutive_errors += 1
        
        # Multiplicative decrease (slash throughput by 50%)
        self.rate = max(self.min_rate, self.rate * 0.5)
        self.tokens = 0.0
        
        cooldown = retry_after if retry_after and retry_after > 0 else 3.0

        if self.consecutive_errors >= 3:
            self.circuit_breaker_tripped = True
            self.cooldown_until = time.monotonic() + max(cooldown, 15.0)
            cooldown = max(cooldown, 15.0)

        return cooldown

    def on_success(self) -> None:
        """Additive Increase: gently increase rate after sustained successful requests."""
        self.consecutive_errors = 0
        self.consecutive_success += 1
        if self.consecutive_success >= 40:
            self.rate = min(self.max_rate, self.rate + 2.5)
            self.consecutive_success = 0

    def get_stats(self) -> LimiterStats:
        now = time.monotonic()
        return LimiterStats(
            proxy=self.proxy,
            current_rate=round(self.rate, 1),
            max_rate=self.max_rate,
            min_rate=self.min_rate,
            available_tokens=round(self.tokens, 1),
            total_requests=self.total_requests,
            rate_limited_count=self.rate_limited_count,
            consecutive_success=self.consecutive_success,
            circuit_breaker_tripped=self.circuit_breaker_tripped and (now < self.cooldown_until),
            cooldown_until=self.cooldown_until,
        )


class LimiterRegistry:
    """Global registry of rate limiters per proxy endpoint."""
    _instances: Dict[str, AdaptiveRateLimiter] = {}
    _lock = asyncio.Lock()

    @classmethod
    def get(cls, proxy: Optional[str] = None) -> AdaptiveRateLimiter:
        key = proxy or "direct"
        if key not in cls._instances:
            cls._instances[key] = AdaptiveRateLimiter(proxy=proxy)
        return cls._instances[key]

    @classmethod
    def all_stats(cls) -> list[LimiterStats]:
        return [limiter.get_stats() for limiter in cls._instances.values()]
