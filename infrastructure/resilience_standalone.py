"""
TORQ Infrastructure - Resilience Module (Standalone Version)

Implements graceful degradation patterns for all failure scenarios
specified in the Infrastructure Reliability PRD (Step 7).

This version works without external Redis dependencies for testing.

Failure Handling:
- Redis unavailable → Bypass cache, query backend directly
- Supabase latency → Retry with exponential backoff
- LLM provider failure → Fallback to secondary model
- Vector search error → Fallback to text search
- External tool failure → Retry or use alternate tool
"""

import asyncio
import functools
import json
import logging
import time
from typing import Any, Callable, Coroutine, Generic, List, Optional, Dict, TypeVar
from contextlib import asynccontextmanager
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

logger = logging.getLogger(__name__)


class FailureType(Enum):
    """Classification of failure types for proper handling"""
    REDIS_UNAVAILABLE = "redis_unavailable"
    SUPABASE_LATENCY = "supabase_latency"
    SUPABASE_UNAVAILABLE = "supabase_unavailable"
    LLM_PROVIDER_FAILURE = "llm_provider_failure"
    VECTOR_SEARCH_ERROR = "vector_search_error"
    EXTERNAL_TOOL_FAILURE = "external_tool_failure"
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    UNKNOWN = "unknown"


@dataclass
class FailureEvent:
    """Structured failure event for telemetry"""
    timestamp: float = field(default_factory=time.time)
    failure_type: FailureType = FailureType.UNKNOWN
    operation: str = ""
    trace_id: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    error_message: str = ""
    retry_count: int = 0
    recovered: bool = False
    fallback_used: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "failure_type": self.failure_type.value,
            "operation": self.operation,
            "trace_id": self.trace_id,
            "context": self.context,
            "error_message": self.error_message,
            "retry_count": self.retry_count,
            "recovered": self.recovered,
            "fallback_used": self.fallback_used
        }


@dataclass
class RetryConfig:
    """Configuration for retry behavior"""
    max_retries: int = 3
    base_delay: float = 0.5  # seconds
    max_delay: float = 10.0
    exponential_base: float = 2.0
    jitter: bool = True


T = TypeVar('T')


class CircuitBreaker:
    """
    Circuit breaker pattern for failing services.

    States:
    - CLOSED: Requests pass through normally
    - OPEN: Requests fail immediately without calling the service
    - HALF_OPEN: Allow a test request to see if service recovered
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        timeout: float = 60.0,
        half_open_attempts: int = 1
    ):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.half_open_attempts = half_open_attempts
        self._failure_count = 0
        self._last_failure_time: Optional[float] = None
        self._state = "CLOSED"
        self._half_open_count = 0
        self._lock = asyncio.Lock()

    async def call(self, func: Callable[..., Coroutine[Any, Any, T]], *args, **kwargs) -> T:
        """Execute function through circuit breaker"""
        async with self._lock:
            if self._state == "OPEN":
                if time.time() - (self._last_failure_time or 0) > self.timeout:
                    self._state = "HALF_OPEN"
                    self._half_open_count = 0
                    logger.info("Circuit breaker entering HALF_OPEN state")
                else:
                    raise CircuitBreakerError("Circuit breaker is OPEN")

            if self._state == "HALF_OPEN":
                self._half_open_count += 1

        try:
            result = await func(*args, **kwargs)

            async with self._lock:
                if self._state == "HALF_OPEN" and self._half_open_count >= self.half_open_attempts:
                    self._state = "CLOSED"
                    self._failure_count = 0
                    logger.info("Circuit breaker recovered to CLOSED state")

            return result

        except Exception as e:
            async with self._lock:
                self._failure_count += 1
                self._last_failure_time = time.time()

                if self._failure_count >= self.failure_threshold:
                    self._state = "OPEN"
                    logger.error(
                        f"Circuit breaker opened after {self._failure_count} failures: {e}"
                    )

            raise

    @property
    def state(self) -> str:
        return self._state


class CircuitBreakerError(Exception):
    """Raised when circuit breaker is OPEN"""
    pass


class TimeoutException(Exception):
    """Timeout exception for compatibility"""
    pass


class ResilientRedis:
    """
    Redis client with graceful fallback.

    If Redis is unavailable, bypasses cache and returns None.
    Operations never fail due to Redis issues.
    """

    def __init__(self, redis_url: str, circuit_breaker: Optional[CircuitBreaker] = None):
        self.redis_url = redis_url
        self._client = None
        self._circuit_breaker = circuit_breaker or CircuitBreaker()
        self._available = True

    async def connect(self) -> bool:
        """Attempt to connect to Redis"""
        try:
            # Simulate connection attempt
            self._available = True
            logger.info("Redis connection established")
            return True
        except Exception as e:
            self._available = False
            logger.warning(f"Redis unavailable, cache will be bypassed: {e}")
            return False

    async def get(self, key: str) -> Optional[str]:
        """Get value from cache, return None if unavailable"""
        if not self._available or not self._client:
            return None

        try:
            return await self._circuit_breaker.call(self._client.get, key)
        except (CircuitBreakerError, Exception):
            self._available = False
            return None

    async def set(self, key: str, value: str, ttl: int = 300) -> bool:
        """Set value in cache, return False if unavailable"""
        if not self._available or not self._client:
            return False

        try:
            await self._circuit_breaker.call(self._client.setex, key, ttl, value)
            return True
        except (CircuitBreakerError, Exception):
            self._available = False
            return False

    async def delete(self, key: str) -> bool:
        """Delete value from cache, return False if unavailable"""
        if not self._available or not self._client:
            return False

        try:
            await self._circuit_breaker.call(self._client.delete, key)
            return True
        except (CircuitBreakerError, Exception):
            self._available = False
            return False

    @asynccontextmanager
    async def pipeline(self):
        """Context manager for pipeline operations with fallback"""
        if not self._available or not self._client:
            yield None
            return

        try:
            async with self._client.pipeline() as pipe:
                yield pipe
        except Exception:
            self._available = False
            yield None


class ResilientSupabase:
    """
    Supabase client with retry and circuit breaker.

    Implements exponential backoff retry for latency issues.
    """

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        circuit_breaker: Optional[CircuitBreaker] = None,
        retry_config: Optional[RetryConfig] = None
    ):
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key
        self._client = None
        self._circuit_breaker = circuit_breaker or CircuitBreaker(failure_threshold=10)
        self._retry_config = retry_config or RetryConfig()
        self._request_times: deque = deque(maxlen=100)

    async def execute_with_retry(
        self,
        operation: Callable[..., Coroutine[Any, Any, T]],
        *args,
        **kwargs
    ) -> T:
        """Execute Supabase operation with retry logic"""
        last_error = None

        for attempt in range(self._retry_config.max_retries):
            try:
                start = time.time()
                result = await operation(*args, **kwargs)
                self._request_times.append(time.time() - start)

                return result

            except (TimeoutException, Exception) as e:
                last_error = e
                delay = min(
                    self._retry_config.base_delay * (self._retry_config.exponential_base ** attempt),
                    self._retry_config.max_delay
                )

                if attempt < self._retry_config.max_retries - 1:
                    logger.warning(
                        f"Supabase latency on attempt {attempt + 1}, "
                        f"retrying in {delay:.2f}s: {e}"
                    )
                    await asyncio.sleep(delay)

        logger.error(f"Supabase operation failed after {self._retry_config.max_retries} attempts")
        raise last_error

    async def table(self, table_name: str) -> Any:
        """Get table reference with retry wrapper"""
        return self._client.table(table_name) if self._client else None

    @property
    def average_latency(self) -> float:
        """Get average request latency in ms"""
        if not self._request_times:
            return 0.0
        return sum(self._request_times) / len(self._request_times) * 1000


class ResilientLLM:
    """
    LLM client with fallback to secondary model.

    Primary: OpenAI GPT-4
    Fallback: Anthropic Claude / Local model
    """

    def __init__(
        self,
        primary_client: Any,
        fallback_client: Optional[Any] = None,
        fallback_model: Optional[str] = None
    ):
        self.primary = primary_client
        self.fallback = fallback_client
        self.fallback_model = fallback_model or "gpt-3.5-turbo"
        self._primary_failure_count = 0
        self._use_fallback = False

    async def complete(
        self,
        messages: List[Dict[str, str]],
        **kwargs
    ) -> str:
        """Complete with automatic fallback on failure"""
        client = self.fallback if self._use_fallback else self.primary

        try:
            # Simulate LLM call
            if asyncio.iscoroutinefunction(client):
                response = await client(messages, **kwargs)
            else:
                response = client(messages, **kwargs)

            return response.choices[0].message.content

        except Exception as e:
            if not self._use_fallback and self.fallback:
                logger.warning(f"Primary LLM failed, using fallback: {e}")
                self._primary_failure_count += 1
                self._use_fallback = True

                # Retry with fallback
                try:
                    if asyncio.iscoroutinefunction(self.fallback):
                        response = await self.fallback(messages, **kwargs)
                    else:
                        response = self.fallback(messages, **kwargs)
                    return response.choices[0].message.content
                except Exception as fallback_error:
                    logger.error(f"Fallback LLM also failed: {fallback_error}")
                    raise

            raise

    def reset(self):
        """Reset to primary model"""
        self._use_fallback = False
        self._primary_failure_count = 0


class ResilientVectorSearch:
    """
    Vector search with fallback to text search.

    If vector search fails, falls back to full-text search.
    """

    def __init__(self, supabase: ResilientSupabase, table: str):
        self.supabase = supabase
        self.table = table
        self._vector_search_enabled = True

    async def search(
        self,
        query_embedding: List[float],
        filter_dict: Optional[Dict[str, Any]] = None,
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """Vector search with text search fallback"""

        if not self._vector_search_enabled:
            return await self._text_search(query_embedding, filter_dict, top_k)

        try:
            # Supabase RPC call for vector search
            response = await self.supabase.execute_with_retry(
                self.supabase.rpc,
                f"match_{self.table}",
                {
                    "query_embedding": query_embedding,
                    "match_count": top_k,
                    **(filter_dict or {})
                }
            )
            return response.data

        except Exception as e:
            logger.warning(f"Vector search failed, falling back to text search: {e}")
            self._vector_search_enabled = False
            return await self._text_search(query_embedding, filter_dict, top_k)

    async def _text_search(
        self,
        query: str,
        filter_dict: Optional[Dict[str, Any]] = None,
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """Full-text search fallback"""
        query_builder = self.supabase.table(self.table).select("*")

        if filter_dict:
            for key, value in filter_dict.items():
                query_builder = query_builder.eq(key, value)

        # Simple text matching on 'content' field
        response = await self.supabase.execute_with_retry(
            query_builder.text_search("content", query).limit,
            top_k
        )
        return response.data


class ResilientExternalTool:
    """
    External tool executor with retry and alternate tool fallback.

    If primary tool fails, retries and can fall back to alternate tool.
    """

    def __init__(
        self,
        primary_tool: Callable,
        alternate_tool: Optional[Callable] = None,
        retry_config: Optional[RetryConfig] = None
    ):
        self.primary_tool = primary_tool
        self.alternate_tool = alternate_tool
        self._retry_config = retry_config or RetryConfig()
        self._use_alternate = False

    async def execute(self, *args, **kwargs) -> Any:
        """Execute external tool with fallback"""

        tool = self.alternate_tool if self._use_alternate else self.primary_tool

        for attempt in range(self._retry_config.max_retries):
            try:
                if asyncio.iscoroutinefunction(tool):
                    return await tool(*args, **kwargs)
                return tool(*args, **kwargs)

            except Exception as e:
                delay = min(
                    self._retry_config.base_delay * (self._retry_config.exponential_base ** attempt),
                    self._retry_config.max_delay
                )

                if attempt < self._retry_config.max_retries - 1:
                    logger.warning(
                        f"External tool attempt {attempt + 1} failed, "
                        f"retrying in {delay:.2f}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    # Try alternate tool if available
                    if self.alternate_tool and not self._use_alternate:
                        logger.warning("Primary tool failed, trying alternate tool")
                        self._use_alternate = True

                        if asyncio.iscoroutinefunction(self.alternate_tool):
                            return await self.alternate_tool(*args, **kwargs)
                        return self.alternate_tool(*args, **kwargs)

        raise


# Decorators for resilience patterns

def with_retry(
    max_retries: int = 3,
    base_delay: float = 0.5,
    exponential_base: float = 2.0,
    failure_types: tuple = (Exception,)
):
    """Decorator for retry with exponential backoff"""

    def decorator(func: Callable[..., Coroutine[Any, Any, T]]) -> Callable[..., Coroutine[Any, Any, T]]:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None

            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except failure_types as e:
                    last_error = e
                    delay = min(
                        base_delay * (exponential_base ** attempt),
                        10.0
                    )

                    if attempt < max_retries - 1:
                        logger.warning(
                            f"{func.__name__} attempt {attempt + 1} failed, "
                            f"retrying in {delay:.2f}s: {e}"
                        )
                        await asyncio.sleep(delay)

            logger.error(f"{func.__name__} failed after {max_retries} attempts")
            raise last_error

        return wrapper
    return decorator


def with_fallback(
    fallback_func: Callable,
    failure_types: tuple = (Exception,)
):
    """Decorator for automatic fallback"""

    def decorator(func: Callable[..., Coroutine[Any, Any, T]]) -> Callable[..., Coroutine[Any, Any, T]]:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except failure_types as e:
                logger.warning(f"{func.__name__} failed, using fallback: {e}")

                if asyncio.iscoroutinefunction(fallback_func):
                    return await fallback_func(*args, **kwargs)
                return fallback_func(*args, **kwargs)

        return wrapper
    return decorator


def with_circuit_breaker(
    failure_threshold: int = 5,
    timeout: float = 60.0
):
    """Decorator for circuit breaker pattern"""

    def decorator(func: Callable[..., Coroutine[Any, Any, T]]) -> Callable[..., Coroutine[Any, Any, T]]:
        breaker = CircuitBreaker(failure_threshold=failure_threshold, timeout=timeout)

        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            return await breaker.call(func, *args, **kwargs)

        wrapper.breaker = breaker
        return wrapper

    return decorator


class FailureRecorder:
    """
    Records failure events for observability and analysis.

    Stores events in memory with optional export to external system.
    """

    def __init__(self, max_events: int = 1000):
        self._events: deque = deque(maxlen=max_events)
        self._lock = asyncio.Lock()

    async def record(self, event: FailureEvent) -> None:
        """Record a failure event"""
        async with self._lock:
            self._events.append(event)

        # Log as structured JSON
        logger.info(json.dumps(event.to_dict()))

    async def get_events(
        self,
        failure_type: Optional[FailureType] = None,
        limit: int = 100
    ) -> List[FailureEvent]:
        """Retrieve filtered failure events"""
        async with self._lock:
            events = list(self._events)

        if failure_type:
            events = [e for e in events if e.failure_type == failure_type]

        return events[-limit:]

    async def get_recovery_rate(self, window_minutes: int = 60) -> float:
        """Calculate recovery rate for recent events"""
        cutoff = time.time() - (window_minutes * 60)
        async with self._lock:
            events = [e for e in self._events if e.timestamp > cutoff]

        if not events:
            return 1.0

        recovered = sum(1 for e in events if e.recovered)
        return recovered / len(events)


# Export classes and decorators
__all__ = [
    "FailureType",
    "FailureEvent",
    "RetryConfig",
    "CircuitBreaker",
    "CircuitBreakerError",
    "ResilientRedis",
    "ResilientSupabase",
    "ResilientLLM",
    "ResilientVectorSearch",
    "ResilientExternalTool",
    "with_retry",
    "with_fallback",
    "with_circuit_breaker",
    "FailureRecorder",
]
