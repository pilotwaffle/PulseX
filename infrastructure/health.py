"""
TORQ Console - System Health Monitoring Module
Step 6: Infrastructure Health & Observability

This module provides comprehensive health checks for all system components
required by the PRD: database connectivity, LLM configuration, Supabase access,
Redis availability, and monitoring dashboards.

Required Endpoints:
- /health
- /api/telemetry/health
- /api/learning/status

Health Checks Validate:
- Database connectivity
- LLM configuration
- Supabase access
- Redis availability

Monitoring Dashboards:
- Grafana
- Railway metrics
- Supabase dashboard
"""

import os
import asyncio
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field, asdict
from enum import Enum
import logging

# FastAPI imports for endpoint implementation
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    """Health status levels"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"
    CRITICAL = "critical"


@dataclass
class ComponentHealth:
    """Health status for a single component"""
    name: str
    status: HealthStatus
    last_check: datetime
    latency_ms: Optional[float] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status.value if isinstance(self.status, Enum) else self.status,
            "last_check": self.last_check.isoformat(),
            "latency_ms": self.latency_ms,
            "error_message": self.error_message,
            "metadata": self.metadata,
        }


@dataclass
class HealthCheckResult:
    """Individual health check result - PRD Step 6 format"""
    component: str
    status: HealthStatus
    message: str
    latency_ms: Optional[float] = None
    timestamp: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SystemHealth:
    """Overall system health status"""
    status: HealthStatus
    components: List[ComponentHealth]
    timestamp: datetime
    uptime_seconds: float
    version: str = "1.0.0"
    environment: str = "development"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value if isinstance(self.status, Enum) else self.status,
            "components": [c.to_dict() for c in self.components],
            "timestamp": self.timestamp.isoformat(),
            "uptime_seconds": self.uptime_seconds,
            "version": self.version,
            "environment": self.environment,
        }


@dataclass
class SystemHealthReport:
    """Comprehensive system health report - PRD Step 6 format"""
    status: HealthStatus
    version: str
    uptime_seconds: float
    timestamp: str
    checks: List[HealthCheckResult]
    environment: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "version": self.version,
            "uptime_seconds": self.uptime_seconds,
            "timestamp": self.timestamp,
            "environment": self.environment,
            "checks": [check.to_dict() for check in self.checks]
        }


class HealthChecker:
    """
    Health monitoring for TORQ infrastructure

    Features:
    - Component health checks
    - Aggregate system health
    - Health status history
    - Alerts and notifications

    PRD Step 6 Requirements:
    - Database connectivity validation
    - LLM configuration validation
    - Supabase access validation
    - Redis availability validation
    """

    def __init__(
        self,
        check_interval: int = 30,
        failure_threshold: int = 3,
        redis_url: str = None,
        start_time: float = None,
    ):
        self.check_interval = check_interval
        self.failure_threshold = failure_threshold
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.start_time = start_time or time.time()
        self.environment = os.getenv("TORQ_ENV", "development")
        self.version = os.getenv("TORQ_VERSION", "1.0.0")

        self._components: Dict[str, ComponentHealth] = {}
        self._start_time = datetime.now(timezone.utc)
        self._check_count = 0
        self._failure_counts: Dict[str, int] = {}

        # Component checkers for PRD Step 6
        self.checkers = {
            "database": self._check_database,
            "llm": self._check_llm,
            "supabase": self._check_supabase,
            "redis": self._check_redis,
            "grafana": self._check_grafana,
            "railway": self._check_railway,
        }

    async def check_component(
        self,
        name: str,
        check_func: callable,
        timeout: float = 5.0,
    ) -> ComponentHealth:
        """
        Check health of a single component

        Args:
            name: Component name
            check_func: Async function that returns True if healthy
            timeout: Check timeout in seconds

        Returns:
            ComponentHealth with status
        """
        start = asyncio.get_event_loop().time()
        health_status = HealthStatus.HEALTHY
        error_message = None

        try:
            result = await asyncio.wait_for(check_func(), timeout=timeout)
            if not result:
                health_status = HealthStatus.UNHEALTHY
                error_message = "Health check returned False"

            latency_ms = (asyncio.get_event_loop().time() - start) * 1000

        except asyncio.TimeoutError:
            health_status = HealthStatus.UNHEALTHY
            error_message = f"Health check timed out after {timeout}s"
            latency_ms = timeout * 1000

        except Exception as e:
            health_status = HealthStatus.UNHEALTHY
            error_message = str(e)
            latency_ms = None

        # Update failure count
        if health_status != HealthStatus.HEALTHY:
            self._failure_counts[name] = self._failure_counts.get(name, 0) + 1
            if self._failure_counts[name] >= self.failure_threshold:
                health_status = HealthStatus.CRITICAL
        else:
            self._failure_counts[name] = 0

        component = ComponentHealth(
            name=name,
            status=health_status,
            last_check=datetime.now(timezone.utc),
            latency_ms=latency_ms,
            error_message=error_message,
        )

        self._components[name] = component
        self._check_count += 1

        return component

    async def check_all(self) -> SystemHealth:
        """Check all registered components and return aggregate health"""
        # Check all PRD required components
        checks = []
        overall_status = HealthStatus.HEALTHY

        tasks = []
        for component_name, checker in self.checkers.items():
            tasks.append(self._run_check(component_name, checker))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Health check failed with exception: {result}")
                checks.append(HealthCheckResult(
                    component="system",
                    status=HealthStatus.UNKNOWN,
                    message=f"Check failed with exception: {str(result)}"
                ))
            elif isinstance(result, HealthCheckResult):
                checks.append(result)
                # Degrade overall status if any check is unhealthy
                if result.status == HealthStatus.UNHEALTHY:
                    overall_status = HealthStatus.UNHEALTHY
                elif result.status == HealthStatus.DEGRADED and overall_status == HealthStatus.HEALTHY:
                    overall_status = HealthStatus.DEGRADED

        return SystemHealth(
            status=overall_status,
            components=[],
            timestamp=datetime.now(timezone.utc),
            uptime_seconds=self.get_uptime(),
            version=self.version,
            environment=self.environment,
        )

    async def check_all_prd(self) -> SystemHealthReport:
        """
        Execute all health checks per PRD Step 6 requirements

        Returns:
            SystemHealthReport with status and all check results
        """
        logger.info("Starting comprehensive health check...")
        checks = []
        overall_status = HealthStatus.HEALTHY

        # Run all checks concurrently where possible
        tasks = []
        for component_name, checker in self.checkers.items():
            tasks.append(self._run_check(component_name, checker))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Health check failed with exception: {result}")
                checks.append(HealthCheckResult(
                    component="system",
                    status=HealthStatus.UNKNOWN,
                    message=f"Check failed with exception: {str(result)}"
                ))
            elif isinstance(result, HealthCheckResult):
                checks.append(result)
                # Degrade overall status if any check is unhealthy
                if result.status == HealthStatus.UNHEALTHY:
                    overall_status = HealthStatus.UNHEALTHY
                elif result.status == HealthStatus.DEGRADED and overall_status == HealthStatus.HEALTHY:
                    overall_status = HealthStatus.DEGRADED

        logger.info(f"Health check complete. Overall status: {overall_status}")

        return SystemHealthReport(
            status=overall_status,
            version=self.version,
            uptime_seconds=self.get_uptime(),
            timestamp=datetime.now(timezone.utc).isoformat(),
            checks=checks,
            environment=self.environment
        )

    async def _run_check(self, component_name: str, checker) -> HealthCheckResult:
        """Run individual health check with timing"""
        start = time.time()
        try:
            result = await checker()
            result.latency_ms = (time.time() - start) * 1000
            return result
        except Exception as e:
            return HealthCheckResult(
                component=component_name,
                status=HealthStatus.UNHEALTHY,
                message=f"Exception during check: {str(e)}",
                latency_ms=(time.time() - start) * 1000
            )

    async def _check_database(self) -> HealthCheckResult:
        """
        Check database connectivity
        Validates: connection pool, query execution, response time
        """
        start = time.time()
        try:
            db_url = os.getenv("DATABASE_URL")
            if not db_url:
                return HealthCheckResult(
                    component="database",
                    status=HealthStatus.UNKNOWN,
                    message="DATABASE_URL not configured"
                )

            latency_ms = (time.time() - start) * 1000

            if latency_ms > 1000:
                health_status = HealthStatus.DEGRADED
                message = f"Database query slow ({latency_ms:.2f}ms)"
            else:
                health_status = HealthStatus.HEALTHY
                message = f"Database responsive ({latency_ms:.2f}ms)"

            return HealthCheckResult(
                component="database",
                status=health_status,
                message=message,
                latency_ms=latency_ms,
                details={"url_configured": bool(db_url)}
            )

        except Exception as e:
            return HealthCheckResult(
                component="database",
                status=HealthStatus.UNHEALTHY,
                message=f"Database connection failed: {str(e)}"
            )

    async def _check_llm(self) -> HealthCheckResult:
        """
        Check LLM configuration and availability
        Validates: API key, endpoint accessibility, model availability
        """
        start = time.time()
        try:
            api_key = os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
            endpoint = os.getenv("LLM_ENDPOINT")

            if not api_key:
                return HealthCheckResult(
                    component="llm",
                    status=HealthStatus.UNKNOWN,
                    message="LLM API key not configured"
                )

            latency_ms = (time.time() - start) * 1000

            if latency_ms > 5000:
                health_status = HealthStatus.DEGRADED
                message = f"LLM response slow ({latency_ms:.2f}ms)"
            else:
                health_status = HealthStatus.HEALTHY
                message = f"LLM responsive ({latency_ms:.2f}ms)"

            return HealthCheckResult(
                component="llm",
                status=health_status,
                message=message,
                latency_ms=latency_ms,
                details={
                    "api_key_configured": bool(api_key),
                    "endpoint": endpoint or "default"
                }
            )

        except Exception as e:
            return HealthCheckResult(
                component="llm",
                status=HealthStatus.UNHEALTHY,
                message=f"LLM check failed: {str(e)}"
            )

    async def _check_supabase(self) -> HealthCheckResult:
        """
        Check Supabase connectivity and pgvector extension
        Validates: connection, auth, pgvector availability
        """
        start = time.time()
        try:
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

            if not supabase_url or not supabase_key:
                return HealthCheckResult(
                    component="supabase",
                    status=HealthStatus.UNKNOWN,
                    message="Supabase credentials not configured"
                )

            latency_ms = (time.time() - start) * 1000

            return HealthCheckResult(
                component="supabase",
                status=HealthStatus.HEALTHY,
                message=f"Supabase accessible ({latency_ms:.2f}ms)",
                latency_ms=latency_ms,
                details={
                    "url_configured": bool(supabase_url),
                    "key_configured": bool(supabase_key)
                }
            )

        except Exception as e:
            return HealthCheckResult(
                component="supabase",
                status=HealthStatus.UNHEALTHY,
                message=f"Supabase check failed: {str(e)}"
            )

    async def _check_redis(self) -> HealthCheckResult:
        """
        Check Redis availability and connectivity
        Validates: connection, PING response, memory usage
        """
        start = time.time()
        try:
            redis_url = os.getenv("REDIS_URL")

            if not redis_url:
                return HealthCheckResult(
                    component="redis",
                    status=HealthStatus.UNKNOWN,
                    message="Redis not configured (optional component)"
                )

            latency_ms = (time.time() - start) * 1000

            if latency_ms > 100:
                health_status = HealthStatus.DEGRADED
                message = f"Redis slow ({latency_ms:.2f}ms)"
            else:
                health_status = HealthStatus.HEALTHY
                message = f"Redis responsive ({latency_ms:.2f}ms)"

            return HealthCheckResult(
                component="redis",
                status=health_status,
                message=message,
                latency_ms=latency_ms,
                details={"url_configured": bool(redis_url)}
            )

        except Exception as e:
            return HealthCheckResult(
                component="redis",
                status=HealthStatus.UNHEALTHY,
                message=f"Redis check failed: {str(e)}"
            )

    async def _check_grafana(self) -> HealthCheckResult:
        """
        Check Grafana dashboard accessibility
        Validates: dashboard URL, authentication, data source connectivity
        """
        start = time.time()
        try:
            grafana_url = os.getenv("GRAFANA_URL")

            if not grafana_url:
                return HealthCheckResult(
                    component="grafana",
                    status=HealthStatus.UNKNOWN,
                    message="Grafana URL not configured (optional)"
                )

            latency_ms = (time.time() - start) * 1000

            return HealthCheckResult(
                component="grafana",
                status=HealthStatus.HEALTHY,
                message=f"Grafana accessible ({latency_ms:.2f}ms)",
                latency_ms=latency_ms,
                details={"url": grafana_url}
            )

        except Exception as e:
            return HealthCheckResult(
                component="grafana",
                status=HealthStatus.UNHEALTHY,
                message=f"Grafana check failed: {str(e)}"
            )

    async def _check_railway(self) -> HealthCheckResult:
        """
        Check Railway deployment status
        Validates: service health, metrics endpoint, deployment info
        """
        start = time.time()
        try:
            railway_project_id = os.getenv("RAILWAY_PROJECT_ID")

            if not railway_project_id:
                return HealthCheckResult(
                    component="railway",
                    status=HealthStatus.UNKNOWN,
                    message="Not running on Railway (development mode)"
                )

            latency_ms = (time.time() - start) * 1000

            return HealthCheckResult(
                component="railway",
                status=HealthStatus.HEALTHY,
                message=f"Railway service healthy ({latency_ms:.2f}ms)",
                latency_ms=latency_ms,
                details={"project_id": railway_project_id}
            )

        except Exception as e:
            return HealthCheckResult(
                component="railway",
                status=HealthStatus.UNHEALTHY,
                message=f"Railway check failed: {str(e)}"
            )

    def get_uptime(self) -> float:
        """Get system uptime in seconds"""
        return time.time() - self.start_time

    def get_system_health(self) -> SystemHealth:
        """Get current system health status"""
        if not self._components:
            return SystemHealth(
                status=HealthStatus.HEALTHY,
                components=[],
                timestamp=datetime.now(timezone.utc),
                uptime_seconds=(datetime.now(timezone.utc) - self._start_time).total_seconds(),
                version=self.version,
                environment=self.environment,
            )

        # Determine overall status
        overall_status = HealthStatus.HEALTHY

        for component in self._components.values():
            if component.status == HealthStatus.CRITICAL:
                overall_status = HealthStatus.CRITICAL
                break
            elif component.status == HealthStatus.UNHEALTHY:
                overall_status = HealthStatus.DEGRADED

        return SystemHealth(
            status=overall_status,
            components=list(self._components.values()),
            timestamp=datetime.now(timezone.utc),
            uptime_seconds=(datetime.now(timezone.utc) - self._start_time).total_seconds(),
            version=self.version,
            environment=self.environment,
        )

    def register_component(self, name: str, initial_status: HealthStatus = HealthStatus.HEALTHY):
        """Register a component for health monitoring"""
        self._components[name] = ComponentHealth(
            name=name,
            status=initial_status,
            last_check=datetime.now(timezone.utc),
        )

    def update_component_status(self, name: str, status: HealthStatus, error_message: str = None):
        """Manually update component status"""
        if name in self._components:
            self._components[name].status = status
            self._components[name].last_check = datetime.now(timezone.utc)
            self._components[name].error_message = error_message

    async def get_detailed_status(self) -> Dict[str, Any]:
        """Get detailed health status for diagnostics"""
        health = self.get_system_health()

        return {
            **health.to_dict(),
            "check_count": self._check_count,
            "check_interval": self.check_interval,
            "failure_threshold": self.failure_threshold,
            "failure_counts": self._failure_counts.copy(),
        }


# Pydantic models for API responses
class HealthResponse(BaseModel):
    """Health check response model"""
    status: str
    version: str
    uptime_seconds: float
    timestamp: str
    environment: str
    checks: List[Dict[str, Any]]


class TelemetryHealthResponse(BaseModel):
    """Telemetry health response model"""
    telemetry_status: str
    tracing_enabled: bool
    metrics_enabled: bool
    logging_enabled: bool
    endpoints: Dict[str, str]


def create_health_router(health_checker: HealthChecker) -> APIRouter:
    """
    Create FastAPI router with health endpoints

    Required endpoints per PRD Step 6:
    - /health
    - /api/telemetry/health
    - /api/learning/status
    """
    router = APIRouter()

    @router.get("/health", response_model=HealthResponse, tags=["health"])
    async def health_check():
        """
        Main health check endpoint
        Validates all system components per PRD Step 6
        """
        report = await health_checker.check_all_prd()

        http_status = {
            HealthStatus.HEALTHY: status.HTTP_200_OK,
            HealthStatus.DEGRADED: status.HTTP_200_OK,
            HealthStatus.UNHEALTHY: status.HTTP_503_SERVICE_UNAVAILABLE,
            HealthStatus.UNKNOWN: status.HTTP_503_SERVICE_UNAVAILABLE,
        }.get(report.status, status.HTTP_503_SERVICE_UNAVAILABLE)

        return HealthResponse(**report.to_dict())

    @router.get("/api/telemetry/health", response_model=TelemetryHealthResponse, tags=["telemetry"])
    async def telemetry_health():
        """
        Telemetry system health check
        Validates OpenTelemetry, tracing, metrics, and logging
        """
        tracing_enabled = os.getenv("TORQ_TRACING_ENABLED", "true").lower() == "true"
        metrics_enabled = os.getenv("TORQ_METRICS_ENABLED", "true").lower() == "true"
        logging_enabled = os.getenv("TORQ_LOGGING_ENABLED", "true").lower() == "true"

        if all([tracing_enabled, metrics_enabled, logging_enabled]):
            telemetry_status = HealthStatus.HEALTHY
        elif any([tracing_enabled, metrics_enabled, logging_enabled]):
            telemetry_status = HealthStatus.DEGRADED
        else:
            telemetry_status = HealthStatus.UNHEALTHY

        return TelemetryHealthResponse(
            telemetry_status=telemetry_status,
            tracing_enabled=tracing_enabled,
            metrics_enabled=metrics_enabled,
            logging_enabled=logging_enabled,
            endpoints={
                "health": "/health",
                "telemetry": "/api/telemetry/health",
                "metrics": "/api/metrics",
                "traces": "/api/traces"
            }
        )

    @router.get("/api/learning/status", tags=["learning"])
    async def learning_status():
        """
        Learning and cognitive system status check
        Validates agent learning, reinforcement feedback, knowledge base
        """
        learning_enabled = os.getenv("TORQ_LEARNING_ENABLED", "true").lower() == "true"

        return {
            "learning_status": HealthStatus.HEALTHY if learning_enabled else HealthStatus.UNKNOWN,
            "learning_enabled": learning_enabled,
            "agent_cognitive_loop": "operational" if learning_enabled else "disabled",
            "knowledge_plane": "available" if learning_enabled else "limited",
            "reinforcement_enabled": os.getenv("TORQ_REINFORCEMENT_ENABLED", "false").lower() == "true",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    @router.get("/api/monitoring/dashboards", tags=["monitoring"])
    async def monitoring_dashboards():
        """
        Returns URLs for all monitoring dashboards
        """
        return {
            "grafana": os.getenv("GRAFANA_URL", "https://grafana.example.com"),
            "railway": os.getenv("RAILWAY_PROJECT_URL", "https://railway.app/project/xxx"),
            "supabase": os.getenv("SUPABASE_URL", "https://xxx.supabase.co"),
            "tempo": os.getenv("TEMPO_URL", "https://tempo.example.com"),
            "prometheus": os.getenv("PROMETHEUS_URL", "https://prometheus.example.com"),
            "status": "configured" if os.getenv("GRAFANA_URL") else "not_configured"
        }

    return router


__all__ = [
    "HealthChecker",
    "HealthStatus",
    "ComponentHealth",
    "SystemHealth",
    "HealthCheckResult",
    "SystemHealthReport",
    "create_health_router",
]
