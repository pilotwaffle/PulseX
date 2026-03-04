"""
TORQ Cache Module
Implements Redis caching layer for API responses and agent memory

Features:
- Semantic search result caching
- API response caching
- Agent memory caching
- Distributed cache with Redis
- Graceful fallback when Redis unavailable
"""

import json
import time
import hashlib
import pickle
from typing import Optional, Dict, Any, List, TypeVar, Generic, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
import redis.asyncio as redis
import logging


logger = logging.getLogger(__name__)

T = TypeVar("T")


class CacheStrategy(str, Enum):
    """Caching strategies"""
    LRU = "lru"
    TTL = "ttl"
    WRITE_THROUGH = "write_through"
    WRITE_BACK = "write_back"
    LAZY_LOADING = "lazy_loading"


@dataclass
class CacheConfig:
    """Cache configuration"""
    # Redis settings
    redis_url: str = "redis://localhost:6379"
    key_prefix: str = "torq:cache:"

    # Default TTL (seconds)
    default_ttl: int = 300  # 5 minutes

    # Cache sizes
    max_memory_mb: int = 256
    max_items: int = 10000

    # Strategy
    strategy: CacheStrategy = CacheStrategy.TTL

    # Enabled flag
    enabled: bool = True

    # Fallback settings
    fallback_enabled: bool = True
    fallback_max_size: int = 1000

    # Compression
    enable_compression: bool = True
    compression_threshold: int = 1024  # bytes


@dataclass
class CacheEntry:
    """Cache entry with metadata"""
    key: str
    value: Any
    created_at: datetime
    accessed_at: datetime
    access_count: int = 0
    ttl: Optional[int] = None
    tags: List[str] = field(default_factory=list)

    def is_expired(self) -> bool:
        """Check if entry is expired"""
        if self.ttl is None:
            return False
        return (datetime.utcnow() - self.created_at).total_seconds() > self.ttl

    def touch(self):
        """Update access time and count"""
        self.accessed_at = datetime.utcnow()
        self.access_count += 1

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "key": self.key,
            "created_at": self.created_at.isoformat(),
            "accessed_at": self.accessed_at.isoformat(),
            "access_count": self.access_count,
            "ttl": self.ttl,
            "tags": self.tags,
        }


class CacheError(Exception):
    """Base cache error"""
    pass


class CacheMissError(CacheError):
    """Cache miss error"""
    pass


class CacheManager:
    """
    Distributed cache manager with Redis backend

    Features:
    - Multiple caching strategies
    - Tag-based invalidation
    - Graceful fallback to in-memory cache
    - Compression for large values
    - Cache warming and preloading
    """

    def __init__(self, config: CacheConfig = None):
        self.config = config or CacheConfig()
        self._redis: Optional[redis.Redis] = None
        self._redis_available = False
        self._fallback_cache: Dict[str, CacheEntry] = {}

    async def _get_redis(self) -> Optional[redis.Redis]:
        """Get Redis connection (lazy initialization)"""
        if self._redis is None and self.config.enabled:
            try:
                self._redis = await redis.from_url(
                    self.config.redis_url,
                    encoding="utf-8",
                    decode_responses=False,  # We handle encoding ourselves for binary data
                )
                await self._redis.ping()
                self._redis_available = True
                logger.info(f"Cache manager connected to Redis: {self.config.redis_url}")
            except Exception as e:
                logger.warning(f"Redis connection failed for cache: {e}")
                self._redis_available = False
                if not self.config.fallback_enabled:
                    raise
        return self._redis if self._redis_available else None

    def _make_key(self, *parts: str) -> str:
        """Create a cache key from parts"""
        key = ":".join(str(p) for p in parts)
        return f"{self.config.key_prefix}{key}"

    def _hash_key(self, data: Any) -> str:
        """Create hash of data for cache key"""
        if isinstance(data, dict):
            data = json.dumps(data, sort_keys=True)
        elif isinstance(data, (list, tuple)):
            data = str(data)
        return hashlib.sha256(str(data).encode()).hexdigest()[:16]

    async def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found
        """
        if not self.config.enabled:
            return None

        # Try Redis first
        redis_client = await self._get_redis()
        if redis_client:
            try:
                value = await redis_client.get(self._make_key(key))
                if value:
                    # Deserialize
                    entry = pickle.loads(value)
                    entry.touch()

                    # Update access time in Redis
                    metadata = entry.to_dict()
                    await redis_client.hset(f"{self._make_key(key)}:meta", mapping=metadata)

                    return entry.value
            except Exception as e:
                logger.error(f"Redis cache get error: {e}")
                if not self.config.fallback_enabled:
                    raise

        # Fallback to in-memory cache
        entry = self._fallback_cache.get(key)
        if entry:
            if entry.is_expired():
                del self._fallback_cache[key]
                return None
            entry.touch()
            return entry.value

        return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        tags: List[str] = None,
    ) -> bool:
        """
        Set value in cache

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (uses default if None)
            tags: Optional tags for invalidation

        Returns:
            True if successful
        """
        if not self.config.enabled:
            return False

        ttl = ttl or self.config.default_ttl
        now = datetime.utcnow()

        # Create cache entry
        entry = CacheEntry(
            key=key,
            value=value,
            created_at=now,
            accessed_at=now,
            ttl=ttl,
            tags=tags or [],
        )

        # Try Redis first
        redis_client = await self._get_redis()
        if redis_client:
            try:
                serialized = pickle.dumps(entry)
                cache_key = self._make_key(key)

                await redis_client.setex(cache_key, ttl, serialized)

                # Store metadata separately
                metadata = entry.to_dict()
                await redis_client.hset(f"{cache_key}:meta", mapping=metadata)
                await redis_client.expire(f"{cache_key}:meta", ttl)

                # Add to tag sets
                for tag in tags or []:
                    await redis_client.sadd(self._make_key("tag", tag), key)

                return True
            except Exception as e:
                logger.error(f"Redis cache set error: {e}")
                if not self.config.fallback_enabled:
                    raise

        # Fallback to in-memory cache
        if self.config.fallback_enabled:
            self._fallback_cache[key] = entry
            self._cleanup_fallback_cache()
            return True

        return False

    async def delete(self, key: str) -> bool:
        """Delete key from cache"""
        redis_client = await self._get_redis()
        if redis_client:
            try:
                await redis_client.delete(self._make_key(key))
                await redis_client.delete(f"{self._make_key(key)}:meta")
            except Exception as e:
                logger.error(f"Redis cache delete error: {e}")

        if key in self._fallback_cache:
            del self._fallback_cache[key]
            return True

        return False

    async def invalidate_by_tag(self, tag: str) -> int:
        """
        Invalidate all cache entries with a tag

        Returns:
            Number of keys invalidated
        """
        count = 0
        redis_client = await self._get_redis()

        if redis_client:
            try:
                keys = await redis_client.smembers(self._make_key("tag", tag))
                for key in keys:
                    await redis_client.delete(self._make_key(key))
                    await redis_client.delete(f"{self._make_key(key)}:meta")
                    count += 1
                await redis_client.delete(self._make_key("tag", tag))
            except Exception as e:
                logger.error(f"Redis tag invalidation error: {e}")

        # Fallback: check in-memory entries
        keys_to_delete = [k for k, v in self._fallback_cache.items() if tag in v.tags]
        for key in keys_to_delete:
            del self._fallback_cache[key]
            count += 1

        return count

    async def get_or_set(
        self,
        key: str,
        factory: Callable,
        ttl: Optional[int] = None,
        tags: List[str] = None,
    ) -> Any:
        """
        Get value from cache or set using factory function

        Args:
            key: Cache key
            factory: Async function to generate value if cache miss
            ttl: Time to live in seconds
            tags: Optional tags for invalidation

        Returns:
            Cached or generated value
        """
        value = await self.get(key)
        if value is not None:
            return value

        # Cache miss - call factory
        value = await factory()
        await self.set(key, value, ttl=ttl, tags=tags)
        return value

    def _cleanup_fallback_cache(self):
        """Remove expired entries from fallback cache"""
        now = datetime.utcnow()
        expired_keys = [k for k, v in self._fallback_cache.items() if v.is_expired()]
        for key in expired_keys:
            del self._fallback_cache[key]

        # Also limit size
        if len(self._fallback_cache) > self.config.fallback_max_size:
            # Sort by access time and remove oldest
            sorted_keys = sorted(
                self._fallback_cache.keys(),
                key=lambda k: self._fallback_cache[k].accessed_at
            )
            excess = len(self._fallback_cache) - self.config.fallback_max_size
            for key in sorted_keys[:excess]:
                del self._fallback_cache[key]

    async def flush(self) -> bool:
        """Flush all cache entries"""
        redis_client = await self._get_redis()
        if redis_client:
            try:
                # Delete all keys with prefix
                keys = []
                async for key in redis_client.scan_iter(match=f"{self.config.key_prefix}*"):
                    keys.append(key)
                if keys:
                    await redis_client.delete(*keys)
                logger.info(f"Flushed {len(keys)} cache entries from Redis")
            except Exception as e:
                logger.error(f"Redis cache flush error: {e}")

        self._fallback_cache.clear()
        return True

    async def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        redis_client = await self._get_redis()
        stats = {
            "enabled": self.config.enabled,
            "strategy": self.config.strategy.value,
            "redis_available": self._redis_available,
        }

        if redis_client:
            try:
                info = await redis_client.info("stats")
                stats.update({
                    "redis_total_connections": info.get("total_connections_received", 0),
                    "redis_total_commands": info.get("total_commands_processed", 0),
                    "redis_keyspace_hits": info.get("keyspace_hits", 0),
                    "redis_keyspace_misses": info.get("keyspace_misses", 0),
                })

                hit_rate = 0
                total = stats["redis_keyspace_hits"] + stats["redis_keyspace_misses"]
                if total > 0:
                    hit_rate = stats["redis_keyspace_hits"] / total
                stats["redis_hit_rate"] = round(hit_rate, 4)

            except Exception as e:
                logger.error(f"Redis stats error: {e}")

        stats["fallback_cache_size"] = len(self._fallback_cache)
        return stats


# Semantic search cache
class SemanticSearchCache:
    """Specialized cache for semantic search results"""

    def __init__(self, cache_manager: CacheManager):
        self.cache = cache_manager
        self.key_prefix = "semantic_search:"

    async def get_results(self, query: str, limit: int = 10) -> Optional[List[Dict]]:
        """Get cached semantic search results"""
        cache_key = self.cache._make_key(
            self.key_prefix,
            self.cache._hash_key(query),
            str(limit)
        )
        return await self.cache.get(cache_key)

    async def set_results(
        self,
        query: str,
        results: List[Dict],
        limit: int = 10,
        ttl: int = 600,  # 10 minutes default
    ) -> bool:
        """Cache semantic search results"""
        cache_key = self.cache._make_key(
            self.key_prefix,
            self.cache._hash_key(query),
            str(limit)
        )
        return await self.cache.set(cache_key, results, ttl=ttl, tags=["semantic_search"])

    async def invalidate_query(self, query: str):
        """Invalidate cached results for a query"""
        # Invalidate by tag since we don't have exact key
        await self.cache.invalidate_by_tag("semantic_search")


# Agent memory cache
class AgentMemoryCache:
    """Specialized cache for agent memory operations"""

    def __init__(self, cache_manager: CacheManager):
        self.cache = cache_manager
        self.key_prefix = "agent_memory:"

    async def get_context(self, session_id: str) -> Optional[Dict]:
        """Get cached agent session context"""
        cache_key = self.cache._make_key(self.key_prefix, "context", session_id)
        return await self.cache.get(cache_key)

    async def set_context(
        self,
        session_id: str,
        context: Dict,
        ttl: int = 300,
    ) -> bool:
        """Cache agent session context"""
        cache_key = self.cache._make_key(self.key_prefix, "context", session_id)
        return await self.cache.set(cache_key, context, ttl=ttl, tags=["agent_context"])

    async def invalidate_session(self, session_id: str) -> bool:
        """Invalidate cached context for a session"""
        cache_key = self.cache._make_key(self.key_prefix, "context", session_id)
        return await self.cache.delete(cache_key)
