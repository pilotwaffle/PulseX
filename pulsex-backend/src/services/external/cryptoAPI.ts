import axios, { AxiosInstance } from 'axios';
import { logger } from '../../config/logger';
import { redisClient } from '../../config/redis';
import { CryptoData, ExternalAPIResponse } from '../../types';
import { handleExternalAPIError } from '../../middleware/errorHandler';

export class CryptoAPIService {
  private client: AxiosInstance;
  private coingeckoClient: AxiosInstance;
  private alphaVantageClient: AxiosInstance;
  private cacheTTL: number = 300; // 5 minutes for crypto data

  constructor() {
    // CoinGecko client (free tier)
    this.coingeckoClient = axios.create({
      baseURL: 'https://api.coingecko.com/api/v3',
      timeout: 10000,
      headers: {
        'User-Agent': 'PulseX-Daily-Briefing/1.0',
      },
    });

    // Alpha Vantage client (if API key provided)
    this.alphaVantageClient = axios.create({
      baseURL: 'https://www.alphavantage.co/query',
      timeout: 10000,
      headers: {
        'User-Agent': 'PulseX-Daily-Briefing/1.0',
      },
    });

    // Setup interceptors for logging
    [this.coingeckoClient, this.alphaVantageClient].forEach((client, index) => {
      const serviceName = index === 0 ? 'CoinGecko' : 'Alpha Vantage';

      client.interceptors.request.use(
        (config) => {
          logger.debug(`${serviceName} API request`, { method: config.method, url: config.url });
          return config;
        },
        (error) => {
          logger.error(`${serviceName} API request error`, { error: error.message });
          return Promise.reject(error);
        }
      );

      client.interceptors.response.use(
        (response) => {
          logger.debug(`${serviceName} API response`, { status: response.status, url: response.config.url });
          return response;
        },
        (error) => {
          logger.error(`${serviceName} API response error`, {
            status: error.response?.status,
            url: error.config?.url,
            error: error.message,
          });
          return Promise.reject(handleExternalAPIError(error, serviceName));
        }
      );
    });
  }

  async getTopCryptocurrencies(limit: number = 50): Promise<ExternalAPIResponse<CryptoData[]>> {
    const cacheKey = `crypto:top:${limit}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached top cryptocurrencies', { limit });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const response = await this.coingeckoClient.get('/coins/markets', {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: limit,
          page: 1,
          sparkline: false,
        },
      });

      const cryptos: CryptoData[] = response.data.map((crypto: any) => ({
        id: crypto.id,
        symbol: crypto.symbol.toUpperCase(),
        name: crypto.name,
        price: crypto.current_price,
        priceChange24h: crypto.price_change_24h || 0,
        priceChangePercentage24h: crypto.price_change_percentage_24h || 0,
        marketCap: crypto.market_cap,
        volume24h: crypto.total_volume,
        lastUpdated: new Date(crypto.last_updated),
      }));

      // Cache the results
      await redisClient.set(cacheKey, JSON.stringify(cryptos), this.cacheTTL);

      return {
        data: cryptos,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch top cryptocurrencies', {
        limit,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getCryptocurrencyById(id: string): Promise<ExternalAPIResponse<CryptoData>> {
    const cacheKey = `crypto:byId:${id}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached cryptocurrency by ID', { id });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const response = await this.coingeckoClient.get(`/coins/${id}`, {
        params: {
          localization: false,
          tickers: false,
            market_data: true,
          community_data: false,
          developer_data: false,
          sparkline: false,
        },
      });

      const crypto = response.data;
      const cryptoData: CryptoData = {
        id: crypto.id,
        symbol: crypto.symbol.toUpperCase(),
        name: crypto.name,
        price: crypto.market_data?.current_price?.usd || 0,
        priceChange24h: crypto.market_data?.price_change_24h_in_currency?.usd || 0,
        priceChangePercentage24h: crypto.market_data?.price_change_percentage_24h || 0,
        marketCap: crypto.market_data?.market_cap?.usd || 0,
        volume24h: crypto.market_data?.total_volume?.usd || 0,
        lastUpdated: new Date(crypto.last_updated),
      };

      // Cache the result
      await redisClient.set(cacheKey, JSON.stringify(cryptoData), this.cacheTTL);

      return {
        data: cryptoData,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch cryptocurrency by ID', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getCryptocurrenciesBySymbols(symbols: string[]): Promise<ExternalAPIResponse<CryptoData[]>> {
    const symbolsKey = symbols.join(',').toLowerCase();
    const cacheKey = `crypto:bySymbols:${symbolsKey}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached cryptocurrencies by symbols', { symbols: symbolsKey });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const response = await this.coingeckoClient.get('/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: symbolsKey,
          order: 'market_cap_desc',
          per_page: 250,
          page: 1,
          sparkline: false,
        },
      });

      const cryptos: CryptoData[] = response.data.map((crypto: any) => ({
        id: crypto.id,
        symbol: crypto.symbol.toUpperCase(),
        name: crypto.name,
        price: crypto.current_price,
        priceChange24h: crypto.price_change_24h || 0,
        priceChangePercentage24h: crypto.price_change_percentage_24h || 0,
        marketCap: crypto.market_cap,
        volume24h: crypto.total_volume,
        lastUpdated: new Date(crypto.last_updated),
      }));

      // Cache the results
      await redisClient.set(cacheKey, JSON.stringify(cryptos), this.cacheTTL);

      return {
        data: cryptos,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch cryptocurrencies by symbols', {
        symbols: symbolsKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getMarketData(currency: string = 'usd'): Promise<ExternalAPIResponse<any>> {
    const cacheKey = `crypto:market:${currency}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached market data', { currency });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const response = await this.coingeckoClient.get('/global', {
        params: {
          vs_currency: currency,
        },
      });

      // Cache the results
      await redisClient.set(cacheKey, JSON.stringify(response.data), this.cacheTTL);

      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch market data', {
        currency,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getTrendingCryptocurrencies(): Promise<ExternalAPIResponse<any[]>> {
    const cacheKey = 'crypto:trending';

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached trending cryptocurrencies');
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const response = await this.coingeckoClient.get('/search/trending');

      // Cache the results
      await redisClient.set(cacheKey, JSON.stringify(response.data.coins), this.cacheTTL);

      return {
        data: response.data.coins,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch trending cryptocurrencies', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getCryptoNews(assets: string[] = [], time: string = '24h'): Promise<ExternalAPIResponse<any[]>> {
    const assetsKey = assets.join(',');
    const cacheKey = `crypto:news:${assetsKey}:${time}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached crypto news', { assets: assetsKey, time });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const response = await this.coingeckoClient.get('/news', {
        params: {
          assets: assetsKey,
          time,
        },
      });

      // Cache the results
      await redisClient.set(cacheKey, JSON.stringify(response.data.data), this.cacheTTL);

      return {
        data: response.data.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch crypto news', {
        assets: assetsKey,
        time,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.coingeckoClient.get('/ping');
      return true;
    } catch (error) {
      logger.error('Crypto API health check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  // Alpha Vantage integration for additional data (if API key is provided)
  async getAlphaVantageCryptoData(symbol: string): Promise<ExternalAPIResponse<any>> {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      throw new Error('Alpha Vantage API key not configured');
    }

    const cacheKey = `crypto:alphaVantage:${symbol}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached Alpha Vantage crypto data', { symbol });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const response = await this.alphaVantageClient.get('', {
        params: {
          function: 'CURRENCY_EXCHANGE_RATE',
          from_currency: symbol.toUpperCase(),
          to_currency: 'USD',
          apikey: apiKey,
        },
      });

      // Cache the results
      await redisClient.set(cacheKey, JSON.stringify(response.data), this.cacheTTL);

      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch Alpha Vantage crypto data', {
        symbol,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

export const cryptoAPIService = new CryptoAPIService();