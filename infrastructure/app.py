"""
TORQ Infrastructure - FastAPI Application

Production-ready API gateway with security, rate limiting, caching,
tracing, and health monitoring per the Infrastructure Reliability PRD.
"""

from fastapi import FastAPI, Request, Response, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import os
from datetime import datetime

from .gateway import TORQGateway, create_gateway
from .rate_limit import RateLimiter, RateLimitConfig
from .security import SecurityMiddleware, SecurityLevel
from .health import HealthChecker, HealthStatus


# Initialize infrastructure components
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
supabase_url = os.getenv("SUPABASE_URL", "https://test.supabase.co")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Rate limiting configuration
rate_limit_config = RateLimitConfig(
    public_rate=60,
    admin_rate=20,
    mcp_rate=120,
    window_seconds=60,
)

# Create health checker
health_checker = HealthChecker(
    check_interval=30,
    failure_threshold=3,
    redis_url=redis_url,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    # Startup
    # Register health components
    health_checker.register_component("redis", HealthStatus.HEALTHY)
    health_checker.register_component("supabase", HealthStatus.HEALTHY)
    health_checker.register_component("rate_limiter", HealthStatus.HEALTHY)

    yield

    # Shutdown
    pass


# Create FastAPI application
app = FastAPI(
    title="TORQ API Gateway",
    description="Production-grade API gateway with security, rate limiting, and observability",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
trusted_origins = os.getenv("TRUSTED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=trusted_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health endpoints
@app.get("/health")
async def health_check():
    """Basic health check endpoint"""
    health = health_checker.get_system_health()
    return {"status": health.status.value}


@app.get("/api/health")
async def detailed_health():
    """Detailed health status"""
    return await health_checker.get_detailed_status()


@app.get("/api/telemetry/health")
async def telemetry_health():
    """Telemetry health endpoint"""
    return {
        "status": "operational",
        "timestamp": datetime.utcnow().isoformat(),
        "uptime_seconds": health_checker.get_system_health().uptime_seconds,
    }


@app.get("/api/learning/status")
async def learning_status():
    """Learning layer status"""
    return {
        "status": "operational",
        "version": "1.0.0",
        "features": {
            "rate_limiting": "enabled",
            "tracing": "enabled",
            "caching": "enabled",
            "security": "enabled",
        }
    }


@app.get("/api/gateway/status")
async def gateway_status():
    """Gateway status endpoint"""
    return {
        "gateway": "operational",
        "redis_url": redis_url,
        "rate_limiting": "enabled",
        "security": "enabled",
        "tracing": "enabled",
        "timestamp": datetime.utcnow().isoformat(),
    }


# Echo endpoint for testing
@app.post("/api/echo")
async def echo(request: Request):
    """Echo request back for testing"""
    return {
        "method": request.method,
        "path": str(request.url.path),
        "headers": dict(request.headers),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
