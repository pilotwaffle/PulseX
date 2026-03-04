"""
TORQ Rate Limit Testing Script
Tests that rate limits are properly enforced as specified in the PRD
"""

import asyncio
import sys
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, "E:\\")

from infrastructure.rate_limit import (
    RateLimiter,
    RateLimitConfig,
    RateLimitTier,
    RateLimitError,
    RateLimitInfo
)


async def test_public_rate_limit():
    """Test Public API rate limit: 60 requests per minute"""
    print("\n" + "="*70)
    print("TEST 1: Public API Rate Limit (60 requests per minute)")
    print("="*70)

    config = RateLimitConfig(
        public_rate=60,
        window_seconds=60,
        enabled=True,
    )

    limiter = RateLimiter(config=config)
    identifier = "public_test_client"

    # Send 65 requests (should exceed limit after 60)
    success_count = 0
    rate_limited_count = 0

    for i in range(1, 66):
        try:
            info = await limiter.check_rate_limit(
                identifier=identifier,
                tier=RateLimitTier.PUBLIC
            )
            success_count += 1
            if i % 10 == 0:
                print(f"Request {i}: OK - Remaining: {info.remaining}/{info.limit}")
        except RateLimitError as e:
            rate_limited_count += 1
            print(f"Request {i}: RATE LIMITED - {e.info.retry_after}s retry")

    print(f"\n--- Results ---")
    print(f"Successful requests: {success_count}/60")
    print(f"Rate limited requests: {rate_limited_count}/5")
    print(f"Test {'PASSED' if success_count == 60 and rate_limited_count == 5 else 'FAILED'}")

    return success_count == 60 and rate_limited_count == 5


async def test_admin_rate_limit():
    """Test Admin endpoint rate limit: 20 requests per minute"""
    print("\n" + "="*70)
    print("TEST 2: Admin API Rate Limit (20 requests per minute)")
    print("="*70)

    config = RateLimitConfig(
        admin_rate=20,
        window_seconds=60,
        enabled=True,
    )

    limiter = RateLimiter(config=config)
    identifier = "admin_test_client"

    # Send 25 requests (should exceed limit after 20)
    success_count = 0
    rate_limited_count = 0

    for i in range(1, 26):
        try:
            info = await limiter.check_rate_limit(
                identifier=identifier,
                tier=RateLimitTier.ADMIN
            )
            success_count += 1
            if i % 5 == 0:
                print(f"Request {i}: OK - Remaining: {info.remaining}/{info.limit}")
        except RateLimitError as e:
            rate_limited_count += 1
            print(f"Request {i}: RATE LIMITED - {e.info.retry_after}s retry")

    print(f"\n--- Results ---")
    print(f"Successful requests: {success_count}/20")
    print(f"Rate limited requests: {rate_limited_count}/5")
    print(f"Test {'PASSED' if success_count == 20 and rate_limited_count == 5 else 'FAILED'}")

    return success_count == 20 and rate_limited_count == 5


async def test_mcp_rate_limit():
    """Test MCP client rate limit: 120 requests per minute"""
    print("\n" + "="*70)
    print("TEST 3: MCP Client Rate Limit (120 requests per minute)")
    print("="*70)

    config = RateLimitConfig(
        mcp_rate=120,
        window_seconds=60,
        enabled=True,
    )

    limiter = RateLimiter(config=config)
    identifier = "mcp_test_client"

    # Send 125 requests (should exceed limit after 120)
    success_count = 0
    rate_limited_count = 0

    for i in range(1, 126):
        try:
            info = await limiter.check_rate_limit(
                identifier=identifier,
                tier=RateLimitTier.MCP
            )
            success_count += 1
            if i % 20 == 0:
                print(f"Request {i}: OK - Remaining: {info.remaining}/{info.limit}")
        except RateLimitError as e:
            rate_limited_count += 1
            print(f"Request {i}: RATE LIMITED - {e.info.retry_after}s retry")

    print(f"\n--- Results ---")
    print(f"Successful requests: {success_count}/120")
    print(f"Rate limited requests: {rate_limited_count}/5")
    print(f"Test {'PASSED' if success_count == 120 and rate_limited_count == 5 else 'FAILED'}")

    return success_count == 120 and rate_limited_count == 5


async def test_multiple_clients():
    """Test rate limiting across multiple clients"""
    print("\n" + "="*70)
    print("TEST 4: Multiple Clients (Each with independent rate limits)")
    print("="*70)

    config = RateLimitConfig(
        public_rate=10,  # Lower for testing
        window_seconds=60,
        enabled=True,
    )

    limiter = RateLimiter(config=config)

    # Test 3 clients simultaneously
    clients = ["client_a", "client_b", "client_c"]
    results = {}

    for client in clients:
        success_count = 0
        for i in range(1, 16):  # Try 15 (limit is 10)
            try:
                await limiter.check_rate_limit(client, RateLimitTier.PUBLIC)
                success_count += 1
            except RateLimitError:
                pass
        results[client] = success_count

    print(f"\n--- Results ---")
    for client, count in results.items():
        print(f"{client}: {count}/10 requests successful")

    all_correct = all(count == 10 for count in results.values())
    print(f"Test {'PASSED' if all_correct else 'FAILED'}")

    return all_correct


async def test_sliding_window():
    """Test sliding window behavior"""
    print("\n" + "="*70)
    print("TEST 5: Sliding Window (Old requests expire)")
    print("="*70)

    config = RateLimitConfig(
        public_rate=5,
        window_seconds=5,  # 5 second window for testing
        enabled=True,
    )

    limiter = RateLimiter(config=config)
    identifier = "sliding_window_test"

    print("Sending 5 requests (should all succeed)...")
    for i in range(1, 6):
        info = await limiter.check_rate_limit(identifier, RateLimitTier.PUBLIC)
        print(f"Request {i}: OK - Remaining: {info.remaining}")

    print("\nWaiting for 6 seconds (window to expire)...")
    await asyncio.sleep(6)

    print("Sending another request (should succeed after window expires)...")
    try:
        info = await limiter.check_rate_limit(identifier, RateLimitTier.PUBLIC)
        print(f"Request 6: OK - Remaining: {info.remaining}")
        print("Test PASSED - Sliding window working correctly")
        return True
    except RateLimitError:
        print("Test FAILED - Request should have succeeded after window expired")
        return False


async def main():
    """Run all rate limit tests"""
    print("\n" + "="*70)
    print("TORQ RATE LIMITING TEST SUITE")
    print(f"Started at: {datetime.utcnow().isoformat()}")
    print("="*70)

    tests = [
        ("Public API Rate Limit", test_public_rate_limit),
        ("Admin API Rate Limit", test_admin_rate_limit),
        ("MCP Client Rate Limit", test_mcp_rate_limit),
        ("Multiple Clients", test_multiple_clients),
        ("Sliding Window", test_sliding_window),
    ]

    results = []
    for name, test_func in tests:
        try:
            passed = await test_func()
            results.append((name, passed))
        except Exception as e:
            print(f"\nERROR in {name}: {e}")
            results.append((name, False))

    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)

    passed = sum(1 for _, p in results if p)
    total = len(results)

    for name, p in results:
        status = "PASSED" if p else "FAILED"
        print(f"{name}: {status}")

    print(f"\nTotal: {passed}/{total} tests passed")
    print(f"Overall: {'ALL TESTS PASSED' if passed == total else 'SOME TESTS FAILED'}")
    print(f"Completed at: {datetime.utcnow().isoformat()}")

    return passed == total


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
