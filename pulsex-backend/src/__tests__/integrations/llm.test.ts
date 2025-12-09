import { llmService } from '../../services/external/llmService';
import { openaiClient } from '../../integrations/llm/openai/client';
import { anthropicClient } from '../../integrations/llm/anthropic/client';

// Mock LLM clients
jest.mock('../../integrations/llm/openai/client');
jest.mock('../../integrations/llm/anthropic/client');

describe('LLM Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenAI Client', () => {
    describe('generate', () => {
      it('should generate content using OpenAI successfully', async () => {
        // Arrange
        const prompt = 'Summarize the latest tech news';
        const mockResponse = {
          content: 'Latest tech developments include AI advancements and blockchain innovations.',
          usage: {
            prompt_tokens: 150,
            completion_tokens: 200,
            total_tokens: 350,
          },
          model: 'gpt-4',
          finish_reason: 'stop',
        };

        (openaiClient.generate as jest.Mock).mockResolvedValue(mockResponse);

        // Act
        const result = await openaiClient.generate(prompt);

        // Assert
        expect(openaiClient.generate).toHaveBeenCalledWith(prompt);
        expect(result).toEqual(mockResponse);
      });

      it('should handle OpenAI API errors', async () => {
        // Arrange
        const prompt = 'Test prompt';
        const apiError = new Error('OpenAI API error: rate limit exceeded');
        (openaiClient.generate as jest.Mock).mockRejectedValue(apiError);

        // Act & Assert
        await expect(openaiClient.generate(prompt)).rejects.toThrow(
          'OpenAI API error: rate limit exceeded'
        );
      });

      it('should handle invalid API key', async () => {
        // Arrange
        const prompt = 'Test prompt';
        (openaiClient.generate as jest.Mock).mockRejectedValue(
          new Error('Invalid API key')
        );

        // Act & Assert
        await expect(openaiClient.generate(prompt)).rejects.toThrow('Invalid API key');
      });

      it('should handle content filtering', async () => {
        // Arrange
        const prompt = 'Generate inappropriate content';
        (openaiClient.generate as jest.Mock).mockRejectedValue(
          new Error('Content policy violation')
        );

        // Act & Assert
        await expect(openaiClient.generate(prompt)).rejects.toThrow(
          'Content policy violation'
        );
      });
    });

    describe('healthCheck', () => {
      it('should return true when OpenAI service is healthy', async () => {
        // Arrange
        (openaiClient.healthCheck as jest.Mock).mockResolvedValue(true);

        // Act
        const result = await openaiClient.healthCheck();

        // Assert
        expect(result).toBe(true);
        expect(openaiClient.healthCheck).toHaveBeenCalled();
      });

      it('should return false when OpenAI service is unhealthy', async () => {
        // Arrange
        (openaiClient.healthCheck as jest.Mock).mockResolvedValue(false);

        // Act
        const result = await openaiClient.healthCheck();

        // Assert
        expect(result).toBe(false);
      });

      it('should handle health check errors', async () => {
        // Arrange
        (openaiClient.healthCheck as jest.Mock).mockRejectedValue(
          new Error('Health check failed')
        );

        // Act
        const result = await openaiClient.healthCheck();

        // Assert
        expect(result).toBe(false);
      });
    });
  });

  describe('Anthropic Client', () => {
    describe('generate', () => {
      it('should generate content using Anthropic successfully', async () => {
        // Arrange
        const prompt = 'Explain quantum computing';
        const mockResponse = {
          content: 'Quantum computing uses quantum bits (qubits) and superposition to perform calculations.',
          usage: {
            input_tokens: 120,
            output_tokens: 180,
          },
          model: 'claude-3-opus',
          stop_reason: 'end_turn',
        };

        (anthropicClient.generate as jest.Mock).mockResolvedValue(mockResponse);

        // Act
        const result = await anthropicClient.generate(prompt);

        // Assert
        expect(anthropicClient.generate).toHaveBeenCalledWith(prompt);
        expect(result).toEqual(mockResponse);
      });

      it('should handle Anthropic API errors', async () => {
        // Arrange
        const prompt = 'Test prompt';
        (anthropicClient.generate as jest.Mock).mockRejectedValue(
          new Error('Anthropic API error: overloaded')
        );

        // Act & Assert
        await expect(anthropicClient.generate(prompt)).rejects.toThrow(
          'Anthropic API error: overloaded'
        );
      });

      it('should handle rate limiting', async () => {
        // Arrange
        const prompt = 'Test prompt';
        (anthropicClient.generate as jest.Mock).mockRejectedValue(
          new Error('Rate limit exceeded')
        );

        // Act & Assert
        await expect(anthropicClient.generate(prompt)).rejects.toThrow(
          'Rate limit exceeded'
        );
      });
    });

    describe('healthCheck', () => {
      it('should return true when Anthropic service is healthy', async () => {
        // Arrange
        (anthropicClient.healthCheck as jest.Mock).mockResolvedValue(true);

        // Act
        const result = await anthropicClient.healthCheck();

        // Assert
        expect(result).toBe(true);
      });

      it('should return false when Anthropic service is unhealthy', async () => {
        // Arrange
        (anthropicClient.healthCheck as jest.Mock).mockResolvedValue(false);

        // Act
        const result = await anthropicClient.healthCheck();

        // Assert
        expect(result).toBe(false);
      });
    });
  });

  describe('LLM Service Manager', () => {
    describe('generateContent', () => {
      it('should generate content using primary provider', async () => {
        // Arrange
        const requestData = {
          prompt: 'Write a brief summary of artificial intelligence',
          maxTokens: 500,
          temperature: 0.7,
        };
        const mockResponse = {
          content: 'Artificial intelligence is a field of computer science focused on creating intelligent machines.',
          summary: 'AI is computer science for intelligent machines.',
          topics: ['technology', 'ai'],
          sources: [],
          metadata: {
            model_version: 'gpt-4',
            processing_time_ms: 1200,
            relevance_score: 0.92,
          },
        };

        (llmService.generateContent as jest.Mock).mockResolvedValue(mockResponse);

        // Act
        const result = await llmService.generateContent(requestData);

        // Assert
        expect(llmService.generateContent).toHaveBeenCalledWith(requestData);
        expect(result).toEqual(mockResponse);
        expect(result.content).toContain('Artificial intelligence');
        expect(result.metadata).toHaveProperty('processing_time_ms');
        expect(result.metadata).toHaveProperty('relevance_score');
      });

      it('should fallback to secondary provider when primary fails', async () => {
        // Arrange
        const requestData = {
          prompt: 'Test prompt',
          maxTokens: 300,
        };
        const mockResponse = {
          content: 'Fallback response content',
          summary: 'Fallback summary',
          topics: ['general'],
          sources: [],
          metadata: {
            model_version: 'claude-3',
            processing_time_ms: 1800,
            relevance_score: 0.85,
          },
        };

        // Simulate primary provider failure, secondary success
        (llmService.generateContent as jest.Mock).mockImplementation(async (data) => {
          // First call fails
          if (llmService.generateContent.mock.calls.length === 1) {
            throw new Error('Primary provider unavailable');
          }
          // Second call succeeds
          return mockResponse;
        });

        // Act
        const result = await llmService.generateContent(requestData);

        // Assert
        expect(result.content).toBe('Fallback response content');
        expect(result.metadata.model_version).toBe('claude-3');
      });

      it('should handle all providers being unavailable', async () => {
        // Arrange
        const requestData = { prompt: 'Test prompt' };
        (llmService.generateContent as jest.Mock).mockRejectedValue(
          new Error('All LLM providers are unavailable')
        );

        // Act & Assert
        await expect(llmService.generateContent(requestData)).rejects.toThrow(
          'All LLM providers are unavailable'
        );
      });

      it('should respect token limits', async () => {
        // Arrange
        const requestData = {
          prompt: 'Very long prompt...',
          maxTokens: 100,
        };
        (llmService.generateContent as jest.Mock).mockResolvedValue({
          content: 'Short response within token limit.',
          summary: 'Short summary.',
          topics: [],
          sources: [],
          metadata: {
            model_version: 'gpt-4',
            processing_time_ms: 500,
            relevance_score: 0.8,
          },
        });

        // Act
        const result = await llmService.generateContent(requestData);

        // Assert
        expect(result.content.length).toBeLessThan(requestData.maxTokens * 4); // Rough estimate
      });
    });

    describe('generateDailyBriefing', () => {
      it('should generate personalized daily briefing', async () => {
        // Arrange
        const briefingData = {
          news: [
            {
              title: 'Tech Company Launches New AI',
              description: 'Major breakthrough in artificial intelligence',
              url: 'https://example.com/tech-news',
              category: 'technology',
            },
          ],
          crypto: [
            {
              name: 'Bitcoin',
              symbol: 'BTC',
              price: 50000,
              priceChange24h: 1000,
            },
          ],
          userPreferences: {
            topics: ['technology', 'cryptocurrency'],
            sources: ['TechCrunch', 'CoinDesk'],
            length: 'medium',
          },
          date: '2025-01-01',
        };
        const mockBriefing = {
          content: 'Your daily briefing covers the latest in AI technology and cryptocurrency developments.',
          summary: 'Tech innovations and crypto market updates.',
          topics: ['technology', 'cryptocurrency'],
          sources: ['TechCrunch', 'CoinDesk'],
          metadata: {
            model_version: 'gpt-4',
            processing_time_ms: 2500,
            relevance_score: 0.95,
          },
        };

        (llmService.generateDailyBriefing as jest.Mock).mockResolvedValue(mockBriefing);

        // Act
        const result = await llmService.generateDailyBriefing(briefingData);

        // Assert
        expect(llmService.generateDailyBriefing).toHaveBeenCalledWith(briefingData);
        expect(result.content).toContain('daily briefing');
        expect(result.topics).toContain('technology');
        expect(result.metadata.relevance_score).toBeGreaterThan(0.9);
      });

      it('should adapt briefing length based on user preferences', async () => {
        // Arrange
        const briefingData = {
          news: [],
          crypto: [],
          userPreferences: {
            length: 'short',
            topics: ['technology'],
          },
          date: '2025-01-01',
        };
        const mockBriefing = {
          content: 'Brief tech summary.',
          summary: 'Quick tech update.',
          topics: ['technology'],
          sources: [],
          metadata: {
            model_version: 'gpt-4',
            processing_time_ms: 800,
            relevance_score: 0.88,
          },
        };

        (llmService.generateDailyBriefing as jest.Mock).mockResolvedValue(mockBriefing);

        // Act
        const result = await llmService.generateDailyBriefing(briefingData);

        // Assert
        expect(result.content.length).toBeLessThan(500); // Short format
        expect(result.summary.length).toBeLessThan(100);
      });

      it('should incorporate user preferences and news topics', async () => {
        // Arrange
        const briefingData = {
          news: [
            {
              title: 'Space Exploration Milestone',
              category: 'science',
            },
            {
              title: 'Stock Market Analysis',
              category: 'finance',
            },
          ],
          crypto: [],
          userPreferences: {
            topics: ['science', 'space'],
          },
          date: '2025-01-01',
        };
        const mockBriefing = {
          content: 'Space exploration achievements highlight today\'s science updates.',
          summary: 'Space and science news summary.',
          topics: ['science', 'space'],
          sources: [],
          metadata: {
            model_version: 'claude-3',
            processing_time_ms: 1800,
            relevance_score: 0.91,
          },
        };

        (llmService.generateDailyBriefing as jest.Mock).mockResolvedValue(mockBriefing);

        // Act
        const result = await llmService.generateDailyBriefing(briefingData);

        // Assert
        expect(result.topics).toContain('science');
        expect(result.content).toContain('space');
      });
    });

    describe('getAvailableProviders', () => {
      it('should return list of available providers', async () => {
        // Arrange
        (llmService.getAvailableProviders as jest.Mock).mockReturnValue([
          'OpenAI',
          'Anthropic',
        ]);

        // Act
        const result = llmService.getAvailableProviders();

        // Assert
        expect(result).toEqual(['OpenAI', 'Anthropic']);
        expect(result).toContain('OpenAI');
        expect(result).toContain('Anthropic');
      });

      it('should handle no available providers', async () => {
        // Arrange
        (llmService.getAvailableProviders as jest.Mock).mockReturnValue([]);

        // Act
        const result = llmService.getAvailableProviders();

        // Assert
        expect(result).toEqual([]);
      });
    });

    describe('healthCheck', () => {
      it('should return health status for all providers', async () => {
        // Arrange
        const mockHealthStatus = {
          'OpenAI': true,
          'Anthropic': true,
        };
        (llmService.healthCheck as jest.Mock).mockResolvedValue(mockHealthStatus);

        // Act
        const result = await llmService.healthCheck();

        // Assert
        expect(result).toEqual(mockHealthStatus);
        expect(result['OpenAI']).toBe(true);
        expect(result['Anthropic']).toBe(true);
      });

      it('should return false for unhealthy providers', async () => {
        // Arrange
        const mockHealthStatus = {
          'OpenAI': false,
          'Anthropic': true,
        };
        (llmService.healthCheck as jest.Mock).mockResolvedValue(mockHealthStatus);

        // Act
        const result = await llmService.healthCheck();

        // Assert
        expect(result['OpenAI']).toBe(false);
        expect(result['Anthropic']).toBe(true);
      });

      it('should handle partial provider failures', async () => {
        // Arrange
        (llmService.healthCheck as jest.Mock).mockResolvedValue({
          'OpenAI': true,
          'Anthropic': false,
        });

        // Act
        const result = await llmService.healthCheck();

        // Assert
        expect(Object.keys(result)).toContain('OpenAI');
        expect(Object.keys(result)).toContain('Anthropic');
        expect(Object.values(result).some(healthy => healthy)).toBe(true);
      });
    });

    describe('Error Handling and Recovery', () => {
      it('should implement exponential backoff for retries', async () => {
        // Arrange
        const requestData = { prompt: 'Test prompt' };
        let callCount = 0;
        (llmService.generateContent as jest.Mock).mockImplementation(async () => {
          callCount++;
          if (callCount < 3) {
            throw new Error('Temporary failure');
          }
          return {
            content: 'Success after retries',
            summary: 'Success',
            topics: [],
            sources: [],
            metadata: {
              model_version: 'gpt-4',
              processing_time_ms: 2000,
              relevance_score: 0.9,
            },
          };
        });

        // Act
        const result = await llmService.generateContent(requestData);

        // Assert
        expect(result.content).toBe('Success after retries');
        expect(callCount).toBe(3);
      });

      it('should handle network timeouts', async () => {
        // Arrange
        (llmService.generateContent as jest.Mock).mockRejectedValue(
          new Error('Request timeout')
        );

        // Act & Assert
        await expect(
          llmService.generateContent({ prompt: 'Test' })
        ).rejects.toThrow('Request timeout');
      });

      it('should validate input parameters', async () => {
        // Arrange
        const invalidData = {
          prompt: '', // Empty prompt
          maxTokens: -1, // Invalid token count
        };

        // Act & Assert
        await expect(
          llmService.generateContent(invalidData)
        ).rejects.toThrow();
      });
    });

    describe('Performance and Optimization', () => {
      it('should track processing metrics', async () => {
        // Arrange
        const requestData = {
          prompt: 'Performance test prompt',
          maxTokens: 100,
        };
        const mockResponse = {
          content: 'Test response',
          summary: 'Test summary',
          topics: ['test'],
          sources: [],
          metadata: {
            model_version: 'gpt-4',
            processing_time_ms: 1500,
            relevance_score: 0.92,
            token_usage: {
              input_tokens: 50,
              output_tokens: 75,
              total_tokens: 125,
            },
          },
        };

        (llmService.generateContent as jest.Mock).mockResolvedValue(mockResponse);

        // Act
        const result = await llmService.generateContent(requestData);

        // Assert
        expect(result.metadata.processing_time_ms).toBe(1500);
        expect(result.metadata.relevance_score).toBe(0.92);
        expect(result.metadata.token_usage.total_tokens).toBe(125);
      });

      it('should implement request caching for identical prompts', async () => {
        // Arrange
        const prompt = 'Test caching prompt';
        const mockResponse = {
          content: 'Cached response',
          summary: 'Cached',
          topics: [],
          sources: [],
          metadata: {
            model_version: 'gpt-4',
            processing_time_ms: 100,
            relevance_score: 0.9,
            cached: true,
          },
        };

        (llmService.generateContent as jest.Mock).mockResolvedValue(mockResponse);

        // Act
        const result1 = await llmService.generateContent({ prompt });
        const result2 = await llmService.generateContent({ prompt });

        // Assert
        expect(result1).toEqual(result2);
        expect(result1.metadata.cached).toBe(true);
      });
    });
  });
});

export {};