# PulseX API Integration Layer

A comprehensive, production-ready API integration layer for the PulseX daily briefing application. This layer provides unified access to LLM providers, news sources, crypto data APIs, push notifications, analytics, and includes robust monitoring, cost tracking, and error handling.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Integration Manager                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ LLM Manager │  │ News Aggregator │  │ Health Checker │ │
│  └─────────────┘  └─────────────────┘  └────────────────┘ │
│                                                             │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ Cost Track  │  │ Rate Limiter    │  │ Cache Manager  │ │
│  └─────────────┘  └─────────────────┘  └────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                        Core Layer                           │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ Base Client │  │ Retry Handler   │  │ Error Handler  │ │
│  └─────────────┘  └─────────────────┘  └────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Provider Layer                           │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │   OpenAI    │  │    NewsAPI      │  │   CoinGecko   │ │
│  └─────────────┘  └─────────────────┘  └────────────────┘ │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │  Anthropic  │  │    Guardian     │  │ CoinMarketCap  │ │
│  └─────────────┘  └─────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 🚀 **Multi-Provider Support**
- **LLM**: OpenAI GPT-4, Anthropic Claude
- **News**: NewsAPI, Guardian API
- **Crypto**: CoinGecko, CoinMarketCap
- **Notifications**: Apple APNs
- **Analytics**: PostHog, Amplitude

### 🔄 **Load Balancing & Fallback**
- Intelligent provider selection based on cost, performance, and availability
- Automatic failover with circuit breaker pattern
- Exponential backoff retry logic
- Health monitoring with automatic recovery

### 💰 **Cost Optimization**
- Real-time cost tracking and budget alerts
- Provider cost comparison
- Model selection based on task complexity
- Usage analytics and optimization recommendations

### 🛡️ **Reliability & Monitoring**
- Comprehensive health checks
- Rate limiting with configurable quotas
- Response caching with TTL
- Error handling with detailed logging
- Performance metrics collection

### 🔍 **Content Quality**
- Political bias detection and neutralization
- Content filtering and safety measures
- Source credibility scoring
- Fact-checking integration
- Quality metrics and validation

## Quick Start

### Installation

```bash
npm install
```

### Environment Configuration

```bash
# LLM Providers
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# News Providers
NEWSAPI_API_KEY=your_newsapi_key
GUARDIAN_API_KEY=your_guardian_api_key

# Crypto Providers
COINGECKO_API_KEY=your_coingecko_api_key
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key

# Analytics
POSTHOG_API_KEY=your_posthog_api_key
AMPLITUDE_API_KEY=your_amplitude_api_key

# Caching & Performance
REDIS_URL=redis://localhost:6379
ENABLE_METRICS=true
ENABLE_COST_TRACKING=true

# Budget Controls
DAILY_BUDGET=100
COST_ALERT_THRESHOLD=50
```

### Basic Usage

```typescript
import { IntegrationManager } from './integrations';

// Initialize the integration manager
const integrationManager = new IntegrationManager({
  enableHealthChecks: true,
  enableCostTracking: true,
  costAlertThreshold: 100,
});

// Generate daily briefing
const briefing = await integrationManager.generateDailyBriefing({
  interests: {
    'technology': 0.6,
    'business': 0.3,
    'science': 0.1,
  },
  maxArticles: 5,
  tone: 'neutral',
  includeFinancial: true,
});

console.log(`Generated ${briefing.cards.length} briefing cards`);
console.log(`Total cost: $${briefing.metadata.totalCost.toFixed(4)}`);

// Search for news with AI analysis
const searchResults = await integrationManager.searchNews('artificial intelligence', {
  categories: ['technology', 'science'],
  maxResults: 10,
  includeAnalysis: true,
  tone: 'analytical',
});

// Monitor system health
const health = integrationManager.getSystemHealth();
console.log('System Health:', health);

// Get cost analysis
const costs = integrationManager.getCostAnalysis();
if (costs) {
  console.log('Daily Cost:', costs.summary.total);
  console.log('Recommendations:', costs.recommendations);
}
```

## Advanced Configuration

### Load Balancing Strategy

```typescript
const llmManager = new LLMManager({
  primaryProvider: 'openai',
  fallbackProviders: ['anthropic'],
  loadBalancing: {
    strategy: 'cost_optimized', // 'round_robin', 'weighted', 'performance_based'
    providers: [
      {
        provider: 'openai',
        model: 'gpt-4-turbo-preview',
        weight: 0.6,
        maxCostPerHour: 10,
        enabled: true,
      },
      {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        weight: 0.4,
        maxCostPerHour: 8,
        enabled: true,
      },
    ],
  },
  costOptimization: {
    enabled: true,
    maxCostPerRequest: 0.1,
    preferCheaperForSimpleTasks: true,
  },
});
```

### Rate Limiting Configuration

```typescript
const config = {
  rateLimit: {
    requestsPerSecond: 10,
    requestsPerMinute: 600,
    requestsPerHour: 36000,
    requestsPerDay: 864000,
    burstLimit: 20,
  },
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: ['rate_limit_exceeded', 'timeout', 'server_error'],
  },
};
```

### Caching Strategy

```typescript
const config = {
  cache: {
    enabled: true,
    ttl: 300, // 5 minutes
    key: 'pulsex:integrations',
  },
};
```

## Monitoring & Observability

### Health Checks

```typescript
// Check specific service health
const llmHealth = await llmManager.healthCheck();

// Monitor health changes
integrationManager.on('healthStatusChange', (event) => {
  console.log(`Service ${event.service} changed from ${event.previousStatus} to ${event.currentStatus}`);

  if (event.currentStatus === 'unhealthy') {
    // Trigger alert or fallback logic
  }
});
```

### Cost Tracking

```typescript
// Track costs manually
costTracker.trackCost({
  provider: 'openai',
  service: 'llm',
  operation: 'text_generation',
  cost: 0.05,
  tokens: 1500,
  model: 'gpt-4-turbo-preview',
});

// Get cost summary
const summary = costTracker.getSummary('openai', 'day');
console.log(`Daily OpenAI costs: $${summary[0].totalCost.toFixed(2)}`);

// Set budget alerts
costTracker.setBudget('openai', 50); // $50 daily budget
```

### Performance Metrics

```typescript
// Get client metrics
const metrics = openaiClient.getMetrics();
console.log({
  totalRequests: metrics.totalRequests,
  successRate: metrics.successfulRequests / metrics.totalRequests,
  averageResponseTime: metrics.averageResponseTime,
  totalCost: metrics.totalCost,
});
```

## Error Handling

### Custom Error Types

```typescript
import {
  IntegrationError,
  RateLimitError,
  AuthenticationError,
  QuotaExceededError,
} from './integrations/types/common';

try {
  const response = await openaiClient.generateText(request);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof AuthenticationError) {
    console.log('API key authentication failed');
  } else if (error instanceof QuotaExceededError) {
    console.log('API quota exceeded');
  } else if (error instanceof IntegrationError) {
    console.log(`Integration error: ${error.message}`);
    console.log(`Retryable: ${error.retryable}`);
  }
}
```

### Error Recovery

```typescript
// Circuit breaker pattern
const circuitBreaker = {
  failureThreshold: 5,
  timeout: 60000,
  halfOpenMaxCalls: 3,
};

const response = await retryHandler.executeWithCircuitBreaker(
  () => client.generateText(request),
  circuitBreaker
);
```

## Content Quality & Safety

### Bias Analysis

```typescript
// Analyze political bias
const biasAnalysis = await llmManager.analyzeBias(text);
console.log('Political Bias:', biasAnalysis.politicalBias);
console.log('Sentiment:', biasAnalysis.sentimentAnalysis);
console.log('Flagged Content:', biasAnalysis.flaggedContent);

// Filter content by bias
const filteredContent = await newsAggregator.searchNews({
  query: 'politics',
  excludeBias: ['left', 'right'], // Only center/neutral
  minCredibility: 80, // Minimum credibility score
});
```

### Content Filtering

```typescript
const filterConfig = {
  enabled: true,
  prohibitedWords: ['fake', 'hoax', 'conspiracy'],
  politicalBiasThreshold: 0.7,
  sentimentAnalysis: true,
  factChecking: true,
  spamDetection: true,
  clickbaitDetection: true,
};
```

## Performance Optimization

### Response Caching

```typescript
// Enable intelligent caching
const cacheManager = new CacheManager({
  enabled: true,
  ttl: 300, // 5 minutes
  key: 'pulsex:cache',
});

// Cache multiple items
await cacheManager.mset([
  { key: 'user:123:preferences', data: preferences, ttl: 3600 },
  { key: 'news:tech:latest', data: articles, ttl: 180 },
]);

// Get multiple items
const cached = await cacheManager.mget([
  'user:123:preferences',
  'news:tech:latest',
]);
```

### Batch Operations

```typescript
// Process multiple requests in parallel
const articles = await Promise.all(
  requests.map(request => newsAggregator.searchNews(request))
);

// Batch cost tracking
costTracker.trackBatch([
  { provider: 'openai', cost: 0.05, operation: 'generation' },
  { provider: 'anthropic', cost: 0.03, operation: 'analysis' },
]);
```

## Testing

```bash
# Run integration tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific integration tests
npm test -- --grep "LLM Manager"
```

### Mock Testing

```typescript
import { MockLLMClient } from './__mocks__/llm-client';

// Use mock client for testing
const mockClient = new MockLLMClient({
  simulateFailures: true,
  latency: 100,
  costPerRequest: 0.01,
});

const llmManager = new LLMManager({
  clients: { openai: mockClient },
});
```

## Deployment Considerations

### Environment Variables

```bash
# Production
NODE_ENV=production
LOG_LEVEL=info
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true

# Redis for caching
REDIS_URL=redis://redis-cluster:6379

# Database for metrics
METRICS_DB_URL=postgresql://user:pass@db:5432/metrics
```

### Monitoring

```typescript
// Prometheus metrics
import { register } from 'prom-client';

// Custom metrics
const integrationLatency = new promClient.Histogram({
  name: 'integration_request_duration_seconds',
  help: 'Duration of integration requests',
  labelNames: ['provider', 'operation', 'status'],
});

const integrationCosts = new promClient.Counter({
  name: 'integration_costs_total',
  help: 'Total costs for integration requests',
  labelNames: ['provider', 'currency'],
});
```

### Scaling

- **Horizontal Scaling**: Stateless services can be scaled horizontally
- **Rate Limiting**: Distributed rate limiting using Redis
- **Caching**: Redis cluster for shared caching
- **Load Balancing**: Application-level load balancing with provider failover

## Security

### API Key Management

```typescript
// Use environment variables for API keys
const config = {
  apiKey: process.env.OPENAI_API_KEY,
  // Never hardcode API keys
};

// Rotate keys regularly
const keyRotation = {
  interval: '30d', // Rotate every 30 days
  gracePeriod: '7d', // Allow overlap during rotation
};
```

### Input Validation

```typescript
import { z } from 'zod';

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().max(10000),
  })),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8192).optional(),
});

// Validate requests
const validated = requestSchema.parse(request);
```

## Troubleshooting

### Common Issues

1. **Rate Limiting**: Check rate limit configurations and implement proper backoff
2. **Authentication**: Verify API keys and permissions
3. **Cost Overruns**: Monitor cost tracking and set appropriate budgets
4. **Performance**: Enable caching and optimize request patterns
5. **Reliability**: Configure proper fallback and retry strategies

### Debug Mode

```typescript
// Enable debug logging
const integrationManager = new IntegrationManager({
  enableDebugMode: true,
  logLevel: 'debug',
});

// Get detailed metrics
const metrics = integrationManager.getSystemHealth();
console.log('Detailed Health:', JSON.stringify(metrics, null, 2));
```

## Contributing

1. Follow the existing code style and patterns
2. Add comprehensive tests for new features
3. Update documentation for any API changes
4. Ensure all integration tests pass
5. Add cost tracking for new providers

## License

This integration layer is part of the PulseX project and subject to the project's license terms.

## Support

For issues, questions, or contributions, please refer to the project's GitHub repository or contact the development team.