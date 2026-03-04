import asyncio
"""
TORQ Security Middleware
Implements API key validation, abuse protection, and security headers
"""

import time
import hashlib
import hmac
import secrets
from typing import Optional, Dict, Any, List, Set
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
import logging
import redis.asyncio as redis


logger = logging.getLogger(__name__)


class SecurityLevel(str, Enum):
    """Security levels for different endpoint types"""
    PUBLIC = "public"
    AUTHENTICATED = "authenticated"
    ADMIN = "admin"
    MCP = "mcp"


@dataclass
class APIKey:
    """API Key model"""
    key_id: str
    key_hash: str
    owner: str
    level: SecurityLevel
    created_at: datetime
    expires_at: Optional[datetime] = None
    rate_limit_override: Optional[int] = None
    scopes: List[str] = field(default_factory=list)
    is_active: bool = True

    def verify(self, key: str) -> bool:
        """Verify if the provided key matches the hash"""
        return hmac.compare_digest(self.key_hash, self._hash_key(key))

    @staticmethod
    def _hash_key(key: str) -> str:
        """Hash an API key"""
        return hashlib.sha256(key.encode()).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary (excluding sensitive data)"""
        return {
            "key_id": self.key_id,
            "owner": self.owner,
            "level": self.level.value,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "rate_limit_override": self.rate_limit_override,
            "scopes": self.scopes,
            "is_active": self.is_active,
        }


class APIKeyError(Exception):
    """Base API key error"""
    pass


class InvalidAPIKeyError(APIKeyError):
    """Invalid API key provided"""
    pass


class ExpiredAPIKeyError(APIKeyError):
    """API key has expired"""
    pass


class InactiveAPIKeyError(APIKeyError):
    """API key is inactive"""
    pass


class InsufficientScopeError(APIKeyError):
    """API key lacks required scope"""
    pass


@dataclass
class SecurityConfig:
    """Security configuration"""
    # API key settings
    require_api_key: bool = False
    api_key_header: str = "X-API-Key"
    admin_api_key_header: str = "X-Admin-API-Key"

    # Abuse detection
    enable_abuse_detection: bool = True
    abuse_score_threshold: int = 100
    abuse_block_duration: int = 300  # 5 minutes

    # IP-based security
    enable_ip_blacklist: bool = True
    enable_ip_whitelist: bool = False
    trusted_proxies: List[str] = field(default_factory=lambda: ["127.0.0.1"])

    # Security headers
    enable_security_headers: bool = True
    content_security_policy: str = "default-src 'self'"
    strict_transport_security: bool = True

    # Rate limiting on security violations
    security_rate_limit: int = 10  # Security violations per minute


class SecurityMiddleware:
    """
    Security middleware for API gateway

    Features:
    - API key validation
    - Abuse detection and prevention
    - IP blacklist/whitelist
    - Security headers
    - Request validation
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        config: SecurityConfig = None,
    ):
        self.config = config or SecurityConfig()
        self.redis_url = redis_url
        self._redis: Optional[redis.Redis] = None
        self._api_keys: Dict[str, APIKey] = {}
        self._ip_blacklist: Set[str] = set()
        self._ip_whitelist: Set[str] = set()
        self._abuse_scores: Dict[str, int] = {}

    async def _get_redis(self) -> Optional[redis.Redis]:
        """Get Redis connection"""
        if self._redis is None:
            try:
                self._redis = await redis.from_url(
                    self.redis_url,
                    encoding="utf-8",
                    decode_responses=True
                )
                await self._redis.ping()
                logger.info(f"Security middleware connected to Redis: {self.redis_url}")
            except Exception as e:
                logger.warning(f"Redis connection failed for security: {e}")
        return self._redis

    def generate_api_key(
        self,
        owner: str,
        level: SecurityLevel = SecurityLevel.AUTHENTICATED,
        expires_in_days: Optional[int] = None,
        scopes: List[str] = None,
    ) -> tuple[str, APIKey]:
        """
        Generate a new API key

        Returns:
            (raw_key, api_key_object)
        """
        # Generate key ID and raw key
        key_id = secrets.token_urlsafe(16)
        raw_key = f"torq_{secrets.token_urlsafe(32)}"

        # Calculate expiration
        expires_at = None
        if expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=expires_in_days)

        # Create API key object
        api_key = APIKey(
            key_id=key_id,
            key_hash=APIKey._hash_key(raw_key),
            owner=owner,
            level=level,
            created_at=datetime.utcnow(),
            expires_at=expires_at,
            scopes=scopes or [],
        )

        # Store key
        self._api_keys[key_id] = api_key

        # Also store in Redis if available
        asyncio.create_task(self._store_api_key_in_redis(api_key))

        return raw_key, api_key

    async def _store_api_key_in_redis(self, api_key: APIKey):
        """Store API key in Redis for distributed access"""
        redis_client = await self._get_redis()
        if redis_client:
            key = f"torq:api_key:{api_key.key_id}"
            data = api_key.to_dict()
            await redis_client.hset(key, mapping=data)

            # Set expiration if key expires
            if api_key.expires_at:
                ttl = int((api_key.expires_at - datetime.utcnow()).total_seconds())
                await redis_client.expire(key, ttl)

    async def validate_api_key(
        self,
        key: str,
        required_level: SecurityLevel = SecurityLevel.AUTHENTICATED,
        required_scopes: List[str] = None,
    ) -> APIKey:
        """
        Validate an API key

        Args:
            key: The raw API key
            required_level: Minimum security level required
            required_scopes: Required OAuth2 scopes

        Returns:
            The validated APIKey object

        Raises:
            InvalidAPIKeyError: If key is invalid
            ExpiredAPIKeyError: If key has expired
            InsufficientScopeError: If key lacks required scope
        """
        if not key:
            raise InvalidAPIKeyError("API key is required")

        # Check local cache first
        for api_key in self._api_keys.values():
            if api_key.verify(key):
                return self._validate_key_requirements(api_key, required_level, required_scopes)

        # Check Redis
        redis_client = await self._get_redis()
        if redis_client:
            # Scan API keys (production should use indexed lookup)
            async for key_pattern in redis_client.iscan(match="torq:api_key:*"):
                data = await redis_client.hgetall(key_pattern)
                if data:
                    api_key = self._reconstruct_api_key(data)
                    if api_key.verify(key):
                        return self._validate_key_requirements(api_key, required_level, required_scopes)

        raise InvalidAPIKeyError("Invalid API key")

    def _reconstruct_api_key(self, data: Dict[str, Any]) -> APIKey:
        """Reconstruct APIKey from Redis data"""
        return APIKey(
            key_id=data["key_id"],
            key_hash=data["key_hash"],  # Already hashed
            owner=data["owner"],
            level=SecurityLevel(data["level"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            expires_at=datetime.fromisoformat(data["expires_at"]) if data.get("expires_at") else None,
            rate_limit_override=int(data["rate_limit_override"]) if data.get("rate_limit_override") else None,
            scopes=data.get("scopes", "").split(",") if data.get("scopes") else [],
            is_active=data.get("is_active", "true").lower() == "true",
        )

    def _validate_key_requirements(
        self,
        api_key: APIKey,
        required_level: SecurityLevel,
        required_scopes: List[str] = None,
    ) -> APIKey:
        """Validate API key meets requirements"""
        # Check if active
        if not api_key.is_active:
            raise InactiveAPIKeyError("API key is inactive")

        # Check expiration
        if api_key.expires_at and api_key.expires_at < datetime.utcnow():
            raise ExpiredAPIKeyError("API key has expired")

        # Check security level
        level_hierarchy = {
            SecurityLevel.PUBLIC: 0,
            SecurityLevel.AUTHENTICATED: 1,
            SecurityLevel.MCP: 2,
            SecurityLevel.ADMIN: 3,
        }

        if level_hierarchy.get(api_key.level, 0) < level_hierarchy.get(required_level, 0):
            raise InsufficientScopeError(f"API key level {api_key.level} insufficient for {required_level}")

        # Check scopes
        if required_scopes:
            missing_scopes = set(required_scopes) - set(api_key.scopes)
            if missing_scopes:
                raise InsufficientScopeError(f"API key missing scopes: {missing_scopes}")

        return api_key

    async def check_abuse(self, identifier: str, violation_type: str, weight: int = 10) -> bool:
        """
        Check and record abuse for identifier

        Returns True if abuse threshold exceeded (should block)
        """
        if not self.config.enable_abuse_detection:
            return False

        redis_client = await self._get_redis()
        key = f"torq:abuse:{identifier}"

        # Increment abuse score
        if redis_client:
            current_score = await redis_client.incrby(key, weight)
            await redis_client.expire(key, self.config.abuse_block_duration)

            if current_score >= self.config.abuse_score_threshold:
                logger.warning(f"Abuse threshold exceeded for {identifier}: {current_score}")
                return True
        else:
            # Fallback to in-memory
            self._abuse_scores[identifier] = self._abuse_scores.get(identifier, 0) + weight
            if self._abuse_scores[identifier] >= self.config.abuse_score_threshold:
                return True

        return False

    async def reset_abuse_score(self, identifier: str):
        """Reset abuse score for identifier"""
        redis_client = await self._get_redis()
        if redis_client:
            await redis_client.delete(f"torq:abuse:{identifier}")

        if identifier in self._abuse_scores:
            del self._abuse_scores[identifier]

    async def is_ip_blocked(self, ip_address: str) -> bool:
        """Check if IP is blocked"""
        if ip_address in self._ip_blacklist:
            return True

        # Check Redis blacklist
        redis_client = await self._get_redis()
        if redis_client:
            return await redis_client.sismember("torq:ip_blacklist", ip_address)

        return False

    async def is_ip_allowed(self, ip_address: str) -> bool:
        """Check if IP is allowed (whitelist mode)"""
        if not self.config.enable_ip_whitelist:
            return True

        if ip_address in self._ip_whitelist:
            return True

        # Check Redis whitelist
        redis_client = await self._get_redis()
        if redis_client:
            return await redis_client.sismember("torq:ip_whitelist", ip_address)

        return False

    async def block_ip(self, ip_address: str, duration: int = 3600):
        """Block an IP address"""
        self._ip_blacklist.add(ip_address)

        redis_client = await self._get_redis()
        if redis_client:
            await redis_client.sadd("torq:ip_blacklist", ip_address)
            await redis_client.expire(f"torq:ip_blacklist:{ip_address}", duration)

    async def add_to_whitelist(self, ip_address: str):
        """Add IP to whitelist"""
        self._ip_whitelist.add(ip_address)

        redis_client = await self._get_redis()
        if redis_client:
            await redis_client.sadd("torq:ip_whitelist", ip_address)

    def verify_admin_key(self, admin_key: str = None) -> str:
        """Verify admin API key from header"""
        if not admin_key:
            raise InvalidAPIKeyError("Admin API key required")

        # For simplicity, use environment variable in production
        import os
        expected_key = os.getenv("TORQ_ADMIN_TOKEN")

        if not expected_key:
            raise InvalidAPIKeyError("Admin authentication not configured")

        if not secrets.compare_digest(admin_key, expected_key):
            raise InvalidAPIKeyError("Invalid admin API key")

        return admin_key


class APIKeyValidator:
    """Dependency provider for FastAPI routes"""

    def __init__(self, security: SecurityMiddleware, required_level: SecurityLevel = SecurityLevel.AUTHENTICATED):
        self.security = security
        self.required_level = required_level

    async def __call__(self, api_key: str = None) -> APIKey:
        """Validate API key from request"""
        header_name = "X-API-Key"
        if self.required_level == SecurityLevel.ADMIN:
            header_name = "X-Admin-API-Key"

        # This would be called by FastAPI dependency injection
        return await self.security.validate_api_key(api_key, self.required_level)
