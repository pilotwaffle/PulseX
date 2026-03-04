"""
TORQ Rate Limiting Module
Implements rate limiting with Redis backend for API gateway security

Rate Limits:
- Public API: 60 requests per minute
- Admin endpoints: 20 requests per minute
- MCP clients: 120 requests per minute
"""

import time
import asyncio
import json
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
import redis.asyncio as redis
import logging


logger = logging.getLogger(__name__)


class RateLimitTier(str, Enum):
    """Rate limiting tiers"""
    PUBLIC = "public"
    ADMIN = "admin"
    MCP = "mcp"


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting"""

    # Requests per minute for each tier
    public_rate: int = 60
    admin_rate: int = 20
    mcp_rate: int = 120

    # Time window in seconds
    window_seconds: int = 60

    # Burst allowance
    burst_multiplier: float = 1.5

    # Redis key prefix
    key_prefix: str = "torq:rate_limit:"

    # Enabled flag
    enabled: bool = True

    # Fallback behavior when Redis is unavailable
    fallback_enabled: bool = True
    fallback_rate: int = 30  # Lower rate when Redis is down


@dataclass
class RateLimitInfo:
    """Rate limit information"""
    limit: int
    remaining: int
    reset_time: datetime
    tier: RateLimitTier
    retry_after: Optional[int] = None


class RateLimitError(Exception):
    """Rate limit exceeded error"""

    def __init__(self, info: RateLimitInfo):
        self.info = info
        self.retry_after = info.retry_after
        super().__init__(f"Rate limit exceeded for tier {info.tier}")


class RateLimiter:
    """
    Token bucket rate limiter with Redis backend

    Features:
    - Multiple rate limit tiers
    - Redis-based distributed rate limiting
    - Burst support
    - Fallback behavior
    - Sliding window counter
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        config: RateLimitConfig = None
    ):
        self.config = config or RateLimitConfig()
        self.redis_url = redis_url
        self._redis: Optional[redis.Redis] = None
        self._redis_available = False

    async def _get_redis(self) -> Optional[redis.Redis]:
        """Get Redis connection (lazy initialization)"""
        if self._redis is None and self.config.enabled:
            try:
                self._redis = await redis.from_url(
                    self.redis_url,
                    encoding="utf-8",
                    decode_responses=True
                )
                await self._redis.ping()
                self._redis_available = True
                logger.info(f"Rate limiter connected to Redis: {self.redis_url}")

            except Exception as e:
                logger.warning(f"Redis connection failed for rate limiter: {e}")
                self._redis_available = False
                if not self.config.fallback_enabled:
                    raise

        return self._redis if self._redis_available else None

    def _get_key(self, identifier: str, tier: RateLimitTier) -> str:
        """Generate Redis key for rate limit counter"""
        return f"{self.config.key_prefix}{tier}:{identifier}"

    def _get_limit_for_tier(self, tier: RateLimitTier) -> int:
        """Get rate limit for tier"""
        limits = {
            RateLimitTier.PUBLIC: self.config.public_rate,
            RateLimitTier.ADMIN: self.config.admin_rate,
            RateLimitTier.MCP: self.config.mcp_rate,
        }
        return limits.get(tier, self.config.public_rate)

    async def check_rate_limit(
        self,
        identifier: str,
        tier: RateLimitTier = RateLimitTier.PUBLIC,
        request_id: Optional[str] = None,
    ) -> RateLimitInfo:
        """
        Check and increment rate limit counter

        Args:
            identifier: Unique identifier (client_id, api_key, ip_address)
            tier: Rate limit tier
            request_id: Optional request ID for tracing

        Returns:
            RateLimitInfo with current limits

        Raises:
            RateLimitError: If rate limit exceeded
        """
        if not self.config.enabled:
            return self._unlimited_info()

        # Try Redis rate limiting
        redis_client = await self._get_redis()

        if redis_client:
            return await self._check_redis_rate_limit(
                redis_client,
                identifier,
                tier,
                request_id
            )
        elif self.config.fallback_enabled:
            # Fallback: in-memory rate limiting
            return await self._check_fallback_rate_limit(
                identifier,
                tier
            )
        else:
            return self._unlimited_info()

    async def _check_redis_rate_limit(
        self,
        redis_client: redis.Redis,
        identifier: str,
        tier: RateLimitTier,
        request_id: Optional[str] = None,
    ) -> RateLimitInfo:
        """Check rate limit using Redis with sliding window"""

        key = self._get_key(identifier, tier)
        limit = self._get_limit_for_tier(tier)
        window = self.config.window_seconds
        now = time.time()

        # Lua script for atomic rate limit check and increment
        # Uses sliding window algorithm
        lua_script = """
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local limit = tonumber(ARGV[3])

        -- Remove entries outside the window
        redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

        -- Count requests in window
        local count = redis.call('ZCARD', key)

        if count < limit then
            -- Add current request
            redis.call('ZADD', key, now, now)
            redis.call('EXPIRE', key, window)
            return {count, limit - count - 1}
        else
            -- Find oldest timestamp to calculate retry_after
            local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2]
            local retry_after = math.ceil(oldest + window - now)
            return {-1, retry_after}
        end
        """

        try:
            result = await redis_client.eval(
                lua_script,
                1,
                key,
                now,
                window,
                limit
            )

            count, remaining_or_retry = result

            if count == -1:
                # Rate limit exceeded
                reset_time = datetime.utcnow() + timedelta(
                    seconds=self.config.window_seconds
                )
                raise RateLimitError(
                    RateLimitInfo(
                        limit=limit,
                        remaining=0,
                        reset_time=reset_time,
                        tier=tier,
                        retry_after=int(remaining_or_retry)
                    )
                )

            reset_time = datetime.utcnow() + timedelta(seconds=window)

            return RateLimitInfo(
                limit=limit,
                remaining=int(remaining_or_retry),
                reset_time=reset_time,
                tier=tier,
            )

        except redis.RedisError as e:
            logger.error(f"Redis rate limit error: {e}")
            if self.config.fallback_enabled:
                return await self._check_fallback_rate_limit(identifier, tier)
            raise

    async def _check_fallback_rate_limit(
        self,
        identifier: str,
        tier: RateLimitTier,
    ) -> RateLimitInfo:
        """
        Fallback in-memory rate limiting when Redis is unavailable

        Uses a simple in-memory counter with reduced rate
        """
        limit = self.config.fallback_rate
        now = time.time()
        window = self.config.window_seconds

        # Simple in-memory tracking (not distributed)
        if not hasattr(self, "_fallback_counters"):
            self._fallback_counters: Dict[str, List[float]] = {}

        key = f"{tier}:{identifier}"

        # Initialize counter if needed
        if key not in self._fallback_counters:
            self._fallback_counters[key] = []

        # Clean old entries
        self._fallback_counters[key] = [
            ts for ts in self._fallback_counters[key]
            if ts > now - window
        ]

        # Check limit
        if len(self._fallback_counters[key]) >= limit:
            # Rate limit exceeded
            oldest = self._fallback_counters[key][0]
            retry_after = int(oldest + window - now)

            reset_time = datetime.utcnow() + timedelta(seconds=retry_after)

            raise RateLimitError(
                RateLimitInfo(
                    limit=limit,
                    remaining=0,
                    reset_time=reset_time,
                    tier=tier,
                    retry_after=retry_after,
                )
            )

        # Add current request
        self._fallback_counters[key].append(now)

        reset_time = datetime.utcnow() + timedelta(seconds=window)

        return RateLimitInfo(
            limit=limit,
            remaining=limit - len(self._fallback_counters[key]),
            reset_time=reset_time,
            tier=tier,
        )

    def _unlimited_info(self) -> RateLimitInfo:
        """Return unlimited rate limit info when rate limiting is disabled"""
        return RateLimitInfo(
            limit=999999,
            remaining=999999,
            reset_time=datetime.utcnow() + timedelta(seconds=60),
            tier=RateLimitTier.PUBLIC,
        )

    async def reset(self, identifier: str, tier: RateLimitTier):
        """Reset rate limit counter for identifier"""
        redis_client = await self._get_redis()
        if redis_client:
            key = self._get_key(identifier, tier)
            await redis_client.delete(key)

            # Also clear fallback counter
            key = f"{tier}:{identifier}"
            if hasattr(self, "_fallback_counters") and key in self._fallback_counters:
                del self._fallback_counters[key]

    async def get_usage(self, identifier: str, tier: RateLimitTier) -> Dict[str, Any]:
        """Get current usage statistics"""
        redis_client = await self._get_redis()
        if redis_client:
            key = self._get_key(identifier, tier)
            count = await redis_client.zcard(key)
            limit = self._get_limit_for_tier(tier)

            return {
                "limit": limit,
                "used": count,
                "remaining": max(0, limit - count),
                "tier": tier,
            }
        else:
            return {
                "limit": self.config.fallback_rate,
                "used": 0,
                "remaining": self.config.fallback_rate,
                "tier": tier,
                "fallback": True,
            }


class RateLimitMiddleware:
    """
    FastAPI middleware for automatic rate limiting

    Integrates with RequestContext to identify clients
    """

    def __init__(
        self,
        limiter: RateLimiter,
        identifier_extractor: callable = None,
        tier_extractor: callable = None,
    ):
        self.limiter = limiter
        self.identifier_extractor = identifier_extractor or self._default_identifier_extractor
        self.tier_extractor = tier_extractor or self._default_tier_extractor

    def _default_identifier_extractor(self, request) -> str:
        """Extract client identifier from request"""
        # Try to get RequestContext
        ctx = getattr(request.state, "ctx", None)
        if ctx:
            return ctx.client_id

        # Fallback to IP address
        if hasattr(request, "client"):
            return request.client.host
        return "unknown"

    def _default_tier_extractor(self, request) -> RateLimitTier:
        """Extract rate limit tier from request"""
        # Admin endpoints
        if request.url.path.startswith("/admin/"):
            return RateLimitTier.ADMIN

        # MCP endpoints
        if request.url.path.startswith("/mcp/"):
            return RateLimitTier.MCP

        return RateLimitTier.PUBLIC

    async def __call__(self, request, call_next):
        """Middleware handler"""
        if not self.limiter.config.enabled:
            return await call_next(request)

        # Extract identifier and tier
        identifier = self.identifier_extractor(request)
        tier = self.tier_extractor(request)

        try:
            # Check rate limit
            info = await self.limiter.check_rate_limit(
                identifier=identifier,
                tier=tier,
                request_id=getattr(request.state, "request_id", None),
            )

            # Add rate limit headers to response
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(info.limit)
            response.headers["X-RateLimit-Remaining"] = str(info.remaining)
            response.headers["X-RateLimit-Reset"] = str(int(info.reset_time.timestamp()))

            return response

        except RateLimitError as e:
            # Return 429 Too Many Requests
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "tier": str(e.info.tier),
                    "limit": e.info.limit,
                    "reset_time": e.info.reset_time.isoformat(),
                    "retry_after": e.retry_after,
                },
                headers={
                    "Retry-After": str(e.retry_after),
                    "X-RateLimit-Limit": str(e.info.limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(e.info.reset_time.timestamp())),
                }
            )
