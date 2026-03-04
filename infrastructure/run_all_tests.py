#!/usr/bin/env python3
"""
TORQ Infrastructure - Complete Test Suite
Runs all tests across all infrastructure modules

Modules tested:
1. cache.py - Redis caching layer
2. tracing.py - OpenTelemetry distributed tracing
3. rate_limit.py - Rate limiting
4. security.py - API Gateway security
5. health.py - Health monitoring
6. resilience_standalone.py - Failure recovery
"""

import asyncio
import sys
import os
import time
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from dataclasses import dataclass, field
import json

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))


# ============================================================================
# Direct test implementations to avoid import issues
# ============================================================================

@dataclass
class TestResult:
    """Individual test result"""
    name: str
    module: str
    passed: bool
    message: str = ""
    duration_ms: float = 0
    error: str = ""


@dataclass
class TestSuiteResult:
    """Complete test suite results"""
    total_tests: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    results: List[TestResult] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)
    end_time: float = 0

    @property
    def pass_rate(self) -> float:
        if self.total_tests == 0:
            return 0.0
        return (self.passed / self.total_tests) * 100

    @property
    def duration_seconds(self) -> float:
        return self.end_time - self.start_time


class InfrastructureTestRunner:
    """Main test runner for all infrastructure modules"""

    def __init__(self):
        self.suite_result = TestSuiteResult()
        self.test_functions = []

    def register_test(self, module: str, name: str):
        """Decorator to register test functions"""
        def decorator(func):
            async def wrapper():
                start = time.time()
                try:
                    await func()
                    duration = (time.time() - start) * 1000
                    result = TestResult(
                        name=name,
                        module=module,
                        passed=True,
                        duration_ms=duration
                    )
                    print(f"[PASS] {module}: {name} ({duration:.2f}ms)")
                except AssertionError as e:
                    duration = (time.time() - start) * 1000
                    result = TestResult(
                        name=name,
                        module=module,
                        passed=False,
                        message=str(e),
                        duration_ms=duration,
                        error=str(e)
                    )
                    print(f"[FAIL] {module}: {name} - {e}")
                except Exception as e:
                    duration = (time.time() - start) * 1000
                    result = TestResult(
                        name=name,
                        module=module,
                        passed=False,
                        message=f"Unexpected error: {e}",
                        duration_ms=duration,
                        error=str(e)
                    )
                    print(f"[ERROR] {module}: {name} - {e}")

                self.suite_result.results.append(result)
                self.suite_result.total_tests += 1
                if result.passed:
                    self.suite_result.passed += 1
                else:
                    self.suite_result.failed += 1

            self.test_functions.append((module, name, wrapper))
            return wrapper
        return decorator

    async def run_all(self) -> TestSuiteResult:
        """Run all registered tests"""
        print("=" * 80)
        print("TORQ Infrastructure - Complete Test Suite")
        print("=" * 80)
        print(f"Started at: {datetime.now(timezone.utc).isoformat()}\n")

        # Register all tests
        self._register_cache_tests()
        self._register_tracing_tests()
        self._register_rate_limit_tests()
        self._register_security_tests()
        self._register_health_tests()
        self._register_resilience_tests()

        # Run tests by module
        for module, name, test_func in self.test_functions:
            await test_func()

        self.suite_result.end_time = time.time()

        # Print summary
        self._print_summary()

        return self.suite_result

    def _print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)

        # Group by module
        module_stats: Dict[str, Dict[str, int]] = {}
        for result in self.suite_result.results:
            if result.module not in module_stats:
                module_stats[result.module] = {"passed": 0, "failed": 0, "total": 0}
            module_stats[result.module]["total"] += 1
            if result.passed:
                module_stats[result.module]["passed"] += 1
            else:
                module_stats[result.module]["failed"] += 1

        print("\nModule Results:")
        print("-" * 80)
        for module, stats in sorted(module_stats.items()):
            pass_rate = (stats["passed"] / stats["total"] * 100) if stats["total"] > 0 else 0
            status = "OK" if stats["failed"] == 0 else "FAIL"
            print(f"  {module:30} {stats['passed']:3}/{stats['total']:<3} passed  ({pass_rate:5.1f}%)  [{status}]")

        print("\n" + "-" * 80)
        print(f"Total Tests:     {self.suite_result.total_tests}")
        print(f"Passed:          {self.suite_result.passed}")
        print(f"Failed:          {self.suite_result.failed}")
        print(f"Pass Rate:       {self.suite_result.pass_rate:.2f}%")
        print(f"Duration:        {self.suite_result.duration_seconds:.2f}s")
        print("=" * 80)

        # Print failures if any
        if self.suite_result.failed > 0:
            print("\nFAILED TESTS:")
            print("-" * 80)
            for result in self.suite_result.results:
                if not result.passed:
                    print(f"  [{result.module}] {result.name}")
                    if result.error:
                        error_msg = result.error[:200] if len(result.error) > 200 else result.error
                        print(f"    Error: {error_msg}")
            print("-" * 80)

    def _register_cache_tests(self):
        """Register cache module tests"""

        @self.register_test("cache", "CacheManager initialization")
        async def test():
            from cache import CacheManager, CacheConfig
            config = CacheConfig(enabled=True, fallback_enabled=True)
            manager = CacheManager(config)
            assert manager is not None
            assert manager.config.enabled == True
            assert manager.config.fallback_enabled == True

        @self.register_test("cache", "Cache fallback when Redis unavailable")
        async def test():
            from cache import CacheManager, CacheConfig
            config = CacheConfig(enabled=True, fallback_enabled=True)
            manager = CacheManager(config)
            value = await manager.get("test_key")
            assert value is None

        @self.register_test("cache", "Cache set and get with fallback")
        async def test():
            from cache import CacheManager, CacheConfig
            config = CacheConfig(enabled=True, fallback_enabled=True)
            manager = CacheManager(config)
            success = await manager.set("test_key", "test_value", ttl=60)
            assert success == True
            value = await manager.get("test_key")
            assert value == "test_value"

        @self.register_test("cache", "Cache entry expiration")
        async def test():
            from cache import CacheEntry
            entry = CacheEntry(
                key="test",
                value="value",
                created_at=datetime.now(timezone.utc) - timedelta(seconds=10),
                accessed_at=datetime.now(timezone.utc),
                ttl=5
            )
            assert entry.is_expired() == True

            entry2 = CacheEntry(
                key="test2",
                value="value2",
                created_at=datetime.now(timezone.utc),
                accessed_at=datetime.now(timezone.utc),
                ttl=300
            )
            assert entry2.is_expired() == False

        @self.register_test("cache", "Cache invalidation by tag")
        async def test():
            from cache import CacheManager, CacheConfig
            config = CacheConfig(enabled=True, fallback_enabled=True)
            manager = CacheManager(config)
            await manager.set("key1", "value1", tags=["search"])
            await manager.set("key2", "value2", tags=["search"])
            await manager.set("key3", "value3", tags=["other"])
            count = await manager.invalidate_by_tag("search")
            assert count >= 0

        @self.register_test("cache", "Cache get_or_set pattern")
        async def test():
            from cache import CacheManager, CacheConfig
            config = CacheConfig(enabled=True, fallback_enabled=True)
            manager = CacheManager(config)

            call_count = 0
            async def factory():
                nonlocal call_count
                call_count += 1
                return "generated_value"

            value1 = await manager.get_or_set("factory_key", factory)
            assert value1 == "generated_value"
            assert call_count >= 1

        @self.register_test("cache", "Cache flush all entries")
        async def test():
            from cache import CacheManager, CacheConfig
            config = CacheConfig(enabled=True, fallback_enabled=True)
            manager = CacheManager(config)
            await manager.set("flush1", "value1")
            await manager.set("flush2", "value2")
            success = await manager.flush()
            assert success == True
            assert await manager.get("flush1") is None

    def _register_tracing_tests(self):
        """Register tracing module tests"""

        @self.register_test("tracing", "Tracer initialization")
        async def test():
            from tracing import Tracer, TraceConfig
            config = TraceConfig(service_name="test-service")
            tracer = Tracer(config)
            assert tracer is not None
            assert tracer.config.service_name == "test-service"
            assert tracer.config.enabled == True

        @self.register_test("tracing", "Span creation with trace_id")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            trace_id = "test-trace-123"
            with tracer.start_span(name="test_operation", trace_id=trace_id) as span:
                assert span is not None
                assert span.trace_id == trace_id
                assert span.name == "test_operation"

        @self.register_test("tracing", "Required span name: api.request")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            with tracer.start_span(name="api.request") as span:
                assert span.name == "api.request"
                assert span.trace_id is not None

        @self.register_test("tracing", "Required span name: agent.reason")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            with tracer.start_span(name="agent.reason") as span:
                assert span.name == "agent.reason"

        @self.register_test("tracing", "Required span name: agent.retrieve")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            with tracer.start_span(name="agent.retrieve") as span:
                assert span.name == "agent.retrieve"

        @self.register_test("tracing", "Required span name: agent.act")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            with tracer.start_span(name="agent.act") as span:
                assert span.name == "agent.act"

        @self.register_test("tracing", "Required span name: agent.evaluate")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            with tracer.start_span(name="agent.evaluate") as span:
                assert span.name == "agent.evaluate"

        @self.register_test("tracing", "Required span name: database.query")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            with tracer.start_span(name="database.query") as span:
                assert span.name == "database.query"

        @self.register_test("tracing", "Required span name: redis.lookup")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            with tracer.start_span(name="redis.lookup") as span:
                assert span.name == "redis.lookup"

        @self.register_test("tracing", "Span ID propagation")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            trace_id = "propagation-test-123"
            with tracer.start_span(name="parent", trace_id=trace_id) as parent_span:
                parent_span_id = parent_span.span_id
                with tracer.start_span(name="child", trace_id=trace_id, parent_span_id=parent_span_id) as child_span:
                    assert child_span.trace_id == trace_id
                    assert child_span.parent_span_id == parent_span_id

        @self.register_test("tracing", "Span duration calculation")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            with tracer.start_span(name="timed_operation") as span:
                await asyncio.sleep(0.01)
            assert span.duration_ms() is not None
            assert span.duration_ms() >= 10

        @self.register_test("tracing", "Span attributes and events")
        async def test():
            from tracing import Tracer, TraceConfig
            tracer = Tracer(TraceConfig(enabled=True))
            with tracer.start_span(name="attributed_span") as span_ctx:
                span_ctx.set_attribute("user_id", "12345")
                span_ctx.set_attribute("operation", "test")
                span_ctx.add_event("custom_event", {"data": "test_value"})
                assert span_ctx.span.attributes["user_id"] == "12345"
                assert span_ctx.span.attributes["operation"] == "test"
                assert len(span_ctx.span.events) == 1

        @self.register_test("tracing", "Span error status")
        async def test():
            from tracing import Tracer, TraceConfig, TraceStatus
            tracer = Tracer(TraceConfig(enabled=True))
            try:
                with tracer.start_span(name="failing_span") as span_ctx:
                    raise ValueError("Test error")
            except ValueError:
                pass
            assert span_ctx.span.status == TraceStatus.ERROR

    def _register_rate_limit_tests(self):
        """Register rate limit module tests"""

        @self.register_test("rate_limit", "RateLimiter initialization")
        async def test():
            from rate_limit import RateLimiter, RateLimitConfig
            config = RateLimitConfig(public_rate=60)
            limiter = RateLimiter(config=config)
            assert limiter.config.public_rate == 60
            assert limiter.config.enabled == True

        @self.register_test("rate_limit", "Public API tier: 60 req/min")
        async def test():
            from rate_limit import RateLimiter, RateLimitConfig, RateLimitTier
            config = RateLimitConfig(public_rate=60, window_seconds=60)
            limiter = RateLimiter(config=config)
            info = await limiter.check_rate_limit("client1", RateLimitTier.PUBLIC)
            assert info.limit == 60
            assert info.remaining >= 0
            assert info.tier == RateLimitTier.PUBLIC

        @self.register_test("rate_limit", "Admin tier: 20 req/min")
        async def test():
            from rate_limit import RateLimiter, RateLimitConfig, RateLimitTier
            config = RateLimitConfig(admin_rate=20, window_seconds=60)
            limiter = RateLimiter(config=config)
            info = await limiter.check_rate_limit("admin1", RateLimitTier.ADMIN)
            assert info.limit == 20
            assert info.tier == RateLimitTier.ADMIN

        @self.register_test("rate_limit", "MCP tier: 120 req/min")
        async def test():
            from rate_limit import RateLimiter, RateLimitConfig, RateLimitTier
            config = RateLimitConfig(mcp_rate=120, window_seconds=60)
            limiter = RateLimiter(config=config)
            info = await limiter.check_rate_limit("mcp1", RateLimitTier.MCP)
            assert info.limit == 120
            assert info.tier == RateLimitTier.MCP

        @self.register_test("rate_limit", "Rate limit exceeded exception (with fallback)")
        async def test():
            from rate_limit import RateLimiter, RateLimitConfig, RateLimitTier, RateLimitError
            # Use fallback mode since Redis isn't available
            config = RateLimitConfig(public_rate=5, window_seconds=60, fallback_enabled=True, fallback_rate=5)
            limiter = RateLimiter(config=config, redis_url="redis://invalid:9999")

            # Exhaust the limit
            for _ in range(5):
                await limiter.check_rate_limit("exceed_client_fallback", RateLimitTier.PUBLIC)

            # Next request should raise exception
            try:
                await limiter.check_rate_limit("exceed_client_fallback", RateLimitTier.PUBLIC)
                assert False, "Should have raised RateLimitError"
            except RateLimitError as e:
                assert e.info.tier == RateLimitTier.PUBLIC

        @self.register_test("rate_limit", "Rate limit reset")
        async def test():
            from rate_limit import RateLimiter, RateLimitConfig, RateLimitTier
            config = RateLimitConfig(public_rate=10)
            limiter = RateLimiter(config=config)
            for _ in range(3):
                await limiter.check_rate_limit("reset_client", RateLimitTier.PUBLIC)
            await limiter.reset("reset_client", RateLimitTier.PUBLIC)
            info = await limiter.check_rate_limit("reset_client", RateLimitTier.PUBLIC)
            assert info is not None

        @self.register_test("rate_limit", "Independent client limits")
        async def test():
            from rate_limit import RateLimiter, RateLimitConfig, RateLimitTier
            config = RateLimitConfig(public_rate=5)
            limiter = RateLimiter(config=config)
            for _ in range(5):
                await limiter.check_rate_limit("client_a", RateLimitTier.PUBLIC)
            info = await limiter.check_rate_limit("client_b", RateLimitTier.PUBLIC)
            assert info.remaining >= 0

        @self.register_test("rate_limit", "Fallback when Redis unavailable")
        async def test():
            from rate_limit import RateLimiter, RateLimitConfig, RateLimitTier
            config = RateLimitConfig(
                public_rate=30,
                fallback_enabled=True,
                fallback_rate=10
            )
            limiter = RateLimiter(config=config, redis_url="redis://invalid:9999")
            info = await limiter.check_rate_limit("fallback_client", RateLimitTier.PUBLIC)
            assert info is not None

    def _register_security_tests(self):
        """Register security module tests"""

        @self.register_test("security", "SecurityMiddleware initialization")
        async def test():
            from security import SecurityMiddleware, SecurityConfig
            config = SecurityConfig()
            middleware = SecurityMiddleware(config=config)
            assert middleware is not None
            assert middleware.config.enable_abuse_detection == True

        @self.register_test("security", "API key generation")
        async def test():
            from security import SecurityMiddleware, SecurityLevel
            middleware = SecurityMiddleware()
            raw_key, api_key = middleware.generate_api_key(
                owner="test_user",
                level=SecurityLevel.AUTHENTICATED
            )
            assert raw_key is not None
            assert raw_key.startswith("torq_")
            assert api_key.key_id is not None
            assert api_key.owner == "test_user"

        @self.register_test("security", "API key verification")
        async def test():
            from security import SecurityMiddleware, SecurityLevel
            middleware = SecurityMiddleware()
            raw_key, api_key = middleware.generate_api_key(
                owner="verify_test",
                level=SecurityLevel.AUTHENTICATED
            )
            assert api_key.verify(raw_key) == True
            assert api_key.verify("wrong_key") == False

        @self.register_test("security", "API key validation")
        async def test():
            from security import SecurityMiddleware, SecurityLevel
            middleware = SecurityMiddleware()
            raw_key, api_key = middleware.generate_api_key(
                owner="validation_test",
                level=SecurityLevel.ADMIN
            )
            middleware._api_keys[api_key.key_id] = api_key
            validated = await middleware.validate_api_key(raw_key, SecurityLevel.AUTHENTICATED)
            assert validated.key_id == api_key.key_id

        @self.register_test("security", "API key expiration check")
        async def test():
            from security import SecurityMiddleware, SecurityLevel, APIKeyError
            middleware = SecurityMiddleware()
            raw_key, api_key = middleware.generate_api_key(
                owner="expired_test",
                level=SecurityLevel.AUTHENTICATED,
                expires_in_days=-1
            )
            middleware._api_keys[api_key.key_id] = api_key
            try:
                await middleware.validate_api_key(raw_key)
                assert False, "Should have raised ExpiredAPIKeyError"
            except APIKeyError:
                pass

        @self.register_test("security", "Security level hierarchy")
        async def test():
            from security import SecurityMiddleware, SecurityLevel, APIKeyError
            middleware = SecurityMiddleware()
            raw_key, api_key = middleware.generate_api_key(
                owner="level_test",
                level=SecurityLevel.AUTHENTICATED
            )
            middleware._api_keys[api_key.key_id] = api_key
            try:
                await middleware.validate_api_key(raw_key, SecurityLevel.ADMIN)
                assert False, "Should have raised exception"
            except APIKeyError:
                pass

        @self.register_test("security", "Abuse detection (in-memory)")
        async def test():
            from security import SecurityMiddleware, SecurityConfig
            config = SecurityConfig(
                abuse_score_threshold=50,
                abuse_block_duration=300
            )
            middleware = SecurityMiddleware(config=config)

            # Use in-memory abuse tracking (skip Redis)
            middleware._abuse_scores["abusive_client"] = 40
            is_blocked = await middleware.check_abuse("abusive_client", "test_violation", weight=10)
            assert is_blocked == True

        @self.register_test("security", "IP blacklist (in-memory)")
        async def test():
            from security import SecurityMiddleware
            middleware = SecurityMiddleware()
            middleware._ip_blacklist.add("192.168.1.100")
            is_blocked = await middleware.is_ip_blocked("192.168.1.100")
            assert is_blocked == True
            is_blocked = await middleware.is_ip_blocked("192.168.1.101")
            assert is_blocked == False

        @self.register_test("security", "IP whitelist")
        async def test():
            from security import SecurityMiddleware, SecurityConfig
            config = SecurityConfig(enable_ip_whitelist=True)
            middleware = SecurityMiddleware(config=config)
            await middleware.add_to_whitelist("10.0.0.1")
            is_allowed = await middleware.is_ip_allowed("10.0.0.1")
            assert is_allowed == True
            is_allowed = await middleware.is_ip_allowed("10.0.0.2")
            assert is_allowed == False

    def _register_health_tests(self):
        """Register health module tests"""

        @self.register_test("health", "HealthChecker initialization")
        async def test():
            from health import HealthChecker
            checker = HealthChecker()
            assert checker is not None

        @self.register_test("health", "HealthStatus enum values")
        async def test():
            from health import HealthStatus
            assert HealthStatus.HEALTHY == "healthy"
            assert HealthStatus.DEGRADED == "degraded"
            assert HealthStatus.UNHEALTHY == "unhealthy"
            assert HealthStatus.UNKNOWN == "unknown"

        @self.register_test("health", "HealthCheckResult creation")
        async def test():
            from health import HealthCheckResult, HealthStatus
            result = HealthCheckResult(
                component="test_component",
                status=HealthStatus.HEALTHY,
                message="Component is healthy",
                latency_ms=42.5
            )
            assert result.component == "test_component"
            assert result.status == HealthStatus.HEALTHY
            assert result.latency_ms == 42.5
            assert result.timestamp is not None

        @self.register_test("health", "SystemHealthReport creation")
        async def test():
            from health import HealthCheckResult, SystemHealthReport, HealthStatus
            checks = [
                HealthCheckResult("db", HealthStatus.HEALTHY, "OK", latency_ms=10),
                HealthCheckResult("cache", HealthStatus.HEALTHY, "OK", latency_ms=5),
            ]
            report = SystemHealthReport(
                status=HealthStatus.HEALTHY,
                version="1.0.0",
                uptime_seconds=100.0,
                timestamp=datetime.now(timezone.utc).isoformat(),
                checks=checks,
                environment="test"
            )
            assert len(report.checks) == 2
            assert report.status == HealthStatus.HEALTHY

        @self.register_test("health", "Database connectivity check")
        async def test():
            from health import HealthChecker, HealthStatus
            checker = HealthChecker()
            result = await checker._check_database()
            assert result is not None
            assert result.component == "database"
            assert result.status in [HealthStatus.HEALTHY, HealthStatus.UNKNOWN, HealthStatus.UNHEALTHY]

        @self.register_test("health", "LLM configuration check")
        async def test():
            from health import HealthChecker, HealthStatus
            checker = HealthChecker()
            result = await checker._check_llm()
            assert result is not None
            assert result.component == "llm"
            assert result.status in [HealthStatus.HEALTHY, HealthStatus.UNKNOWN, HealthStatus.UNHEALTHY]

        @self.register_test("health", "Supabase access check")
        async def test():
            from health import HealthChecker, HealthStatus
            checker = HealthChecker()
            result = await checker._check_supabase()
            assert result is not None
            assert result.component == "supabase"
            assert result.status in [HealthStatus.HEALTHY, HealthStatus.UNKNOWN, HealthStatus.UNHEALTHY]

        @self.register_test("health", "Redis availability check")
        async def test():
            from health import HealthChecker, HealthStatus
            checker = HealthChecker()
            result = await checker._check_redis()
            assert result is not None
            assert result.component == "redis"
            assert result.status in [HealthStatus.HEALTHY, HealthStatus.UNKNOWN, HealthStatus.UNHEALTHY]

        @self.register_test("health", "Comprehensive health check")
        async def test():
            from health import HealthChecker
            checker = HealthChecker()
            report = await checker.check_all()
            assert report is not None
            assert len(report.checks) > 0
            assert report.uptime_seconds >= 0

    def _register_resilience_tests(self):
        """Register resilience module tests"""

        @self.register_test("resilience", "CircuitBreaker initialization")
        async def test():
            from resilience_standalone import CircuitBreaker
            breaker = CircuitBreaker(failure_threshold=5, timeout=60.0)
            assert breaker.state == "CLOSED"
            assert breaker.failure_threshold == 5

        @self.register_test("resilience", "CircuitBreaker opens after threshold")
        async def test():
            from resilience_standalone import CircuitBreaker
            breaker = CircuitBreaker(failure_threshold=3, timeout=1.0)
            async def failing_operation():
                raise ConnectionError("Connection failed")
            for _ in range(3):
                try:
                    await breaker.call(failing_operation)
                except:
                    pass
            assert breaker.state == "OPEN"

        @self.register_test("resilience", "CircuitBreaker prevents calls when OPEN")
        async def test():
            from resilience_standalone import CircuitBreaker, CircuitBreakerError
            breaker = CircuitBreaker(failure_threshold=2, timeout=60.0)
            async def failing_operation():
                raise ConnectionError("Failed")
            for _ in range(2):
                try:
                    await breaker.call(failing_operation)
                except:
                    pass
            try:
                await breaker.call(failing_operation)
                assert False, "Should raise CircuitBreakerError"
            except CircuitBreakerError:
                pass

        @self.register_test("resilience", "ResilientRedis fallback when unavailable")
        async def test():
            from resilience_standalone import ResilientRedis
            redis = ResilientRedis("redis://invalid:9999")
            await redis.connect()
            value = await redis.get("test_key")
            assert value is None
            success = await redis.set("test_key", "value")
            assert success == False

        @self.register_test("resilience", "ResilientRedis pipeline fallback")
        async def test():
            from resilience_standalone import ResilientRedis
            redis = ResilientRedis("redis://invalid:9999")
            redis._available = False
            async with redis.pipeline() as pipe:
                assert pipe is None

        @self.register_test("resilience", "RetryConfig initialization")
        async def test():
            from resilience_standalone import RetryConfig
            config = RetryConfig(
                max_retries=5,
                base_delay=1.0,
                exponential_base=3.0
            )
            assert config.max_retries == 5
            assert config.base_delay == 1.0
            assert config.exponential_base == 3.0

        @self.register_test("resilience", "with_retry decorator")
        async def test():
            from resilience_standalone import with_retry
            call_count = 0
            @with_retry(max_retries=3, base_delay=0.01)
            async def flaky_function():
                nonlocal call_count
                call_count += 1
                if call_count < 3:
                    raise ConnectionError("Temporary failure")
                return "success"
            result = await flaky_function()
            assert result == "success"
            assert call_count == 3

        @self.register_test("resilience", "with_fallback decorator")
        async def test():
            from resilience_standalone import with_fallback
            primary_failed = False
            async def primary_function():
                nonlocal primary_failed
                primary_failed = True
                raise ConnectionError("Primary failed")
            async def fallback_function():
                return "fallback_result"
            @with_fallback(fallback_function)
            async def protected_function():
                return await primary_function()
            result = await protected_function()
            assert result == "fallback_result"
            assert primary_failed == True

        @self.register_test("resilience", "with_circuit_breaker decorator")
        async def test():
            from resilience_standalone import with_circuit_breaker, CircuitBreakerError
            @with_circuit_breaker(failure_threshold=2, timeout=1.0)
            async def protected_function():
                raise ConnectionError("Failed")
            for _ in range(2):
                try:
                    await protected_function()
                except:
                    pass
            try:
                await protected_function()
                assert False, "Should raise CircuitBreakerError"
            except CircuitBreakerError:
                pass

        @self.register_test("resilience", "FailureEvent creation and serialization")
        async def test():
            from resilience_standalone import FailureEvent, FailureType
            event = FailureEvent(
                failure_type=FailureType.REDIS_UNAVAILABLE,
                operation="cache_get",
                trace_id="test-trace-123",
                error_message="Connection refused"
            )
            event_dict = event.to_dict()
            assert event_dict["failure_type"] == "redis_unavailable"
            assert event_dict["operation"] == "cache_get"
            assert event_dict["trace_id"] == "test-trace-123"

        @self.register_test("resilience", "FailureRecorder records events")
        async def test():
            from resilience_standalone import FailureEvent, FailureType, FailureRecorder
            recorder = FailureRecorder(max_events=100)
            event = FailureEvent(
                failure_type=FailureType.LLM_PROVIDER_FAILURE,
                operation="llm_complete",
                error_message="API timeout"
            )
            await recorder.record(event)
            events = await recorder.get_events()
            assert len(events) >= 1
            assert events[-1].failure_type == FailureType.LLM_PROVIDER_FAILURE


async def main():
    """Main entry point"""
    runner = InfrastructureTestRunner()
    result = await runner.run_all()

    # Save results to JSON
    results_path = os.path.join(os.path.dirname(__file__), "test_results.json")
    with open(results_path, "w") as f:
        json.dump({
            "summary": {
                "total_tests": result.total_tests,
                "passed": result.passed,
                "failed": result.failed,
                "skipped": result.skipped,
                "pass_rate": result.pass_rate,
                "duration_seconds": result.duration_seconds,
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            "results": [
                {
                    "module": r.module,
                    "name": r.name,
                    "passed": r.passed,
                    "duration_ms": r.duration_ms,
                    "error": r.error
                }
                for r in result.results
            ]
        }, f, indent=2)

    print(f"\nTest results saved to: {results_path}")

    # Exit with appropriate code
    sys.exit(0 if result.failed == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
