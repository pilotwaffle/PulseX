"""
TORQ Infrastructure Configuration
Production configuration for API Gateway, Rate Limiting, Caching, and Tracing
"""

import os
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional

from .rate_limit import RateLimitConfig, RateLimitTier
from .security import SecurityConfig
from .cache import CacheConfig
from .tracing import TraceConfig
from .health import HealthCheckConfig


@dataclass
class InfrastructureConfig:
    """
    Complete infrastructure configuration

    Environment Variables:
    - REDIS_URL: Redis connection URL
    - OTEL_EXPORTER_ENDPOINT: OpenTelemetry exporter endpoint
    - TORQ_ADMIN_TOKEN: Admin authentication token
    - TORQ_PROXY_SECRET: Gateway secret key
    - SUPABASE_URL: Supabase connection URL
    - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
    """

    # Redis Configuration
    redis_url: str = field(default_factory=lambda: os.getenv(
        "REDIS_URL",
        "redis://localhost:6379"
    ))

    # Rate Limiting Configuration
    rate_limit_config: RateLimitConfig = field(default_factory=lambda: RateLimitConfig(
        public_rate=60,
        admin_rate=20,
        mcp_rate=120,
        window_seconds=60,
        burst_multiplier=1.5,
        key_prefix="torq:rate_limit:",
        enabled=True,
        fallback_enabled=True,
        fallback_rate=30,
    ))

    # Security Configuration
    security_config: SecurityConfig = field(default_factory=lambda: SecurityConfig(
        require_api_key=False,
        api_key_header="X-API-Key",
        admin_api_key_header="X-Admin-API-Key",
        enable_abuse_detection=True,
        abuse_score_threshold=100,
        abuse_block_duration=300,
        enable_ip_blacklist=True,
        enable_ip_whitelist=False,
        trusted_proxies=["127.0.0.1"],
        enable_security_headers=True,
        content_security_policy="default-src 'self'",
        strict_transport_security=True,
        security_rate_limit=10,
    ))

    # Cache Configuration
    cache_config: CacheConfig = field(default_factory=lambda: CacheConfig(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379"),
        key_prefix="torq:cache:",
        default_ttl=300,
        max_memory_mb=256,
        max_items=10000,
        strategy="ttl",
        enabled=True,
        fallback_enabled=True,
        fallback_max_size=1000,
        enable_compression=True,
        compression_threshold=1024,
    ))

    # Tracing Configuration
    tracing_config: TraceConfig = field(default_factory=lambda: TraceConfig(
        service_name="torq-gateway",
        service_version="1.0.0",
        sample_rate=1.0,
        exporter_type=os.getenv("OTEL_EXPORTER_TYPE", "console"),
        exporter_endpoint=os.getenv("OTEL_EXPORTER_ENDPOINT"),
        exporter_headers={},
        batch_export=True,
        batch_size=100,
        batch_timeout=5,
        enabled=os.getenv("OTEL_ENABLED", "true").lower() == "true",
        propagate_trace_id=True,
        trace_id_header="X-Trace-ID",
        span_context_header="X-Span-Context",
    ))

    # Health Check Configuration
    health_config: HealthCheckConfig = field(default_factory=lambda: HealthCheckConfig(
        check_interval_seconds=30,
        timeout_seconds=5,
        degraded_threshold=3,
        unhealthy_threshold=5,
        check_redis=True,
        check_database=False,
        check_llm=False,
        check_supabase=False,
    ))

    # Gateway Configuration
    gateway_name: str = "TORQ API Gateway"
    gateway_version: str = "1.0.0"
    enable_tracing: bool = field(default_factory=lambda: os.getenv("TRACING_ENABLED", "true").lower() == "true")
    enable_cache: bool = field(default_factory=lambda: os.getenv("CACHE_ENABLED", "true").lower() == "true")
    enable_rate_limiting: bool = field(default_factory=lambda: os.getenv("RATE_LIMITING_ENABLED", "true").lower() == "true")

    # CORS Configuration
    allowed_origins: List[str] = field(default_factory=lambda: os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,https://yourdomain.com"
    ).split(","))

    # Admin Configuration
    admin_token: str = field(default_factory=lambda: os.getenv("TORQ_ADMIN_TOKEN", ""))
    mcp_proxy_url: Optional[str] = field(default_factory=lambda: os.getenv("MCP_PROXY_URL"))
    admin_proxy_url: Optional[str] = field(default_factory=lambda: os.getenv("ADMIN_PROXY_URL"))

    # Database Configuration
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    supabase_url: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", ""))
    supabase_service_role_key: str = field(default_factory=lambda: os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))

    # LLM Configuration
    llm_provider: str = field(default_factory=lambda: os.getenv("LLM_PROVIDER", "openai"))
    llm_api_key: str = field(default_factory=lambda: os.getenv("LLM_API_KEY", ""))
    llm_model: str = field(default_factory=lambda: os.getenv("LLM_MODEL", "gpt-4"))

    # Environment
    environment: str = field(default_factory=lambda: os.getenv("ENVIRONMENT", "development"))
    debug: bool = field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")

    @classmethod
    def from_env(cls) -> "InfrastructureConfig":
        """Create configuration from environment variables"""
        return cls()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "gateway": {
                "name": self.gateway_name,
                "version": self.gateway_version,
                "environment": self.environment,
            },
            "redis": {
                "url": self.redis_url,
            },
            "tracing": {
                "enabled": self.enable_tracing,
                "exporter_type": self.tracing_config.exporter_type,
                "endpoint": self.tracing_config.exporter_endpoint,
            },
            "cache": {
                "enabled": self.enable_cache,
                "default_ttl": self.cache_config.default_ttl,
            },
            "rate_limiting": {
                "enabled": self.enable_rate_limiting,
                "public_rate": self.rate_limit_config.public_rate,
                "admin_rate": self.rate_limit_config.admin_rate,
                "mcp_rate": self.rate_limit_config.mcp_rate,
            },
            "security": {
                "require_api_key": self.security_config.require_api_key,
                "abuse_detection": self.security_config.enable_abuse_detection,
            },
        }


# Predefined configurations for different environments
class DevelopmentConfig(InfrastructureConfig):
    """Development environment configuration"""
    environment = "development"
    debug = True
    enable_tracing = True
    rate_limit_config = RateLimitConfig(
        public_rate=100,
        admin_rate=50,
        mcp_rate=200,
        window_seconds=60,
        enabled=True,
        fallback_enabled=True,
    )
    tracing_config = TraceConfig(
        service_name="torq-gateway-dev",
        exporter_type="console",
        enabled=True,
    )


class ProductionConfig(InfrastructureConfig):
    """Production environment configuration"""
    environment = "production"
    debug = False
    enable_tracing = True
    rate_limit_config = RateLimitConfig(
        public_rate=60,
        admin_rate=20,
        mcp_rate=120,
        window_seconds=60,
        enabled=True,
        fallback_enabled=True,
    )
    tracing_config = TraceConfig(
        service_name="torq-gateway",
        exporter_type="otlp",
        enabled=True,
    )


class TestingConfig(InfrastructureConfig):
    """Testing environment configuration"""
    environment = "testing"
    debug = True
    enable_tracing = False
    rate_limit_config = RateLimitConfig(
        public_rate=1000,  # Very high for testing
        admin_rate=500,
        mcp_rate=2000,
        window_seconds=60,
        enabled=False,  # Disabled for tests
    )
    tracing_config = TraceConfig(
        service_name="torq-gateway-test",
        exporter_type="console",
        enabled=False,
    )


def get_config() -> InfrastructureConfig:
    """Get configuration based on environment"""
    env = os.getenv("ENVIRONMENT", "development").lower()

    if env == "production":
        return ProductionConfig.from_env()
    elif env == "testing":
        return TestingConfig.from_env()
    else:
        return DevelopmentConfig.from_env()


__all__ = [
    "InfrastructureConfig",
    "DevelopmentConfig",
    "ProductionConfig",
    "TestingConfig",
    "get_config",
]
