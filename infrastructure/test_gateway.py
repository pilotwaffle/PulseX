"""
TORQ Infrastructure Test Script
Demonstrates rate limiting, security, caching, and tracing
"""

import asyncio
import logging
from datetime import datetime

from .gateway import TORQGateway, create_gateway
from .rate_limit import RateLimiter, RateLimitConfig, RateLimitTier
from .security import SecurityMiddleware, SecurityConfig, SecurityLevel
from .cache import CacheManager, CacheConfig
from .tracing import Tracer, TraceConfig, traced
from .health import HealthChecker, HealthCheckConfig, HealthStatus


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


async def test_rate_limiting():
    """Test rate limiting with different tiers"""
    print("\n" + "="*60)
    print("Testing Rate Limiting")
    print("="*60)

    # Create rate limiter with test config
    config = RateLimitConfig(
        public_rate=5,  # 5 requests per minute for testing
        admin_rate=2,
        mcp_rate=10,
        window_seconds=60,
        fallback_enabled=True,
    )

    limiter = RateLimiter(config=config)

    # Test public tier
    print("\n--- Testing Public Tier (5 req/min) ---")
    identifier = "test_client_public"

    for i in range(1, 8):
        try:
            info = await limiter.check_rate_limit(identifier, RateLimitTier.PUBLIC)
            print(f"Request {i}: OK - Remaining: {info.remaining}")
        except Exception as e:
            print(f"Request {i}: RATE LIMITED - {e}")

    # Test MCP tier
    print("\n--- Testing MCP Tier (10 req/min) ---")
    identifier_mcp = "test_client_mcp"

    for i in range(1, 13):
        try:
            info = await limiter.check_rate_limit(identifier_mcp, RateLimitTier.MCP)
            print(f"Request {i}: OK - Remaining: {info.remaining}")
        except Exception as e:
            print(f"Request {i}: RATE LIMITED - {e}")

    # Test usage stats
    print("\n--- Usage Statistics ---")
    stats = await limiter.get_usage("test_client_public")
    print(f"Public client stats: {stats}")

    stats = await limiter.get_usage("test_client_mcp")
    print(f"MCP client stats: {stats}")


async def test_security():
    """Test API key validation and security features"""
    print("\n" + "="*60)
    print("Testing Security Middleware")
    print("="*60)

    security = SecurityMiddleware()

    # Generate API keys
    print("\n--- Generating API Keys ---")

    public_key, public_apikey = await asyncio.create_task(
        asyncio.to_thread(security.generate_api_key, "test-user", SecurityLevel.AUTHENTICATED)
    )
    print(f"Generated public API key: {public_key[:20]}...")

    admin_key, admin_apikey = await asyncio.create_task(
        asyncio.to_thread(security.generate_api_key, "admin-user", SecurityLevel.ADMIN, scopes=["admin"])
    )
    print(f"Generated admin API key: {admin_key[:20]}...")

    # Test validation
    print("\n--- Testing API Key Validation ---")

    try:
        validated = await security.validate_api_key(public_key)
        print(f"Public key validated: {validated.key_id} - Level: {validated.level}")
    except Exception as e:
        print(f"Validation error: {e}")

    try:
        validated = await security.validate_api_key(admin_key)
        print(f"Admin key validated: {validated.key_id} - Level: {validated.level}")
    except Exception as e:
        print(f"Validation error: {e}")

    # Test invalid key
    print("\n--- Testing Invalid Key ---")
    try:
        await security.validate_api_key("invalid_key_12345")
    except Exception as e:
        print(f"Expected error: {e}")


async def test_caching():
    """Test Redis caching functionality"""
    print("\n" + "="*60)
    print("Testing Cache Manager")
    print("="*60)

    cache = CacheManager(CacheConfig(enabled=True))

    # Test basic set/get
    print("\n--- Testing Basic Cache Operations ---")
    await cache.set("test_key", {"data": "test_value", "timestamp": datetime.utcnow().isoformat()})
    value = await cache.get("test_key")
    print(f"Cached value: {value}")

    # Test cache miss
    value = await cache.get("nonexistent_key")
    print(f"Cache miss: {value}")

    # Test get_or_set
    print("\n--- Testing get_or_set ---")
    async def factory():
        return {"factory": "generated", "time": datetime.utcnow().isoformat()}

    value = await cache.get_or_set("factory_key", factory)
    print(f"Factory generated value: {value}")

    # Test tag-based invalidation
    print("\n--- Testing Tag-based Invalidation ---")
    await cache.set("tagged_key1", "data1", tags=["search", "semantic"])
    await cache.set("tagged_key2", "data2", tags=["search", "vector"])

    count = await cache.invalidate_by_tag("search")
    print(f"Invalidated {count} entries with 'search' tag")

    # Test cache stats
    print("\n--- Cache Statistics ---")
    stats = await cache.get_stats()
    print(f"Cache stats: {stats}")


async def test_tracing():
    """Test distributed tracing"""
    print("\n" + "="*60)
    print("Testing Distributed Tracing")
    print("="*60)

    config = TraceConfig(
        service_name="torq-test",
        exporter_type="console",
    )

    tracer = Tracer(config)

    # Create a trace span
    print("\n--- Creating Trace Spans ---")

    with tracer.start_span("test_operation", attributes={"operation": "test"}) as span:
        print(f"Span started: {span.span_id}")

        span.set_attribute("test_attr", "test_value")
        span.add_event("test_event", {"event_data": "value"})

        # Create nested span
        with tracer.start_span("nested_operation", parent_span_id=span.span_id) as nested:
            print(f"Nested span: {nested.span_id}")
            nested.set_attribute("nested", True)

    print(f"Span completed with status: {span.status}")


async def test_health_checks():
    """Test health monitoring"""
    print("\n" + "="*60)
    print("Testing Health Monitoring")
    print("="*60)

    health_checker = HealthChecker(
        redis_url="redis://localhost:6379",
        config=HealthCheckConfig(
            check_redis=True,
            check_database=False,  # Skip DB check if not configured
            check_llm=False,
        ),
    )

    # Get health status
    print("\n--- System Health Status ---")
    health = await health_checker.get_health_status()
    print(f"Overall status: {health['status']}")

    for service_name, service_health in health.get("services", {}).items():
        print(f"\n{service_name}:")
        print(f"  Status: {service_health['status']}")
        print(f"  Message: {service_health.get('message', 'N/A')}")
        print(f"  Response time: {service_health.get('response_time_ms', 0):.2f}ms")


async def test_gateway():
    """Test the complete gateway"""
    print("\n" + "="*60)
    print("Testing TORQ API Gateway")
    print("="*60)

    # Create gateway
    gateway = create_gateway(
        redis_url="redis://localhost:6379",
        enable_tracing=True,
        enable_cache=True,
    )

    print("\n--- Gateway Created ---")
    print(f"Gateway: {gateway}")
    print(f"Routes available: /health, /api/telemetry/health, /api/gateway/status")

    # Test health endpoint
    print("\n--- Testing Health Endpoint ---")
    health = await gateway.health_checker.get_health_status()
    print(f"Gateway health: {health}")


async def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("TORQ Infrastructure Suite - Test Suite")
    print("="*60)
    print(f"Test started at: {datetime.utcnow().isoformat()}")

    try:
        await test_rate_limiting()
        await test_security()
        await test_caching()
        await test_tracing()
        await test_health_checks()
        await test_gateway()
    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)

    print("\n" + "="*60)
    print("Test Suite Completed")
    print(f"Test finished at: {datetime.utcnow().isoformat()}")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())
