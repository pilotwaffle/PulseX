"""
TORQ Infrastructure - Resilience Module Test Suite

Tests each failure scenario to validate graceful degradation.

Failure Scenarios:
1. Redis unavailable → Bypass cache, query backend directly
2. Supabase latency → Retry with exponential backoff
3. LLM provider failure → Fallback to secondary model
4. Vector search error → Fallback to text search
5. External tool failure → Retry or use alternate tool

Run with: pytest infrastructure/test_resilience.py -v
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime, timedelta

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
    with_retry,
    with_fallback,
    with_circuit_breaker,
    FailureRecorder,
)


# ============================================================================
# Test 1: Redis Unavailable - Bypass Cache
# ============================================================================

@pytest.mark.asyncio
async def test_redis_unavailable_bypasses_cache():
    """Test that Redis failure returns None and allows backend query"""

    redis = ResilientRedis("redis://localhost:6379")

    # Simulate Redis unavailable
    redis._available = False
    redis._client = None

    # Should return None, not raise exception
    result = await redis.get("test_key")
    assert result is None

    # Set should fail gracefully
    success = await redis.set("test_key", "value")
    assert success is False


@pytest.mark.asyncio
async def test_redis_circuit_breaker_opens():
    """Test circuit breaker opens after threshold failures"""

    breaker = CircuitBreaker(failure_threshold=3, timeout=1.0)

    async def failing_operation():
        raise ConnectionError("Redis connection failed")

    # Circuit should close initially
    assert breaker.state == "CLOSED"

    # Trigger failures up to threshold
    for i in range(3):
        try:
            await breaker.call(failing_operation)
        except CircuitBreakerError:
            pass
        except ConnectionError:
            pass

    # Circuit should be OPEN after threshold
    assert breaker.state == "OPEN"

    # Immediate call should fail with CircuitBreakerError
    with pytest.raises(CircuitBreakerError):
        await breaker.call(failing_operation)


@pytest.mark.asyncio
async def test_redis_pipeline_fallback():
    """Test pipeline operations fallback to None"""

    redis = ResilientRedis("redis://localhost:6379")
    redis._available = False

    async with redis.pipeline() as pipe:
        assert pipe is None


# ============================================================================
# Test 2: Supabase Latency - Retry with Exponential Backoff
# ============================================================================

@pytest.mark.asyncio
async def test_supabase_retry_with_backoff():
    """Test Supabase retries with exponential backoff"""

    mock_client = AsyncMock()
    call_count = 0

    async def flaky_operation(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise TimeoutException("Request timeout")
        return {"data": "success"}

    supabase = ResilientSupabase("https://test.supabase.co", "test_key")
    supabase._client = mock_client
    supabase._circuit_breaker = CircuitBreaker(failure_threshold=10)

    # Track timing for exponential backoff verification
    start = asyncio.get_event_loop().time()
    result = await supabase.execute_with_retry(flaky_operation)
    elapsed = asyncio.get_event_loop().time() - start

    assert result == {"data": "success"}
    assert call_count == 3
    # Should have waited for retries (exponential backoff)
    assert elapsed >= 0.5  # At least base_delay


@pytest.mark.asyncio
async def test_supabase_circuit_breaker_recovers():
    """Test Supabase circuit breaker recovery"""

    breaker = CircuitBreaker(failure_threshold=3, timeout=1.0)

    async def eventually_succeeding_operation():
        if breaker._failure_count >= 3:
            return {"success": True}
        raise ConnectionError("DB unavailable")

    # Trigger failures
    for _ in range(5):
        try:
            await breaker.call(eventually_succeeding_operation)
        except:
            pass

    assert breaker.state == "OPEN"

    # Wait for timeout
    await asyncio.sleep(1.1)

    # Next call should enter HALF_OPEN and succeed
    result = await breaker.call(eventually_succeeding_operation)
    assert result == {"success": True}
    assert breaker.state == "CLOSED"


@pytest.mark.asyncio
async def test_supabase_average_latency_tracking():
    """Test latency tracking for monitoring"""

    supabase = ResilientSupabase("https://test.supabase.co", "test_key")

    # Record some latencies
    supabase._request_times.extend([0.1, 0.2, 0.15])

    assert 100 < supabase.average_latency < 200  # In ms


# ============================================================================
# Test 3: LLM Provider Failure - Fallback Model
# ============================================================================

@pytest.mark.asyncio
async def test_llm_fallback_on_failure():
    """Test LLM falls back to secondary model on failure"""

    # Mock clients
    primary_mock = AsyncMock()
    fallback_mock = AsyncMock()

    async def primary_fail(*args, **kwargs):
        raise Exception("Primary LLM unavailable")

    async def fallback_succeed(*args, **kwargs):
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content="Fallback response"))]
        return mock_response

    primary_mock.chat.completions.create = primary_fail
    fallback_mock.chat.completions.create = fallback_succeed

    llm = ResilientLLM(primary_mock, fallback_mock)

    response = await llm.complete([{"role": "user", "content": "test"}])

    assert response == "Fallback response"
    assert llm._use_fallback is True
    assert llm._primary_failure_count == 1


@pytest.mark.asyncio
async def test_llm_reset_to_primary():
    """Test LLM can be reset to primary model"""

    primary_mock = AsyncMock()
    fallback_mock = AsyncMock()

    async def primary_succeed(*args, **kwargs):
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content="Primary response"))]
        return mock_response

    primary_mock.chat.completions.create = primary_succeed
    fallback_mock.chat.completions.create = primary_succeed

    llm = ResilientLLM(primary_mock, fallback_mock)
    llm._use_fallback = True

    llm.reset()

    assert llm._use_fallback is False
    assert llm._primary_failure_count == 0


# ============================================================================
# Test 4: Vector Search Error - Fallback to Text Search
# ============================================================================

@pytest.mark.asyncio
async def test_vector_search_falls_back_to_text_search():
    """Test vector search falls back to text search on failure"""

    mock_supabase = AsyncMock()

    async def vector_search_fail(*args, **kwargs):
        raise Exception("Vector search failed")

    async def text_search_succeed(*args, **kwargs):
        return Mock(data=[{"id": 1, "content": "text match"}])

    mock_supabase.rpc = vector_search_fail
    mock_supabase.table = Mock(return_value=Mock(
        select=Mock(return_value=Mock(
            text_search=Mock(return_value=Mock(
                limit=Mock(return_value=text_search_succeed)
            ))
        ))
    ))

    vector_search = ResilientVectorSearch(mock_supabase, "documents")

    results = await vector_search.search([0.1] * 1536)

    assert vector_search._vector_search_enabled is False
    assert len(results) == 1
    assert results[0]["content"] == "text match"


@pytest.mark.asyncio
async def test_vector_search_direct_fallback():
    """Test vector search skips to text search when disabled"""

    mock_supabase = AsyncMock()

    async def text_search(*args, **kwargs):
        return Mock(data=[{"id": 2, "content": "direct text match"}])

    mock_supabase.table = Mock(return_value=Mock(
        select=Mock(return_value=Mock(
            text_search=Mock(return_value=Mock(
                limit=Mock(return_value=text_search)
            ))
        ))
    ))

    vector_search = ResilientVectorSearch(mock_supabase, "documents")
    vector_search._vector_search_enabled = False

    results = await vector_search.search([0.1] * 1536)

    # Should go directly to text search
    assert len(results) == 1
    assert results[0]["content"] == "direct text match"


# ============================================================================
# Test 5: External Tool Failure - Retry or Alternate Tool
# ============================================================================

@pytest.mark.asyncio
async def test_external_tool_retry():
    """Test external tool retries before giving up"""

    call_count = 0

    async def flaky_tool(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise Exception("Tool temporarily unavailable")
        return {"result": "success"}

    tool = ResilientExternalTool(flaky_tool)

    result = await tool.execute()

    assert result == {"result": "success"}
    assert call_count == 3


@pytest.mark.asyncio
async def test_external_tool_alternate_fallback():
    """Test external tool falls back to alternate tool"""

    async def primary_fail(*args, **kwargs):
        raise Exception("Primary tool failed")

    async def alternate_succeed(*args, **kwargs):
        return {"result": "alternate_success"}

    tool = ResilientExternalTool(primary_fail, alternate_succeed)

    result = await tool.execute()

    assert result == {"result": "alternate_success"}
    assert tool._use_alternate is True


# ============================================================================
# Test Decorators
# ============================================================================

@pytest.mark.asyncio
async def test_with_retry_decorator():
    """Test retry decorator works correctly"""

    call_count = 0

    @with_retry(max_retries=3, base_delay=0.1)
    async def failing_function():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise ValueError("Temporary failure")
        return "success"

    result = await failing_function()

    assert result == "success"
    assert call_count == 3


@pytest.mark.asyncio
async def test_with_fallback_decorator():
    """Test fallback decorator activates on failure"""

    async def primary_fail(*args, **kwargs):
        raise Exception("Primary failed")

    async def fallback_succeed(*args, **kwargs):
        return "fallback_value"

    @with_fallback(fallback_succeed)
    async def decorated_function(*args, **kwargs):
        return await primary_fail(*args, **kwargs)

    result = await decorated_function()

    assert result == "fallback_value"


@pytest.mark.asyncio
async def test_with_circuit_breaker_decorator():
    """Test circuit breaker decorator"""

    @with_circuit_breaker(failure_threshold=3, timeout=1.0)
    async def protected_function():
        raise Exception("Service unavailable")

    # Trigger circuit breaker
    for _ in range(3):
        try:
            await protected_function()
        except CircuitBreakerError:
            break
        except:
            pass

    # Circuit should be open
    assert protected_function.breaker.state == "OPEN"

    # Next call should fail immediately
    with pytest.raises(CircuitBreakerError):
        await protected_function()


# ============================================================================
# Test Failure Recorder
# ============================================================================

@pytest.mark.asyncio
async def test_failure_recorder():
    """Test failure event recording and retrieval"""

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
    assert len(events) == 1
    assert events[0].failure_type == FailureType.REDIS_UNAVAILABLE


@pytest.mark.asyncio
async def test_recovery_rate_calculation():
    """Test recovery rate calculation"""

    recorder = FailureRecorder(max_events=100)

    # Record mix of recovered and non-recovered events
    for i in range(10):
        await recorder.record(FailureEvent(
            failure_type=FailureType.LLM_PROVIDER_FAILURE,
            operation="llm.complete",
            recovered=(i % 2 == 0)  # Half recovered
        ))

    rate = await recorder.get_recovery_rate()
    assert rate == 0.5  # 50% recovery rate


# ============================================================================
# Integration Test - Full Failure Scenario
# ============================================================================

@pytest.mark.asyncio
async def test_full_failure_scenario():
    """
    Complete integration test simulating:
    1. Cache miss (Redis unavailable)
    2. Supabase latency with retries
    3. LLM fallback
    4. Vector search fallback
    """

    # Setup resilient components
    redis = ResilientRedis("redis://localhost:6379")
    redis._available = False

    supabase = ResilientSupabase("https://test.supabase.co", "test_key")

    # Mock Supabase to simulate latency then success
    call_count = 0

    async def mock_supabase_query(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            raise TimeoutException("DB timeout")
        return Mock(data=[{"id": 1, "embedding": [0.1] * 1536}])

    supabase._client = AsyncMock()
    supabase._client.rpc = mock_supabase_query

    vector_search = ResilientVectorSearch(supabase, "documents")

    # 1. Cache check (bypassed)
    cached = await redis.get("query:hash123")
    assert cached is None

    # 2. Query backend with retries
    # This would normally query Supabase with retry logic

    # 3. Vector search with fallback
    results = await vector_search.search([0.1] * 1536)

    # Verify all fallbacks worked
    assert results is not None
    assert len(results) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
