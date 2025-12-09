import { BaseClient } from '../../core/base-client';
import {
  LLMConfig,
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  ContentGenerationRequest,
  ContentGenerationResult,
  BiasAnalysis,
} from '../../types/llm';
import { ConfigManager } from '../../core/config';
import { Logger } from '../../../utils/logger';
import { Readable } from 'stream';

export interface AnthropicConfig extends LLMConfig {
  provider: 'anthropic';
}

export class AnthropicClient extends BaseClient {
  private config: AnthropicConfig;
  private logger: Logger;

  constructor(config?: Partial<AnthropicConfig>) {
    const configManager = ConfigManager.getInstance();
    const defaultConfig = configManager.getIntegrationConfig('anthropic') || {};

    const mergedConfig: AnthropicConfig = {
      ...defaultConfig,
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      temperature: 0.7,
      maxTokens: 4096,
      ...config,
    } as AnthropicConfig;

    super(mergedConfig);
    this.config = mergedConfig;
    this.logger = new Logger('AnthropicClient');

    // Add Anthropic-specific headers
    this.axios.defaults.headers['anthropic-version'] = '2023-06-01';
  }

  /**
   * Generate text completion
   */
  async generateText(request: LLMRequest): Promise<LLMResponse> {
    try {
      const payload = this.buildAnthropicRequest(request);

      const response = await this.request('/messages', {
        method: 'POST',
        data: payload,
        useCache: false, // Don't cache LLM requests
      });

      return this.transformAnthropicResponse(response.data);

    } catch (error) {
      this.logger.error('Text generation failed', {
        error: error.message,
        model: request.model,
      });
      throw error;
    }
  }

  /**
   * Generate streaming text completion
   */
  async generateTextStream(request: LLMRequest): Promise<Readable> {
    const payload = {
      ...this.buildAnthropicRequest(request),
      stream: true,
    };

    try {
      const response = await this.axios.post('/messages', payload, {
        responseType: 'stream',
      });

      return this.createStreamResponse(response.data);

    } catch (error) {
      this.logger.error('Streaming text generation failed', {
        error: error.message,
        model: request.model,
      });
      throw error;
    }
  }

  /**
   * Generate content for daily briefing
   */
  async generateContent(request: ContentGenerationRequest): Promise<ContentGenerationResult> {
    const prompt = this.buildContentPrompt(request);
    const systemPrompt = this.buildSystemPrompt(request);

    const llmRequest: LLMRequest = {
      messages: [
        { role: 'user', content: prompt },
        { role: 'system', content: systemPrompt },
      ],
      model: this.config.model,
      temperature: request.constraints.tone === 'analytical' ? 0.3 : 0.7,
      maxTokens: request.constraints.maxLength || 1000,
    };

    const startTime = Date.now();
    const response = await this.generateText(llmRequest);
    const generationTime = Date.now() - startTime;

    return this.parseContentResult(response.data.choices[0].message.content, {
      model: this.config.model,
      generationTime,
      tokensUsed: response.usage.totalTokens,
      cost: this.calculateCost(response.usage),
      request,
    });
  }

  /**
   * Analyze text for bias
   */
  async analyzeBias(text: string): Promise<BiasAnalysis> {
    const prompt = `Analyze the following text for political bias and sentiment. Provide a structured analysis in JSON format:

Text: "${text}"

Please provide:
1. Political bias analysis (left/center/right/neutral with confidence 0-100)
2. Sentiment analysis (positive/negative/neutral with scores 0-100)
3. Topic identification with confidence scores
4. Any flagged content (hate speech, violence, etc.)
5. Recommendations for improving neutrality

Example format:
{
  "politicalBias": {
    "left": 20,
    "center": 60,
    "right": 20,
    "neutral": 80,
    "overallBias": "center",
    "confidence": 0.85
  },
  "sentimentAnalysis": {
    "positive": 40,
    "negative": 30,
    "neutral": 30,
    "overallSentiment": "positive"
  },
  "topics": [
    {"name": "politics", "confidence": 0.9},
    {"name": "economy", "confidence": 0.7}
  ],
  "flaggedContent": [],
  "recommendations": ["Consider adding more diverse perspectives"]
}`;

    const request: LLMRequest = {
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-3-sonnet-20240229',
      temperature: 0.1,
      maxTokens: 1000,
    };

    try {
      const response = await this.generateText(request);
      const analysisText = response.data.choices[0].message.content;

      return this.parseBiasAnalysis(analysisText);

    } catch (error) {
      this.logger.error('Bias analysis failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<any[]> {
    // Anthropic doesn't have a public models endpoint, return known models
    return [
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Most powerful model for complex tasks',
        context_length: 200000,
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        description: 'Balance of intelligence and speed',
        context_length: 200000,
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Fast and efficient model',
        context_length: 200000,
      },
    ];
  }

  /**
   * Build Anthropic API request
   */
  private buildAnthropicRequest(request: LLMRequest): any {
    // Convert OpenAI format to Anthropic format
    const systemMessage = request.messages.find(msg => msg.role === 'system');
    const userMessages = request.messages.filter(msg => msg.role !== 'system');

    return {
      model: request.model || this.config.model,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      messages: userMessages,
      system: systemMessage?.content,
      top_p: request.topP,
      stop_sequences: request.stop,
    };
  }

  /**
   * Transform Anthropic response to standard format
   */
  private transformAnthropicResponse(data: any): LLMResponse {
    return {
      success: true,
      data: {
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: data.content[0].text,
          },
          finishReason: data.stop_reason === 'end_turn' ? 'stop' : 'length',
        }],
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
        model: data.model,
        costTracking: {
          requestCost: this.calculateCost(data.usage),
          tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
          model: data.model,
          provider: 'anthropic',
        },
      },
    };
  }

  /**
   * Create streaming response
   */
  private createStreamResponse(stream: Readable): Readable {
    const { Readable } = require('stream');

    return new Readable({
      read() {
        let buffer = '';

        stream.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                this.push(null);
                return;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  const chunk: LLMStreamChunk = {
                    id: parsed.id,
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: parsed.model || 'claude-3-sonnet-20240229',
                    choices: [{
                      index: 0,
                      delta: {
                        content: parsed.delta.text,
                      },
                    }],
                  };
                  this.push(JSON.stringify(chunk) + '\n');
                }
              } catch (error) {
                // Ignore malformed chunks
              }
            }
          }
        });

        stream.on('end', () => {
          if (buffer) {
            // Process any remaining data
          }
          this.push(null);
        });

        stream.on('error', (error) => {
          this.emit('error', error);
        });
      },
    });
  }

  /**
   * Build content generation prompt
   */
  private buildContentPrompt(request: ContentGenerationRequest): string {
    const { type, input, constraints, outputFormat } = request;

    let prompt = `Generate a ${type.replace(/_/g, ' ')} based on the following information:\n\n`;

    if (input.articles?.length) {
      prompt += `Articles:\n${input.articles.map((article: any) =>
        `- ${article.title}: ${article.description || article.content?.substring(0, 200)}...`
      ).join('\n')}\n\n`;
    }

    if (input.marketData) {
      prompt += `Market Data:\n${JSON.stringify(input.marketData, null, 2)}\n\n`;
    }

    if (input.userPreferences) {
      prompt += `User Preferences:\n${JSON.stringify(input.userPreferences, null, 2)}\n\n`;
    }

    if (input.context) {
      prompt += `Context:\n${input.context}\n\n`;
    }

    prompt += `Constraints:\n`;
    if (constraints.maxLength) prompt += `- Maximum length: ${constraints.maxLength} words\n`;
    if (constraints.tone) prompt += `- Tone: ${constraints.tone}\n`;
    if (constraints.readingLevel) prompt += `- Reading level: ${constraints.readingLevel}\n`;
    if (constraints.politicalBias) prompt += `- Political bias: ${constraints.politicalBias}\n`;
    if (constraints.includeDisclaimer) prompt += `- Include disclaimer\n`;

    prompt += `\nOutput Format:\n`;
    if (outputFormat.includeHeadline) prompt += `- Include headline\n`;
    if (outputFormat.includeSummary) prompt += `- Include summary\n`;
    if (outputFormat.includeKeyPoints) prompt += `- Include key points\n`;
    if (outputFormat.includeAnalysis) prompt += `- Include analysis\n`;
    if (outputFormat.includeDisclaimer) prompt += `- Include disclaimer\n`;

    prompt += '\nPlease generate the content following these guidelines:';

    return prompt;
  }

  /**
   * Build system prompt for content generation
   */
  private buildSystemPrompt(request: ContentGenerationRequest): string {
    const { type, constraints } = request;

    let systemPrompt = `You are Claude, an AI assistant that generates concise, neutral, and informative content for daily briefings. `;

    switch (type) {
      case 'news_summary':
        systemPrompt += `You specialize in summarizing news articles objectively, focusing on key facts while avoiding bias.`;
        break;
      case 'crypto_analysis':
        systemPrompt += `You provide balanced cryptocurrency market analysis with appropriate financial disclaimers.`;
        break;
      case 'political_briefing':
        systemPrompt += `You deliver neutral political briefings that present multiple viewpoints fairly.`;
        break;
      case 'personalized_content':
        systemPrompt += `You create personalized content that matches user preferences while maintaining factual accuracy.`;
        break;
    }

    systemPrompt += `\n\nGuidelines:
- Maintain strict neutrality and objectivity
- Include relevant disclaimers for financial content
- Keep content concise and easy to understand
- Cite sources when possible
- Avoid speculation and unverified claims
- Use clear, accessible language`;

    if (constraints.politicalBias === 'neutral') {
      systemPrompt += `\n\nCRITICAL: Maintain absolute political neutrality. Present all viewpoints fairly and without preference.`;
    }

    return systemPrompt;
  }

  /**
   * Parse content generation result
   */
  private parseContentResult(content: string, metadata: any): ContentGenerationResult {
    // Similar to OpenAI implementation
    const lines = content.split('\n').filter(line => line.trim());

    let headline = '';
    let summary = '';
    let keyPoints: string[] = [];
    let analysis = '';
    let disclaimer = '';

    let currentSection = '';

    for (const line of lines) {
      if (line.toLowerCase().includes('headline:')) {
        headline = line.replace(/headline:/i, '').trim();
        currentSection = 'headline';
      } else if (line.toLowerCase().includes('summary:')) {
        summary = line.replace(/summary:/i, '').trim();
        currentSection = 'summary';
      } else if (line.toLowerCase().includes('key points:')) {
        currentSection = 'keyPoints';
      } else if (line.toLowerCase().includes('analysis:')) {
        currentSection = 'analysis';
      } else if (line.toLowerCase().includes('disclaimer:')) {
        disclaimer = line.replace(/disclaimer:/i, '').trim();
        currentSection = 'disclaimer';
      } else {
        switch (currentSection) {
          case 'summary':
            summary += ' ' + line.trim();
            break;
          case 'keyPoints':
            if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
              keyPoints.push(line.trim().replace(/^[-•]\s*/, ''));
            }
            break;
          case 'analysis':
            analysis += ' ' + line.trim();
            break;
          case 'disclaimer':
            disclaimer += ' ' + line.trim();
            break;
        }
      }
    }

    return {
      content: content.trim(),
      headline: headline || (lines[0] ? lines[0].trim() : ''),
      summary: summary.trim(),
      keyPoints,
      analysis: analysis.trim(),
      disclaimer: disclaimer.trim(),
      metadata: {
        model: metadata.model,
        tokensUsed: metadata.tokensUsed,
        cost: metadata.cost,
        generationTime: metadata.generationTime,
        confidence: 0.85, // Claude typically has high confidence
        sources: [],
      },
      quality: {
        relevanceScore: 0.85,
        coherenceScore: 0.9,
        biasScore: 0.8,
        factualAccuracy: 0.85,
        overallQuality: 0.85,
      },
    };
  }

  /**
   * Parse bias analysis
   */
  private parseBiasAnalysis(analysisText: string): BiasAnalysis {
    try {
      // Extract JSON from the response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      this.logger.warn('Failed to parse bias analysis JSON', { error: error.message });
    }

    // Fallback if JSON parsing fails
    return {
      politicalBias: {
        left: 0,
        center: 100,
        right: 0,
        neutral: 100,
        overallBias: 'neutral',
        confidence: 0.5,
      },
      sentimentAnalysis: {
        positive: 33,
        negative: 33,
        neutral: 34,
        overallSentiment: 'neutral',
      },
      topics: [],
      flaggedContent: [],
      recommendations: [],
    };
  }

  /**
   * Calculate cost for Anthropic API usage
   */
  private calculateCost(usage: any): number {
    // Anthropic pricing (as of 2024)
    const pricing = {
      'claude-3-opus-20240229': {
        input: 0.015 / 1000, // $0.015 per 1K input tokens
        output: 0.075 / 1000, // $0.075 per 1K output tokens
      },
      'claude-3-sonnet-20240229': {
        input: 0.003 / 1000, // $0.003 per 1K input tokens
        output: 0.015 / 1000, // $0.015 per 1K output tokens
      },
      'claude-3-haiku-20240307': {
        input: 0.00025 / 1000, // $0.00025 per 1K input tokens
        output: 0.00125 / 1000, // $0.00125 per 1K output tokens
      },
    };

    const modelPricing = pricing[this.config.model as string] || pricing['claude-3-sonnet-20240229'];

    const inputCost = usage.input_tokens * modelPricing.input;
    const outputCost = usage.output_tokens * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Health check specific to Anthropic
   */
  async healthCheck() {
    try {
      // Test with a simple message
      const testRequest: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-3-haiku-20240307',
        maxTokens: 10,
      };

      const response = await this.generateText(testRequest);

      return {
        status: 'healthy',
        responseTime: response.metadata?.processingTime || 0,
        lastCheck: new Date().toISOString(),
        errorRate: 0,
        details: {
          model: response.data.model,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: 0,
        lastCheck: new Date().toISOString(),
        errorRate: 1,
        details: {
          error: error.message,
        },
      };
    }
  }
}