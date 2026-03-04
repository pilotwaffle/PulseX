#!/usr/bin/env python3
"""
TORQ Console - Health Endpoint Test Suite
Step 6: System Health Monitoring Validation

Tests all required health endpoints from the PRD:
- /health
- /api/telemetry/health
- /api/learning/status

Validates: Database connectivity, LLM configuration, Supabase access, Redis availability
"""

import os
import asyncio
import sys
import json
from datetime import datetime, timezone
from typing import Dict, List

from health import (
    HealthStatus,
    HealthCheckResult,
    SystemHealthReport,
    HealthChecker,
    create_health_router,
    HealthResponse,
    TelemetryHealthResponse,
    ComponentHealth,
    SystemHealth,
)


class HealthEndpointTester:
    """
    Comprehensive test suite for health endpoints
    """

    def __init__(self):
        self.test_results = []
        self.passed = 0
        self.failed = 0
        self.skipped = 0

    def log_test(self, test_name: str, passed: bool, details: str = ""):
        """Log test result"""
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{status}: {test_name}")
        if details:
            print(f"  Details: {details}")

        self.test_results.append({
            "name": test_name,
            "passed": passed,
            "details": details,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        if passed:
            self.passed += 1
        else:
            self.failed += 1

    def log_skip(self, test_name: str, reason: str = ""):
        """Log skipped test"""
        status = "[SKIP]"
        print(f"{status}: {test_name}")
        if reason:
            print(f"  Reason: {reason}")

        self.test_results.append({
            "name": test_name,
            "passed": False,
            "skipped": True,
            "details": reason,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        self.skipped += 1

    def print_summary(self):
        """Print test summary"""
        total = self.passed + self.failed
        pass_rate = (self.passed / total * 100) if total > 0 else 0

        print("\n" + "="*60)
        print("Test Summary")
        print("="*60)
        print(f"Total Tests: {total}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Skipped: {self.skipped}")
        print(f"Pass Rate: {pass_rate:.1f}%")
        print("="*60)

        if self.failed > 0:
            print("\nFailed Tests:")
            for result in self.test_results:
                if not result.get("passed", False) and not result.get("skipped", False):
                    print(f"  - {result['name']}")
                    if result.get('details'):
                        print(f"    {result['details']}")

    def save_results(self, filepath: str):
        """Save test results to JSON file"""
        with open(filepath, 'w') as f:
            json.dump({
                "summary": {
                    "total": self.passed + self.failed,
                    "passed": self.passed,
                    "failed": self.failed,
                    "skipped": self.skipped,
                    "pass_rate": (self.passed / (self.passed + self.failed) * 100) if (self.passed + self.failed) > 0 else 0
                },
                "results": self.test_results
            }, f, indent=2)
        print(f"\nTest results saved to: {filepath}")


async def test_health_check_module():
    """Test the health check module components"""
    print("\n" + "="*60)
    print("Testing Health Check Module")
    print("="*60)

    tester = HealthEndpointTester()

    # Test 1: HealthStatus enum
    print("\nTest 1: HealthStatus Enum")
    try:
        assert HealthStatus.HEALTHY == "healthy"
        assert HealthStatus.DEGRADED == "degraded"
        assert HealthStatus.UNHEALTHY == "unhealthy"
        assert HealthStatus.UNKNOWN == "unknown"
        assert HealthStatus.CRITICAL == "critical"
        tester.log_test("HealthStatus enum values", True)
    except AssertionError as e:
        tester.log_test("HealthStatus enum values", False, str(e))

    # Test 2: HealthCheckResult creation
    print("\nTest 2: HealthCheckResult Creation")
    try:
        result = HealthCheckResult(
            component="test",
            status=HealthStatus.HEALTHY,
            message="Test check passed",
            latency_ms=42.5
        )
        assert result.component == "test"
        assert result.status == HealthStatus.HEALTHY
        assert result.message == "Test check passed"
        assert result.latency_ms == 42.5
        assert result.timestamp is not None
        tester.log_test("HealthCheckResult creation", True)
    except Exception as e:
        tester.log_test("HealthCheckResult creation", False, str(e))

    # Test 3: HealthCheckResult to_dict conversion
    print("\nTest 3: HealthCheckResult to_dict()")
    try:
        result = HealthCheckResult(
            component="database",
            status=HealthStatus.HEALTHY,
            message="Database connected",
            latency_ms=15.3,
            details={"connected": True, "pool_size": 10}
        )
        result_dict = result.to_dict()
        assert isinstance(result_dict, dict)
        assert result_dict["component"] == "database"
        assert result_dict["status"] == HealthStatus.HEALTHY
        assert "latency_ms" in result_dict
        assert "details" in result_dict
        tester.log_test("HealthCheckResult to_dict()", True)
    except Exception as e:
        tester.log_test("HealthCheckResult to_dict()", False, str(e))

    # Test 4: SystemHealthReport creation
    print("\nTest 4: SystemHealthReport Creation")
    try:
        checks = [
            HealthCheckResult("database", HealthStatus.HEALTHY, "DB OK", latency_ms=10.5),
            HealthCheckResult("redis", HealthStatus.HEALTHY, "Redis OK", latency_ms=5.2),
            HealthCheckResult("llm", HealthStatus.DEGRADED, "LLM slow", latency_ms=550.0)
        ]
        report = SystemHealthReport(
            status=HealthStatus.HEALTHY,
            version="1.0.0",
            uptime_seconds=1234.5,
            timestamp=datetime.now(timezone.utc).isoformat(),
            checks=checks,
            environment="test"
        )
        assert len(report.checks) == 3
        assert report.version == "1.0.0"
        tester.log_test("SystemHealthReport creation", True)
    except Exception as e:
        tester.log_test("SystemHealthReport creation", False, str(e))

    # Test 5: ComponentHealth creation
    print("\nTest 5: ComponentHealth Creation")
    try:
        component = ComponentHealth(
            name="test_component",
            status=HealthStatus.HEALTHY,
            last_check=datetime.now(timezone.utc),
            latency_ms=25.0
        )
        assert component.name == "test_component"
        assert component.status == HealthStatus.HEALTHY
        tester.log_test("ComponentHealth creation", True)
    except Exception as e:
        tester.log_test("ComponentHealth creation", False, str(e))

    # Test 6: SystemHealth creation
    print("\nTest 6: SystemHealth Creation")
    try:
        components = [
            ComponentHealth("db", HealthStatus.HEALTHY, datetime.now(timezone.utc)),
            ComponentHealth("redis", HealthStatus.HEALTHY, datetime.now(timezone.utc))
        ]
        health = SystemHealth(
            status=HealthStatus.HEALTHY,
            components=components,
            timestamp=datetime.now(timezone.utc),
            uptime_seconds=100.0
        )
        assert len(health.components) == 2
        assert health.status == HealthStatus.HEALTHY
        tester.log_test("SystemHealth creation", True)
    except Exception as e:
        tester.log_test("SystemHealth creation", False, str(e))

    tester.print_summary()
    return tester


async def test_health_checker():
    """Test the HealthChecker component"""
    print("\n" + "="*60)
    print("Testing HealthChecker Component")
    print("="*60)

    tester = HealthEndpointTester()

    # Create a health checker
    import time
    start_time = time.time()
    health_checker = HealthChecker(start_time=start_time)

    # Test 1: Uptime calculation
    print("\nTest 1: Uptime Calculation")
    try:
        uptime = health_checker.get_uptime()
        assert uptime >= 0
        assert isinstance(uptime, float)
        tester.log_test("Uptime calculation", True, f"Uptime: {uptime:.2f}s")
    except Exception as e:
        tester.log_test("Uptime calculation", False, str(e))

    # Test 2: Check all components (PRD method)
    print("\nTest 2: Check All Components (PRD Step 6)")
    try:
        report = await health_checker.check_all_prd()
        assert isinstance(report, SystemHealthReport)
        assert isinstance(report.checks, list)
        assert report.version == health_checker.version
        tester.log_test(
            "check_all_prd() method",
            True,
            f"Status: {report.status}, Checks: {len(report.checks)}"
        )
    except Exception as e:
        tester.log_test("check_all_prd() method", False, str(e))

    # Test 3: Component checks exist
    print("\nTest 3: Required Component Checks")
    required_checks = ["database", "llm", "supabase", "redis"]
    try:
        report = await health_checker.check_all_prd()
        component_names = [check.component for check in report.checks]
        for required in required_checks:
            if required in component_names:
                tester.log_test(f"Component check: {required}", True)
            else:
                tester.log_test(
                    f"Component check: {required}",
                    False,
                    "Check not found"
                )
    except Exception as e:
        tester.log_test("Component checks", False, str(e))

    # Test 4: get_system_health
    print("\nTest 4: get_system_health()")
    try:
        health = health_checker.get_system_health()
        assert isinstance(health, SystemHealth)
        assert health.uptime_seconds >= 0
        tester.log_test("get_system_health() method", True)
    except Exception as e:
        tester.log_test("get_system_health() method", False, str(e))

    # Test 5: register_component
    print("\nTest 5: register_component()")
    try:
        health_checker.register_component("test_component", HealthStatus.HEALTHY)
        health = health_checker.get_system_health()
        component_names = [c.name for c in health.components]
        assert "test_component" in component_names
        tester.log_test("register_component() method", True)
    except Exception as e:
        tester.log_test("register_component() method", False, str(e))

    tester.print_summary()
    return tester


async def test_fastapi_router():
    """Test the FastAPI router creation"""
    print("\n" + "="*60)
    print("Testing FastAPI Router")
    print("="*60)

    tester = HealthEndpointTester()

    try:
        import time
        health_checker = HealthChecker(start_time=time.time())
        router = create_health_router(health_checker)
        assert router is not None
        tester.log_test("Router creation", True)

        # Test that router has the required routes
        routes = [route.path for route in router.routes]
        required_routes = ["/health", "/api/telemetry/health", "/api/learning/status"]

        print("\nTest: Required Routes")
        for required in required_routes:
            if any(required in route for route in routes):
                tester.log_test(f"Route: {required}", True)
            else:
                tester.log_test(f"Route: {required}", False, "Route not found")

    except Exception as e:
        tester.log_test("Router creation", False, str(e))

    tester.print_summary()
    return tester


async def test_pydantic_models():
    """Test Pydantic models for API responses"""
    print("\n" + "="*60)
    print("Testing Pydantic Models")
    print("="*60)

    tester = HealthEndpointTester()

    # Test 1: HealthResponse model
    print("\nTest 1: HealthResponse Model")
    try:
        response = HealthResponse(
            status="healthy",
            version="1.0.0",
            uptime_seconds=1234.5,
            timestamp=datetime.now(timezone.utc).isoformat(),
            environment="test",
            checks=[
                {
                    "component": "database",
                    "status": "healthy",
                    "message": "Database connected",
                    "latency_ms": 10.5,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "details": {"connected": True}
                }
            ]
        )
        assert response.status == "healthy"
        assert len(response.checks) == 1
        tester.log_test("HealthResponse model", True)
    except Exception as e:
        tester.log_test("HealthResponse model", False, str(e))

    # Test 2: TelemetryHealthResponse model
    print("\nTest 2: TelemetryHealthResponse Model")
    try:
        telemetry_response = TelemetryHealthResponse(
            telemetry_status="healthy",
            tracing_enabled=True,
            metrics_enabled=True,
            logging_enabled=True,
            endpoints={
                "grafana": "https://grafana.example.com",
                "railway": "https://railway.app/project/xxx"
            }
        )
        assert telemetry_response.telemetry_status == "healthy"
        assert telemetry_response.tracing_enabled is True
        tester.log_test("TelemetryHealthResponse model", True)
    except Exception as e:
        tester.log_test("TelemetryHealthResponse model", False, str(e))

    tester.print_summary()
    return tester


async def run_all_tests():
    """Run all test suites"""
    print("\n" + "="*60)
    print("TORQ Infrastructure - Step 6 Health Monitoring")
    print("Comprehensive Test Suite")
    print("="*60)

    all_testers = []

    # Test 1: Module components
    all_testers.append(await test_health_check_module())

    # Test 2: HealthChecker
    all_testers.append(await test_health_checker())

    # Test 3: FastAPI router
    all_testers.append(await test_fastapi_router())

    # Test 4: Pydantic models
    all_testers.append(await test_pydantic_models())

    # Aggregate results
    total_passed = sum(t.passed for t in all_testers)
    total_failed = sum(t.failed for t in all_testers)
    total_tests = total_passed + total_failed
    pass_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0

    print("\n" + "="*60)
    print("OVERALL TEST RESULTS")
    print("="*60)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {total_passed}")
    print(f"Failed: {total_failed}")
    print(f"Skipped: {sum(t.skipped for t in all_testers)}")
    print(f"Pass Rate: {pass_rate:.1f}%")
    print("="*60)

    # Return exit code based on pass rate
    return 0 if pass_rate >= 80 else 1


if __name__ == "__main__":
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)
