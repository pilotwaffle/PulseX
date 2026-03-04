"""
TORQ Infrastructure - Standalone Resilience Test Runner

Tests each failure scenario to validate graceful degradation per PRD.

Run: python infrastructure/run_resilience_tests.py
"""

import asyncio
import sys
from datetime import datetime
from typing import List

# Import resilience components
from resilience import (
    FailureType,
    FailureEvent,
    RetryConfig,
    CircuitBreaker,
    CircuitBreakerError,
    ResilientRedis,
    ResilientSupabase,
    ResilientLLM,
    ResilientVectorSearch,
    ResilientExternalTool,
    FailureRecorder,
)


class TestResult:
    """Test result"""
    def __init__(self, name: str, passed: bool, message: str = ""):
        self.name = name
        self.passed = passed
        self.message = message


class TestRunner:
    """Test runner for resilience tests"""

    def __init__(self):
        self.results: List[TestResult] = []

    def add_result(self, name: str, passed: bool, message: str = ""):
        """Add test result"""
        self.results.append(TestResult(name, passed, message))
        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {name}: {message}")

    def print_summary(self):
        """Print test summary"""
        passed = sum(1 for r in self.results if r.passed)
        total = len(self.results)
        print(f"\n{'='*60}")
        print(f"Tests: {passed}/{total} passed")
        if passed == total:
            print("SUCCESS: All resilience tests passed!")
        else:
            print(f"FAILURE: {total - passed} tests failed")
        print(f"{'='*60}")
        return passed == total


async def test_redis_unavailable(runner: TestRunner):
    """Test 1: Redis unavailable - Bypass cache"""
    print("\n=== Test 1: Redis Unavailable - Bypass Cache ===")

    redis = ResilientRedis("redis://localhost:6379")
    redis._available = False

    # Should return None, not raise exception
    result = await redis.get("test_key")
    runner.add_result(
        "redis_unavailable_bypass",
        result is None,
        f"Redis unavailable returns None: {result}"
    )

    # Set should fail gracefully
    success = await redis.set("test_key", "value")
    runner.add_result(
        "redis_set_fails_gracefully",
        success is False,
        f"Redis set fails gracefully: {success}"
    )


async def test_circuit_breaker(runner: TestRunner):
    """Test 2: Circuit breaker opens after threshold"""
    print("\n=== Test 2: Circuit Breaker ===")

    breaker = CircuitBreaker(failure_threshold=3, timeout=1.0)

    async def failing_operation():
        raise ConnectionError("Redis connection failed")

    # Circuit should be closed initially
    runner.add_result(
        "circuit_initially_closed",
        breaker.state == "CLOSED",
        f"Initial state: {breaker.state}"
    )

    # Trigger failures up to threshold
    for i in range(3):
        try:
            await breaker.call(failing_operation)
        except CircuitBreakerError:
            pass
        except ConnectionError:
            pass

    # Circuit should be OPEN after threshold
    runner.add_result(
        "circuit_opens_after_threshold",
        breaker.state == "OPEN",
        f"Circuit state after failures: {breaker.state}"
    )

    # Next call should fail with CircuitBreakerError
    try:
        await breaker.call(failing_operation)
        runner.add_result("circuit_blocks_calls", False, "Should raise CircuitBreakerError")
    except CircuitBreakerError:
        runner.add_result("circuit_blocks_calls", True, "Circuit blocks calls when OPEN")


async def test_supabase_retry(runner: TestRunner):
    """Test 3: Supabase latency - Retry with exponential backoff"""
    print("\n=== Test 3: Supabase Retry ===")

    call_count = 0

    async def flaky_operation(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise TimeoutException("DB timeout")
        return {"data": "success"}

    from httpx import TimeoutException

    supabase = ResilientSupabase("https://test.supabase.co", "test_key")
    supabase._client = type('MockClient', (), {'table': lambda s, n: None})()

    start = asyncio.get_event_loop().time()
    try:
        result = await supabase.execute_with_retry(flaky_operation)
        elapsed = asyncio.get_event_loop().time() - start

        runner.add_result(
            "supabase_retry_success",
            result == {"data": "success"},
            f"Retries succeeded after {call_count} attempts in {elapsed:.2f}s"
        )
    except Exception as e:
        runner.add_result("supabase_retry_success", False, f"Error: {e}")


async def test_llm_fallback(runner: TestRunner):
    """Test 4: LLM provider failure - Fallback model"""
    print("\n=== Test 4: LLM Fallback ===")

    # Mock clients
    primary_mock = type('MockClient', (), {
        'chat': type('Chat', (), {
            'completions': type('Completions', (), {
                'create': lambda *args, **kwargs: (_ for _ in ()).throw(Exception("Primary LLM failed"))
            })()
        })()
    })()

    fallback_mock = type('MockClient', (), {
        'chat': type('Chat', (), {
            'completions': type('Completions', (), {
                'create': lambda *args, **kwargs: type('Response', (), {
                    'choices': [type('Choice', (), {
                        'message': type('Message', (), {'content': 'Fallback response'})()
                    })()]
                })()
            })()
        })()
    })()

    llm = ResilientLLM(primary_mock, fallback_mock)

    response = await llm.complete([{"role": "user", "content": "test"}])

    runner.add_result(
        "llm_fallback_works",
        response == "Fallback response",
        f"LLM fallback response: {response}"
    )


async def test_external_tool_retry(runner: TestRunner):
    """Test 5: External tool failure - Retry or alternate tool"""
    print("\n=== Test 5: External Tool Retry ===")

    call_count = 0

    async def flaky_tool(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise Exception("Tool temporarily unavailable")
        return {"result": "success"}

    tool = ResilientExternalTool(flaky_tool)

    result = await tool.execute()

    runner.add_result(
        "external_tool_retry",
        result == {"result": "success"},
        f"Tool succeeded after {call_count} attempts"
    )


async def test_failure_recorder(runner: TestRunner):
    """Test 6: Failure event recording"""
    print("\n=== Test 6: Failure Recorder ===")

    recorder = FailureRecorder(max_events=100)

    event = FailureEvent(
        failure_type=FailureType.REDIS_UNAVAILABLE,
        operation="redis.get",
        error_message="Connection refused",
        recovered=True,
        fallback_used="direct_query"
    )

    await recorder.record(event)

    events = await recorder.get_events()
    runner.add_result(
        "failure_recorded",
        len(events) == 1 and events[0].failure_type == FailureType.REDIS_UNAVAILABLE,
        f"Recorded {len(events)} events"
    )


async def test_recovery_rate(runner: TestRunner):
    """Test 7: Recovery rate calculation"""
    print("\n=== Test 7: Recovery Rate ===")

    recorder = FailureRecorder(max_events=100)

    # Record mix of recovered and non-recovered events
    for i in range(10):
        await recorder.record(FailureEvent(
            failure_type=FailureType.LLM_PROVIDER_FAILURE,
            operation="llm.complete",
            recovered=(i % 2 == 0)
        ))

    rate = await recorder.get_recovery_rate()
    runner.add_result(
        "recovery_rate_calculated",
        abs(rate - 0.5) < 0.01,
        f"Recovery rate: {rate:.2f}"
    )


async def main():
    """Main test runner"""
    print("="*60)
    print("TORQ Infrastructure Resilience Test Suite")
    print("="*60)
    print(f"Started at: {datetime.utcnow().isoformat()}")

    runner = TestRunner()

    # Run all tests
    await test_redis_unavailable(runner)
    await test_circuit_breaker(runner)
    await test_supabase_retry(runner)
    await test_llm_fallback(runner)
    await test_external_tool_retry(runner)
    await test_failure_recorder(runner)
    await test_recovery_rate(runner)

    # Print summary
    success = runner.print_summary()

    print(f"\nCompleted at: {datetime.utcnow().isoformat()}")

    return 0 if success else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
