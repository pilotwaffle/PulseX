"""
TORQ API Gateway
Main gateway implementation with FastAPI middleware for API security
"""

import time
import uuid
import json
from typing import Optional, Dict, Any, Callable, Awaitable
from datetime import datetime, timedelta
from fastapi import FastAPI, Request, Response, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import redis.asyncio as redis
from contextlib import asynccontextmanager
import logging

try:
    from .rate_limit import RateLimiter, RateLimitConfig, RateLimitError
    from .security import SecurityMiddleware, APIKeyValidator
    from .cache import CacheManager, CacheConfig
    from .tracing import TracingMiddleware
    from .health import HealthChecker
except ImportError:
    from rate_limit import RateLimiter, RateLimitConfig, RateLimitError
    from security import SecurityMiddleware, APIKeyValidator
    from cache import CacheManager, CacheConfig
    from tracing import TracingMiddleware
    from health import HealthChecker


logger = logging.getLogger(__name__)


class RequestContext:
    """Request context for tracing and logging"""

    def __init__(self, request: Request):
        self.request = request
        self.trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4()))
        self.request_id = str(uuid.uuid4())
        self.start_time = time.time()
        self.client_id = self._extract_client_id()
        self.api_key = request.headers.get("X-API-Key")
        self.user_agent = request.headers.get("User-Agent", "")
        self.ip_address = self._get_client_ip()

    def _extract_client_id(self) -> str:
        """Extract client ID from headers or JWT"""
        # Try multiple header sources
        for header in ["X-Client-ID", "X-Client-Id", "X-MCP-Client-ID"]:
            if header in self.request.headers:
                return self.request.headers[header]
        return "anonymous"

    def _get_client_ip(self) -> str:
        """Get client IP address with proxy support"""
        # Check for proxy headers
        forwarded = self.request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()

        real_ip = self.request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        # Fallback to client host
        if hasattr(self.request, "client") and self.request.client:
            return self.request.client.host
        return "unknown"

    def get_log_context(self) -> Dict[str, Any]:
        """Get structured log context"""
        return {
            "trace_id": self.trace_id,
            "request_id": self.request_id,
            "client_id": self.client_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "timestamp": datetime.utcnow().isoformat(),
        }


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Structured JSON request logging middleware"""

    def __init__(
        self,
        app: ASGIApp,
        logger: logging.Logger,
        log_level: int = logging.INFO
    ):
        super().__init__(app)
        self.logger = logger
        self.log_level = log_level

    async def dispatch(self, request: Request, call_next):
        # Create request context
        ctx = RequestContext(request)

        # Add context to request state for access in other middleware
        request.state.ctx = ctx

        # Log incoming request
        self.logger.log(
            self.log_level,
            "incoming_request",
            extra={
                **ctx.get_log_context(),
                "method": request.method,
                "path": request.url.path,
                "query_params": str(request.query_params),
            }
        )

        # Process request
        try:
            response = await call_next(request)
            latency_ms = (time.time() - ctx.start_time) * 1000

            # Log response
            self.logger.log(
                self.log_level,
                "request_complete",
                extra={
                    **ctx.get_log_context(),
                    "status_code": response.status_code,
                    "latency_ms": round(latency_ms, 2),
                }
            )

            # Add tracing headers
            response.headers["X-Trace-ID"] = ctx.trace_id
            response.headers["X-Request-ID"] = ctx.request_id

            return response

        except Exception as e:
            latency_ms = (time.time() - ctx.start_time) * 1000
            self.logger.error(
                "request_error",
                extra={
                    **ctx.get_log_context(),
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "latency_ms": round(latency_ms, 2),
                },
                exc_info=True
            )
            raise


class RequestRoutingMiddleware(BaseHTTPMiddleware):
    """Route requests to appropriate backend services"""

    def __init__(
        self,
        app: ASGIApp,
        mcp_proxy_url: Optional[str] = None,
        admin_proxy_url: Optional[str] = None,
    ):
        super().__init__(app)
        self.mcp_proxy_url = mcp_proxy_url
        self.admin_proxy_url = admin_proxy_url

    async def dispatch(self, request: Request, call_next):
        # Route MCP clients to MCP proxy
        if request.url.path.startswith("/mcp/") and self.mcp_proxy_url:
            # Headers for routing
            request.headers.update({
                "X-Proxy-Target": "mcp",
                "X-Original-Path": str(request.url.path),
            })
            return await call_next(request)

        # Route admin requests
        if request.url.path.startswith("/admin/") and self.admin_proxy_url:
            request.headers.update({
                "X-Proxy-Target": "admin",
                "X-Original-Path": str(request.url.path),
            })
            return await call_next(request)

        return await call_next(request)


class TORQGateway:
    """
    Main TORQ API Gateway

    Features:
    - Rate limiting with Redis backend
    - API key validation
    - Request logging and tracing
    - Abuse protection
    - Request routing
    - Health monitoring
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        rate_limit_config: Optional[RateLimitConfig] = None,
        enable_tracing: bool = True,
        enable_cache: bool = True,
        mcp_proxy_url: Optional[str] = None,
        admin_proxy_url: Optional[str] = None,
        trusted_origins: list = None,
    ):
        self.redis_url = redis_url
        self.enable_tracing = enable_tracing
        self.enable_cache = enable_cache

        # Initialize rate limiter
        self.rate_limiter = RateLimiter(
            redis_url=redis_url,
            config=rate_limit_config or RateLimitConfig()
        )

        # Initialize security
        self.security = SecurityMiddleware()

        # Initialize cache with proper config
        if enable_cache:
            cache_config = CacheConfig(redis_url=redis_url)
            self.cache = CacheManager(config=cache_config)
        else:
            self.cache = None

        # Initialize health checker
        self.health_checker = HealthChecker(redis_url=redis_url)

        # Proxy URLs
        self.mcp_proxy_url = mcp_proxy_url
        self.admin_proxy_url = admin_proxy_url
        self.trusted_origins = trusted_origins or []

        self.redis_client: Optional[redis.Redis] = None

    async def startup(self):
        """Initialize gateway connections"""
        try:
            self.redis_client = await redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )

            # Test connection
            await self.redis_client.ping()
            logger.info("Gateway connected to Redis", extra={"redis_url": self.redis_url})

        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Running without cache.")
            self.redis_client = None

    async def shutdown(self):
        """Cleanup gateway connections"""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("Gateway Redis connection closed")

    def create_app(self) -> FastAPI:
        """Create and configure the FastAPI application"""

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            # Startup
            await self.startup()
            yield
            # Shutdown
            await self.shutdown()

        app = FastAPI(
            title="TORQ API Gateway",
            description="Production-grade API gateway with security, rate limiting, and observability",
            version="1.0.0",
            lifespan=lifespan,
            docs_url="/api/docs",
            redoc_url="/api/redoc",
        )

        # Configure CORS
        app.add_middleware(
            CORSMiddleware,
            allow_origins=self.trusted_origins or ["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Add GZip compression
        app.add_middleware(GZipMiddleware, minimum_size=1000)

        # Add custom middleware
        app.add_middleware(RequestLoggingMiddleware, logger=logger)
        app.add_middleware(RequestRoutingMiddleware,
                          mcp_proxy_url=self.mcp_proxy_url,
                          admin_proxy_url=self.admin_proxy_url)

        # Add rate limiting middleware
        app.add_middleware(self._rate_limit_middleware)

        # Add security middleware
        app.add_middleware(SecurityMiddleware)

        # Add tracing middleware
        if self.enable_tracing:
            app.add_middleware(TracingMiddleware)

        # Register routes
        self._register_routes(app)

        return app

    async def _rate_limit_middleware(self, request: Request, call_next):
        """Rate limiting middleware"""
        ctx = getattr(request.state, "ctx", None) or RequestContext(request)

        # Determine rate limit tier
        tier = self._determine_rate_limit_tier(request, ctx)

        try:
            # Check rate limit
            await self.rate_limiter.check_rate_limit(
                key=ctx.client_id,
                tier=tier,
                request_id=ctx.request_id
            )

        except RateLimitError as e:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "rate_limit_exceeded",
                    "message": str(e),
                    "retry_after": e.retry_after,
                    "trace_id": ctx.trace_id,
                },
                headers={
                    "Retry-After": str(e.retry_after),
                    "X-Trace-ID": ctx.trace_id,
                }
            )

        return await call_next(request)

    def _determine_rate_limit_tier(self, request: Request, ctx: RequestContext) -> str:
        """Determine rate limiting tier based on request characteristics"""
        path = request.url.path

        # Admin endpoints - strictest rate limit
        if path.startswith("/admin/"):
            return "admin"

        # MCP clients - higher rate limit for authenticated clients
        if path.startswith("/mcp/") or ctx.api_key:
            return "mcp"

        # Public API - standard rate limit
        return "public"

    def _register_routes(self, app: FastAPI):
        """Register gateway routes"""

        @app.get("/health")
        @app.get("/api/health")
        async def health_check():
            """Health check endpoint"""
            return await self.health_checker.get_health_status()

        @app.get("/api/telemetry/health")
        async def telemetry_health():
            """Detailed telemetry health"""
            status = await self.health_checker.get_detailed_status()
            return status

        @app.get("/api/learning/status")
        async def learning_status():
            """Learning layer status"""
            return {
                "status": "operational",
                "version": "1.0.0",
                "features": {
                    "rate_limiting": "enabled",
                    "tracing": "enabled" if self.enable_tracing else "disabled",
                    "caching": "enabled" if self.cache else "disabled",
                    "security": "enabled",
                }
            }

        @app.get("/api/gateway/status")
        async def gateway_status():
            """Gateway status endpoint"""
            redis_status = "connected" if self.redis_client else "disconnected"

            return {
                "gateway": "operational",
                "redis": redis_status,
                "rate_limiting": "enabled",
                "security": "enabled",
                "tracing": "enabled" if self.enable_tracing else "disabled",
                "timestamp": datetime.utcnow().isoformat(),
            }

        @app.post("/api/gateway/flush-cache")
        async def flush_cache(admin_key: str = Depends(self.security.verify_admin_key)):
            """Flush cache (admin only)"""
            if self.cache:
                await self.cache.flush()
                return {"status": "success", "message": "Cache flushed"}
            return {"status": "skipped", "message": "Cache not enabled"}


# Create default gateway instance
def create_gateway(
    redis_url: str = None,
    **kwargs
) -> FastAPI:
    """Factory function to create gateway application"""

    # Get Redis URL from environment or use default
    import os
    redis_url = redis_url or os.getenv(
        "REDIS_URL",
        "redis://localhost:6379"
    )

    gateway = TORQGateway(redis_url=redis_url, **kwargs)
    return gateway.create_app()


# Don't initialize gateway_app at module level to avoid import issues
# gateway_app = create_gateway()
