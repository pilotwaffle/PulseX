# TORQ Infrastructure

This directory contains the infrastructure code for the TORQ platform.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                        │
│       Browser / MCP Clients / Discord                   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     EDGE LAYER                          │
│           Vercel CDN + Gateway                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                 INFRASTRUCTURE LAYER                    │
│  ┌───────────────┐  ┌──────────────────┐               │
│  │ Redis Cache   │  │  API Gateway     │               │
│  │ (Upstash)     │  │  Security        │               │
│  └───────────────┘  └──────────────────┘               │
│  ┌─────────────────────────────────────────────────┐   │
│  │        OpenTelemetry Tracing                     │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │        CI/CD Pipeline                            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              INTELLIGENCE LAYER                         │
│        Agent Cognitive Loop                             │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                MEMORY LAYER                             │
│           Knowledge Plane                               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                 DATA LAYER                              │
│    Supabase (PostgreSQL + pgvector)                     │
└─────────────────────────────────────────────────────────┘
```

## Modules

### `cache.py`
Redis caching layer with fallback behavior.

**Features:**
- Semantic search result caching
- API response caching
- Short-term agent memory
- Graceful fallback when Redis unavailable

### `tracing.py`
OpenTelemetry distributed tracing implementation.

**Features:**
- Automatic span generation
- Trace ID propagation
- Integration with multiple backends (Grafana Tempo, Jaeger, Datadog)

### `gateway.py`
API Gateway with security features.

**Features:**
- Rate limiting
- API key validation
- Request/response logging
- Abuse protection

### `rate_limit.py`
Rate limiting implementation.

**Features:**
- Configurable limits per endpoint
- Sliding window algorithm
- Redis-backed (optional)

### `health.py`
Health check endpoints.

**Features:**
- Database connectivity checks
- LLM configuration validation
- Redis availability check
- System status reporting

## Configuration

All modules are configured via environment variables. See `.env.example` for the complete list.

### Required Variables

```bash
# Redis
REDIS_URL=redis://user:password@localhost:6379

# OpenTelemetry
OTEL_EXPORTER_ENDPOINT=https://otel-collector.example.com:4317
OTEL_SERVICE_NAME=torq-console

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Usage

```python
from infrastructure.cache import Cache
from infrastructure.tracing import Tracer
from infrastructure.gateway import Gateway
from infrastructure.rate_limit import RateLimiter
from infrastructure.health import HealthChecker

# Initialize modules
cache = Cache()
tracer = Tracer()
gateway = Gateway()
rate_limiter = RateLimiter()
health_checker = HealthChecker()

# Use in your application
@app.get("/api/search")
async def search(query: str):
    # Check rate limit
    if not rate_limiter.check("search"):
        raise HTTPException(429, "Rate limit exceeded")

    # Check cache
    cached = await cache.get(f"search:{query}")
    if cached:
        return cached

    # Trace the operation
    with tracer.span("semantic_search"):
        results = await semantic_search(query)

    # Cache results
    await cache.set(f"search:{query}", results, ttl=300)

    return results
```

## Deployment

The infrastructure is deployed automatically via GitHub Actions. See `.github/workflows/` for details.

### Manual Deployment

```bash
# Deploy to Railway
railway up --service=backend

# Deploy to Vercel
vercel deploy --prod
```

### Rollback

```bash
# Rollback to a specific commit
gh workflow run rollback.yml \
  -f target_sha=<commit-sha> \
  -f reason="Rollback due to issue"
```

## Monitoring

- Health checks run every 5 minutes
- Metrics are collected and uploaded as artifacts
- Traces are sent to the configured OpenTelemetry backend
- Cost reports are generated periodically

## Performance Targets

| Metric | Target |
|--------|--------|
| API response time | < 300 ms |
| Redis lookup | < 50 ms |
| Vector search | < 250 ms |
| System uptime | > 99.9% |

## Success Metrics

- Cache hit rate > 40%
- Trace coverage > 95%
- Deployment success rate > 99%
- Infrastructure failure rate < 0.5%

## Failure Recovery

The system is designed to degrade gracefully during failures:

| Failure | Fallback Behavior |
|---------|-------------------|
| Redis unavailable | Bypass cache, query backend directly |
| Supabase latency | Retry with exponential backoff |
| LLM provider failure | Fallback to secondary model |
| Vector search error | Fallback to text search |
| External tool failure | Retry or use alternate tool |

**Retry policy:** 3 retries with exponential backoff

## Security

All modules implement security best practices:

- **Rate limiting** to prevent abuse
- **API key validation** for external services
- **Request sanitization** to prevent injection attacks
- **Structured logging** for audit trails
- **OpenTelemetry tracing** for observability

## Contributing

When adding new infrastructure modules:

1. Follow the existing module structure
2. Add type hints and docstrings
3. Implement health checks
4. Add metrics/telemetry
5. Update this README
