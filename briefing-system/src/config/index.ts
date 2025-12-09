import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

interface Config {
  // Database
  database: {
    url: string;
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    ssl: boolean;
    pool: {
      min: number;
      max: number;
    };
  };

  // Redis
  redis: {
    url: string;
    host: string;
    port: number;
    password?: string;
    db: number;
  };

  // LLM APIs
  llm: {
    openai: {
      apiKey: string;
      model: string;
      maxTokens: number;
      temperature: number;
    };
    anthropic: {
      apiKey: string;
      model: string;
      maxTokens: number;
      temperature: number;
    };
    google: {
      apiKey: string;
      model: string;
    };
  };

  // Content Sources
  contentSources: {
    coingecko: {
      apiKey: string;
      baseUrl: string;
    };
    coinmarketcap: {
      apiKey: string;
      baseUrl: string;
    };
    newsApi: {
      apiKey: string;
      baseUrl: string;
    };
    alphaVantage: {
      apiKey: string;
      baseUrl: string;
    };
    reddit: {
      clientId: string;
      clientSecret: string;
    };
    twitter: {
      bearerToken: string;
    };
  };

  // Security
  security: {
    jwt: {
      secret: string;
      expiresIn: string;
    };
    bcrypt: {
      rounds: number;
    };
  };

  // Application
  app: {
    env: string;
    port: number;
    apiVersion: string;
    logLevel: string;
  };

  // Features
  features: {
    politicalContent: boolean;
    financialDisclaimers: boolean;
    contentCaching: boolean;
    userAnalytics: boolean;
    sentimentAnalysis: boolean;
    qualityFiltering: boolean;
  };

  // Content Quality
  quality: {
    threshold: number;
    minContentLength: number;
    maxContentLength: number;
    cacheTtl: number;
  };

  // Rate Limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };

  // Briefing Generation
  briefing: {
    maxCardsPerBriefing: number;
    minCardsPerBriefing: number;
    generationTimeout: number;
    personalizationWeight: number;
    qualityThreshold: number;
    politicalBalanceThreshold: number;
    minPoliticalSources: number;
    maxPoliticalBiasScore: number;
  };

  // Scheduler
  scheduler: {
    enabled: boolean;
    generationCron: string;
    cleanupCron: string;
    timezoneUtcOffset: number;
  };

  // Monitoring
  monitoring: {
    metricsEnabled: boolean;
    healthCheckEnabled: boolean;
    newrelic: {
      licenseKey?: string;
    };
    sentry: {
      dsn?: string;
    };
  };

  // Caching
  cache: {
    ttlShort: number;
    ttlMedium: number;
    ttlLong: number;
  };

  // Background Jobs
  jobs: {
    concurrency: number;
    attempts: number;
    backoffType: string;
    backoffDelay: number;
  };

  // API
  api: {
    timeout: number;
    retryAttempts: number;
    rateLimit: number;
  };

  // Content Sources Configuration
  sources: {
    crypto: boolean;
    news: boolean;
    aiTech: boolean;
    political: boolean;
  };

  // Political Neutrality
  political: {
    balanceThreshold: number;
    minSources: number;
    maxBiasScore: number;
  };

  // Financial Disclaimer
  financial: {
    riskLevel: 'low' | 'moderate' | 'high';
    includeDisclaimerPercent: number;
    disclaimerTypes: string[];
  };

  // Personalization
  personalization: {
    defaultInterestWeights: Record<string, number>;
    learningRate: number;
    minFeedbackSamples: number;
  };

  // Testing
  test: {
    databaseUrl?: string;
    mockExternalApis: boolean;
  };

  // Development
  dev: {
    enableSwagger: boolean;
    enableCors: boolean;
    corsOrigin: string;
  };
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${key} is not set`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value.toLowerCase() === 'true';
}

function getEnvArray(key: string, defaultValue: string[] = []): string[] {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function parseJsonEnv(key: string, defaultValue: any = {}): any {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Environment variable ${key} must be valid JSON`);
  }
}

export const config: Config = {
  database: {
    url: getEnvVar('DATABASE_URL'),
    host: getEnvVar('DB_HOST', 'localhost'),
    port: getEnvNumber('DB_PORT', 5432),
    username: getEnvVar('DB_USERNAME', 'postgres'),
    password: getEnvVar('DB_PASSWORD'),
    name: getEnvVar('DB_NAME', 'pulsedaily_briefing'),
    ssl: getEnvBoolean('DB_SSL', false),
    pool: {
      min: getEnvNumber('DB_POOL_MIN', 2),
      max: getEnvNumber('DB_POOL_MAX', 10),
    },
  },

  redis: {
    url: getEnvVar('REDIS_URL', 'redis://localhost:6379'),
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD,
    db: getEnvNumber('REDIS_DB', 0),
  },

  llm: {
    openai: {
      apiKey: getEnvVar('OPENAI_API_KEY'),
      model: getEnvVar('OPENAI_MODEL', 'gpt-4-turbo-preview'),
      maxTokens: getEnvNumber('OPENAI_MAX_TOKENS', 2000),
      temperature: getEnvNumber('OPENAI_TEMPERATURE', 0.3),
    },
    anthropic: {
      apiKey: getEnvVar('ANTHROPIC_API_KEY'),
      model: getEnvVar('ANTHROPIC_MODEL', 'claude-3-sonnet-20240229'),
      maxTokens: getEnvNumber('ANTHROPIC_MAX_TOKENS', 2000),
      temperature: getEnvNumber('ANTHROPIC_TEMPERATURE', 0.3),
    },
    google: {
      apiKey: getEnvVar('GOOGLE_AI_API_KEY', ''),
      model: getEnvVar('GOOGLE_AI_MODEL', 'gemini-pro'),
    },
  },

  contentSources: {
    coingecko: {
      apiKey: getEnvVar('COINGECKO_API_KEY', ''),
      baseUrl: getEnvVar('COINGECKO_BASE_URL', 'https://api.coingecko.com/api/v3'),
    },
    coinmarketcap: {
      apiKey: getEnvVar('COINMARKETCAP_API_KEY', ''),
      baseUrl: getEnvVar('COINMARKETCAP_BASE_URL', 'https://pro-api.coinmarketcap.com/v1'),
    },
    newsApi: {
      apiKey: getEnvVar('NEWS_API_ORG_KEY', ''),
      baseUrl: getEnvVar('NEWS_API_BASE_URL', 'https://newsapi.org/v2'),
    },
    alphaVantage: {
      apiKey: getEnvVar('ALPHAVANTAGE_API_KEY', ''),
      baseUrl: getEnvVar('ALPHAVANTAGE_BASE_URL', 'https://www.alphavantage.co/query'),
    },
    reddit: {
      clientId: getEnvVar('REDDIT_CLIENT_ID', ''),
      clientSecret: getEnvVar('REDDIT_CLIENT_SECRET', ''),
    },
    twitter: {
      bearerToken: getEnvVar('TWITTER_BEARER_TOKEN', ''),
    },
  },

  security: {
    jwt: {
      secret: getEnvVar('JWT_SECRET'),
      expiresIn: getEnvVar('JWT_EXPIRES_IN', '7d'),
    },
    bcrypt: {
      rounds: getEnvNumber('BCRYPT_ROUNDS', 12),
    },
  },

  app: {
    env: getEnvVar('NODE_ENV', 'development'),
    port: getEnvNumber('PORT', 3000),
    apiVersion: getEnvVar('API_VERSION', 'v1'),
    logLevel: getEnvVar('LOG_LEVEL', 'info'),
  },

  features: {
    politicalContent: getEnvBoolean('ENABLE_POLITICAL_CONTENT', true),
    financialDisclaimers: getEnvBoolean('ENABLE_FINANCIAL_DISCLAIMERS', true),
    contentCaching: getEnvBoolean('ENABLE_CONTENT_CACHING', true),
    userAnalytics: getEnvBoolean('ENABLE_USER_ANALYTICS', true),
    sentimentAnalysis: getEnvBoolean('ENABLE_SENTIMENT_ANALYSIS', true),
    qualityFiltering: getEnvBoolean('ENABLE_QUALITY_FILTERING', true),
  },

  quality: {
    threshold: getEnvNumber('QUALITY_THRESHOLD', 0.7),
    minContentLength: getEnvNumber('MIN_CONTENT_LENGTH', 100),
    maxContentLength: getEnvNumber('MAX_CONTENT_LENGTH', 2000),
    cacheTtl: getEnvNumber('CONTENT_CACHE_TTL', 3600),
  },

  rateLimit: {
    windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
    maxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  },

  briefing: {
    maxCardsPerBriefing: getEnvNumber('MAX_CARDS_PER_BRIEFING', 8),
    minCardsPerBriefing: getEnvNumber('MIN_CARDS_PER_BRIEFING', 5),
    generationTimeout: getEnvNumber('BRIEFING_GENERATION_TIMEOUT', 30000),
    personalizationWeight: getEnvNumber('PERSONALIZATION_WEIGHT', 0.7),
    qualityThreshold: getEnvNumber('QUALITY_THRESHOLD', 0.7),
    politicalBalanceThreshold: getEnvNumber('POLITICAL_BALANCE_THRESHOLD', 0.1),
    minPoliticalSources: getEnvNumber('MIN_POLITICAL_SOURCES', 3),
    maxPoliticalBiasScore: getEnvNumber('MAX_POLITICAL_BIAS_SCORE', 0.3),
  },

  scheduler: {
    enabled: getEnvBoolean('SCHEDULER_ENABLED', true),
    generationCron: getEnvVar('BRIEFING_GENERATION_CRON', '0 6 * * *'), // 6 AM daily
    cleanupCron: getEnvVar('CLEANUP_CRON', '0 2 * * *'), // 2 AM daily
    timezoneUtcOffset: getEnvNumber('TIMEZONE_UTC_OFFSET', 0),
  },

  monitoring: {
    metricsEnabled: getEnvBoolean('METRICS_ENABLED', true),
    healthCheckEnabled: getEnvBoolean('HEALTH_CHECK_ENABLED', true),
    newrelic: {
      licenseKey: process.env.NEW_RELIC_LICENSE_KEY,
    },
    sentry: {
      dsn: process.env.SENTRY_DSN,
    },
  },

  cache: {
    ttlShort: getEnvNumber('CACHE_TTL_SHORT', 300), // 5 minutes
    ttlMedium: getEnvNumber('CACHE_TTL_MEDIUM', 1800), // 30 minutes
    ttlLong: getEnvNumber('CACHE_TTL_LONG', 7200), // 2 hours
  },

  jobs: {
    concurrency: getEnvNumber('JOB_CONCURRENCY', 5),
    attempts: getEnvNumber('JOB_ATTEMPTS', 3),
    backoffType: getEnvVar('JOB_BACKOFF_TYPE', 'exponential'),
    backoffDelay: getEnvNumber('JOB_BACKOFF_DELAY', 2000),
  },

  api: {
    timeout: getEnvNumber('API_TIMEOUT', 30000),
    retryAttempts: getEnvNumber('API_RETRY_ATTEMPTS', 3),
    rateLimit: getEnvNumber('API_RATE_LIMIT', 1000),
  },

  sources: {
    crypto: getEnvBoolean('CRYPTO_SOURCES_ENABLED', true),
    news: getEnvBoolean('NEWS_SOURCES_ENABLED', true),
    aiTech: getEnvBoolean('AI_TECH_SOURCES_ENABLED', true),
    political: getEnvBoolean('POLITICAL_SOURCES_ENABLED', true),
  },

  political: {
    balanceThreshold: getEnvNumber('POLITICAL_BALANCE_THRESHOLD', 0.1),
    minSources: getEnvNumber('MIN_POLITICAL_SOURCES', 3),
    maxBiasScore: getEnvNumber('MAX_POLITICAL_BIAS_SCORE', 0.3),
  },

  financial: {
    riskLevel: getEnvVar('FINANCIAL_RISK_LEVEL', 'moderate') as 'low' | 'moderate' | 'high',
    includeDisclaimerPercent: getEnvNumber('INCLUDE_DISCLAIMER_PERCENT', 100),
    disclaimerTypes: getEnvArray('DISCLAIMER_TYPES', ['general', 'crypto', 'investment']),
  },

  personalization: {
    defaultInterestWeights: parseJsonEnv('DEFAULT_INTEREST_WEIGHTS', {
      crypto_market: 0.3,
      ai_tech: 0.3,
      political_narrative: 0.2,
      daily_focus: 0.1,
      wildcard: 0.1,
    }),
    learningRate: getEnvNumber('PERSONALIZATION_LEARNING_RATE', 0.1),
    minFeedbackSamples: getEnvNumber('MIN_FEEDBACK_SAMPLES', 5),
  },

  test: {
    databaseUrl: process.env.TEST_DATABASE_URL,
    mockExternalApis: getEnvBoolean('MOCK_EXTERNAL_APIS', false),
  },

  dev: {
    enableSwagger: getEnvBoolean('ENABLE_SWAGGER', true),
    enableCors: getEnvBoolean('ENABLE_CORS', true),
    corsOrigin: getEnvVar('CORS_ORIGIN', 'http://localhost:3000'),
  },
};

export default config;