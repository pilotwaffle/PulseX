"""
TORQ Infrastructure Integration
Complete integration script for Step 3: API Gateway Security
"""

import asyncio
import logging
from typing import Optional

from .gateway import TORQGateway, create_gateway
from .rate_limit import RateLimiter, RateLimitConfig, RateLimitError, RateLimitTier
from .security import SecurityMiddleware, SecurityConfig, SecurityLevel, APIKey
from .cache import CacheManager, CacheConfig
from .tracing import Tracer, TraceConfig
from .health import HealthChecker, HealthCheckConfig


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)


class TORQInfrastructure:
    """
    Complete TORQ Infrastructure integration

    This class provides a unified interface to all infrastructure components:
    - Rate Limiting
    - Security (API key validation)
    - Caching
    - Tracing
    - Health Monitoring
    - API Gateway
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        rate_limit_config: Optional[RateLimitConfig] = None,
        security_config: Optional[SecurityConfig] = None,
        cache_config: Optional[CacheConfig] = None,
        tracing_config: Optional[TraceConfig] = None,
        health_config: Optional[HealthCheckConfig] = None,
        enable_tracing: bool = True,
        enable_cache: bool = True,
        enable_rate_limiting: bool = True,
    ):
        """
        Initialize TORQ Infrastructure

        Args:
            redis_url: Redis connection URL
            rate_limit_config: Rate limiting configuration
            security_config: Security middleware configuration
            cache_config: Cache configuration
            tracing_config: Tracing configuration
            health_config: Health check configuration
            enable_tracing: Enable distributed tracing
            enable_cache: Enable caching
            enable_rate_limiting: Enable rate limiting
        """
        self.redis_url = redis_url
        self.enable_tracing = enable_tracing
        self.enable_cache = enable_cache
        self.enable_rate_limiting = enable_rate_limiting

        # Initialize components
        logger.info("Initializing TORQ Infrastructure...")

        # Rate Limiter
        if self.enable_rate_limiting:
            self.rate_limiter = RateLimiter(
                redis_url=redis_url,
                config=rate_limit_config or RateLimitConfig(),
            )
            logger.info("Rate limiter initialized")
        else:
            self.rate_limiter = None
            logger.info("Rate limiting disabled")

        # Security Middleware
        self.security = SecurityMiddleware(
            redis_url=redis_url,
            config=security_config or SecurityConfig(),
        )
        logger.info("Security middleware initialized")

        # Cache Manager
        if self.enable_cache:
            self.cache = CacheManager(
                config=cache_config or CacheConfig(redis_url=redis_url),
            )
            logger.info("Cache manager initialized")
        else:
            self.cache = None
            logger.info("Caching disabled")

        # Tracer
        if self.enable_tracing:
            self.tracer = Tracer(
                config=tracing_config or TraceConfig(),
            )
            logger.info("Tracer initialized")
        else:
            self.tracer = None
            logger.info("Tracing disabled")

        # Health Checker
        self.health_checker = HealthChecker(
            redis_url=redis_url,
            config=health_config or HealthCheckConfig(),
        )
        logger.info("Health checker initialized")

        # Create Gateway
        self.gateway = create_gateway(
            redis_url=redis_url,
            enable_tracing=enable_tracing,
            enable_cache=enable_cache,
        )
        logger.info("API Gateway created")

        logger.info("TORQ Infrastructure initialization complete")

    async def startup(self):
        """Start all infrastructure components"""
        logger.info("Starting TORQ Infrastructure...")

        # Start health monitoring
        await self.health_checker.start_monitoring()

        logger.info("TORQ Infrastructure started")

    async def shutdown(self):
        """Shutdown all infrastructure components"""
        logger.info("Shutting down TORQ Infrastructure...")

        # Stop health monitoring
        await self.health_checker.stop_monitoring()

        # Flush cache
        if self.cache:
            await self.cache.flush()

        # Flush traces
        if self.tracer:
            self.tracer.flush()

        logger.info("TORQ Infrastructure shutdown complete")

    async def health_status(self):
        """Get overall health status"""
        return await self.health_checker.get_health_status()

    # Convenience methods for common operations

    async def check_rate_limit(
        self,
        identifier: str,
        tier: RateLimitTier = RateLimitTier.PUBLIC,
    ):
        """Check rate limit for a client"""
        if self.rate_limiter:
            return await self.rate_limiter.check_rate_limit(identifier, tier)
        return None

    async def validate_api_key(
        self,
        key: str,
        required_level: SecurityLevel = SecurityLevel.AUTHENTICATED,
    ) -> APIKey:
        """Validate an API key"""
        return await self.security.validate_api_key(key, required_level)

    async def get_cached(self, key: str):
        """Get value from cache"""
        if self.cache:
            return await self.cache.get(key)
        return None

    async def set_cached(
        self,
        key: str,
        value,
        ttl: int = None,
        tags: list = None,
    ):
        """Set value in cache"""
        if self.cache:
            return await self.cache.set(key, value, ttl=ttl, tags=tags)
        return False

    async def invalidate_cache_tag(self, tag: str):
        """Invalidate all cache entries with a tag"""
        if self.cache:
            return await self.cache.invalidate_by_tag(tag)
        return 0

    def trace(self, name: str, **kwargs):
        """Create a trace span"""
        if self.tracer:
            return self.tracer.start_span(name, **kwargs)
        return NullSpanContext()

    def traced(self, name: str = None):
        """Decorator to trace a function"""
        if self.tracer:
            return self.tracer.traced(name)
        def decorator(func):
            return func
        return decorator


# Null context for when tracing is disabled
class NullSpanContext:
    """No-op span context when tracing is disabled"""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


# Create default infrastructure instance
_default_infrastructure: Optional[TORQInfrastructure] = None


def get_infrastructure(
    redis_url: str = "redis://localhost:6379",
    **kwargs
) -> TORQInfrastructure:
    """Get or create default infrastructure instance"""
    global _default_infrastructure
    if _default_infrastructure is None:
        _default_infrastructure = TORQInfrastructure(
            redis_url=redis_url,
            **kwargs
        )
    return _default_infrastructure


# FastAPI dependency provider
def get_current_infrastructure():
    """Get current infrastructure for FastAPI dependency injection"""
    return get_infrastructure()


__all__ = [
    "TORQInfrastructure",
    "get_infrastructure",
    "get_current_infrastructure",
]
