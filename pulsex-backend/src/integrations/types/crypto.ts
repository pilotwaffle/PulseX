import { BaseApiResponse, IntegrationConfig, QualityMetrics } from './common';

// Crypto Provider Types
export type CryptoProvider = 'coingecko' | 'coinmarketcap' | 'binance' | 'coinbase';

export interface CryptoConfig extends IntegrationConfig {
  provider: CryptoProvider;
  symbols?: string[];
  currencies?: string[];
  marketCapThreshold?: number;
  volumeThreshold?: number;
  priceChangePeriod?: '1h' | '24h' | '7d' | '30d' | '90d' | '1y';
  includeNFT?: boolean;
  includeDeFi?: boolean;
}

// Asset Types
export interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  assetType: 'cryptocurrency' | 'token' | 'stablecoin' | 'defi_token' | 'nft';
  rank: number;
  marketCap: number;
  marketCapRank: number;
  totalSupply: number;
  circulatingSupply: number;
  maxSupply?: number;
  fullyDilutedValuation?: number;
  isActive: boolean;
  isoDate?: string;
  contracts?: {
    platform: string;
    contractAddress: string;
    decimalPlace?: number;
  }[];
  categories: CryptoCategory[];
  platforms: string[];
}

export type CryptoCategory =
  | 'cryptocurrency'
  | 'defi'
  | 'nft'
  | 'gaming'
  | 'metaverse'
  | 'layer_1'
  | 'layer_2'
  | 'dex'
  | 'cefi'
  | 'stablecoin'
  | 'meme_token'
  | 'privacy'
  | 'storage'
  | 'exchange_token'
  | 'prediction_market'
  | 'synthetic_asset'
  | 'lending_borrowing'
  | 'yield_farming'
  | 'insurance'
  | 'oracle'
  | 'staking'
  | 'governance'
  | 'cross_chain';

// Price Data Types
export interface PriceData {
  symbol: string;
  price: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  priceChange7d?: number;
  priceChangePercentage7d?: number;
  priceChange30d?: number;
  priceChangePercentage30d?: number;
  marketCap: number;
  marketCapRank: number;
  volume24h: number;
  volumeRank: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply?: number;
  fullyDilutedMarketCap?: number;
  lastUpdated: string;
  ath: {
    usd: number;
    usdDate: string;
    usdMarketCap?: number;
  };
  atl: {
    usd: number;
    usdDate: string;
  };
  roi?: {
    times: number;
    currency: string;
    percentage: number;
  };
}

export interface HistoricalPrice {
  timestamp: number;
  price: number;
  volume: number;
  marketCap: number;
}

export interface PriceChart {
  symbol: string;
  period: '1h' | '4h' | '1d' | '1w' | '1m' | '3m' | '6m' | '1y';
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  data: HistoricalPrice[];
  indicators: {
    ma7?: number[];
    ma30?: number[];
    ma90?: number[];
    rsi?: number[];
    macd?: {
      macd: number[];
      signal: number[];
      histogram: number[];
    };
    bollinger?: {
      upper: number[];
      middle: number[];
      lower: number[];
    };
  };
}

// Market Data Types
export interface MarketOverview {
  totalMarketCap: number;
  totalVolume24h: number;
  bitcoinDominance: number;
  ethereumDominance: number;
  defiMarketCap: number;
  defiVolume24h: number;
  stablecoinMarketCap: number;
  stablecoinVolume24h: number;
  nftMarketCap: number;
  nftVolume24h: number;
  activeCryptocurrencies: number;
  activeMarkets: number;
  lastUpdated: string;
}

export interface MarketTrend {
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1
  timeframe: '1h' | '24h' | '7d' | '30d' | '90d';
  indicators: {
    movingAverages: 'buy' | 'sell' | 'neutral';
    oscillators: 'buy' | 'sell' | 'neutral';
    pivots: 'buy' | 'sell' | 'neutral';
  };
  summary: string;
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
}

export interface TopMovers {
  topGainers: {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    changePercentage24h: number;
    volume24h: number;
    marketCap: number;
  }[];
  topLosers: {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    changePercentage24h: number;
    volume24h: number;
    marketCap: number;
  }[];
  topVolume: {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    changePercentage24h: number;
    volume24h: number;
    marketCap: number;
  }[];
  timeframe: '24h' | '7d' | '30d';
}

// DeFi Types
export interface DeFiProtocol {
  id: string;
  name: string;
  category: 'lending' | 'dex' | 'yield' | 'insurance' | 'aggregator' | 'bridge' | 'governance';
  chains: string[];
  tvl: number; // Total Value Locked
  tvlRank: number;
  marketCap?: number;
  volume24h?: number;
  revenue24h?: number;
  apy?: {
    min: number;
    max: number;
    average: number;
  };
  riskMetrics: {
    smartContractRisk: 'low' | 'medium' | 'high';
    liquidityRisk: 'low' | 'medium' | 'high';
    marketRisk: 'low' | 'medium' | 'high';
  };
  auditScore?: number;
  securityAudits: {
    auditor: string;
    date: string;
    score: number;
    reportUrl?: string;
  }[];
}

export interface YieldOpportunity {
  protocol: string;
  chain: string;
  token: string;
  apy: number;
  apr: number;
  tvl: number;
  riskLevel: 'low' | 'medium' | 'high';
  minimumDeposit?: number;
  lockPeriod?: number;
  autoCompounding: boolean;
  impermanentLossRisk: boolean;
  liquidityProvider: boolean;
  staking: boolean;
  farming: boolean;
}

// NFT Types
export interface NFTCollection {
  id: string;
  name: string;
  description?: string;
  contractAddress: string;
  chain: string;
  standards: ('ERC721' | 'ERC1155')[];
  floorPrice: number;
  floorPrice24hChange: number;
  volume24h: number;
  totalSupply: number;
  holders: number;
  marketCap: number;
  royalty?: number;
  verified: boolean;
  category: string;
  createdAt: string;
  items: NFTItem[];
}

export interface NFTItem {
  tokenId: string;
  collectionId: string;
  name?: string;
  description?: string;
  image: string;
  attributes: {
    trait_type: string;
    value: string | number;
    rarity: number;
  }[];
  owner?: string;
  price?: number;
  lastSale?: {
    price: number;
    timestamp: string;
    marketplace: string;
  };
  rarityScore: number;
}

// News and Analysis Types
export interface CryptoNews {
  id: string;
  title: string;
  content: string;
  summary?: string;
  url: string;
  source: string;
  author?: string;
  publishedAt: string;
  tags: string[];
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
    overall: 'positive' | 'negative' | 'neutral';
    confidence: number;
  };
  relevance: {
    currencies: string[];
    protocols: string[];
    topics: string[];
    score: number;
  };
  credibility: number;
  impactLevel: 'low' | 'medium' | 'high';
}

export interface TechnicalAnalysis {
  symbol: string;
  timeframe: string;
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  indicators: {
    trend: {
      direction: 'up' | 'down' | 'sideways';
      strength: number;
    };
    momentum: {
      rsi: number;
      macd: number;
      stoch: number;
    };
    volume: {
      profile: string;
      divergence: boolean;
    };
    support: number[];
    resistance: number[];
  };
  priceTargets: {
    shortTerm: number;
    mediumTerm: number;
    longTerm: number;
  };
  riskLevel: 'low' | 'medium' | 'high';
  lastUpdated: string;
}

// Request/Response Types
export interface CryptoSearchRequest {
  query?: string;
  symbols?: string[];
  categories?: CryptoCategory[];
  chains?: string[];
  marketCapMin?: number;
  marketCapMax?: number;
  volumeMin?: number;
  sortBy?: 'market_cap' | 'volume' | 'price' | 'change' | 'name';
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeNFT?: boolean;
  includeDeFi?: boolean;
}

export interface CryptoSearchResponse extends BaseApiResponse {
  totalResults: number;
  assets: CryptoAsset[];
  marketData: {
    totalMarketCap: number;
    totalVolume: number;
    btcDominance: number;
    averageChange24h: number;
  };
}

// Risk Assessment Types
export interface RiskAssessment {
  asset: CryptoAsset;
  overallRisk: 'low' | 'medium' | 'high' | 'very_high';
  riskScore: number; // 0-100
  factors: {
    volatility: number;
    liquidity: number;
    marketCap: number;
    smartContractRisk: number;
    regulatoryRisk: number;
    competitionRisk: number;
    adoptionRisk: number;
  };
  recommendations: string[];
  disclaimers: string[];
  lastUpdated: string;
}

// Portfolio Types
export interface CryptoPortfolio {
  id: string;
  userId: string;
  name: string;
  holdings: {
    symbol: string;
    quantity: number;
    averageBuyPrice: number;
    currentPrice: number;
    value: number;
    unrealizedPnL: number;
    unrealizedPnLPercentage: number;
  }[];
  totalValue: number;
  totalPnL: number;
  totalPnLPercentage: number;
  allocation: {
    symbol: string;
    percentage: number;
    value: number;
  }[];
  riskMetrics: {
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
    beta: number;
  };
  performance: {
    daily: number;
    weekly: number;
    monthly: number;
    yearly: number;
    allTime: number;
  };
  createdAt: string;
  updatedAt: string;
}

// Error Handling Types
export class CryptoProviderError extends Error {
  constructor(
    message: string,
    public provider: CryptoProvider,
    public code: string,
    public retryable: boolean = false,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'CryptoProviderError';
  }
}

export class CryptoDataNotFoundError extends CryptoProviderError {
  constructor(provider: CryptoProvider, public symbol: string) {
    super(
      `Data not found for ${symbol} on ${provider}`,
      provider,
      'DATA_NOT_FOUND',
      false,
      404
    );
    this.name = 'CryptoDataNotFoundError';
  }
}

export class CryptoRateLimitError extends CryptoProviderError {
  constructor(provider: CryptoProvider, public retryAfter?: number) {
    super(
      `Rate limit exceeded for ${provider}`,
      provider,
      'RATE_LIMIT_EXCEEDED',
      true,
      429
    );
    this.name = 'CryptoRateLimitError';
  }
}