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
  LoadBalancingConfig,
} from '../../types/llm';
import { ConfigManager } from '../../core/config';
import { Logger } from '../../../utils/logger';
import { Readable } from 'stream';

export interface OpenAIConfig extends LLMConfig {
  provider: 'openai';
  organizationId?: string;
  project?: string;
}

export class OpenAIClient extends BaseClient {
  private config: OpenAIConfig;
  private logger: Logger;

  constructor(config?: Partial<OpenAIConfig>) {
    const configManager = ConfigManager.getInstance();
    const defaultConfig = configManager.getIntegrationConfig('openai') || {};

    const mergedConfig: OpenAIConfig = {
      ...defaultConfig,
      provider: 'openai',
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      ...config,
    } as OpenAIConfig;

    super(mergedConfig);
    this.config = mergedConfig;
    this.logger = new Logger('OpenAIClient');

    // Add OpenAI-specific headers
    if (this.config.organizationId) {
      this.axios.defaults.headers['OpenAI-Organization'] = this.config.organizationId;
    }
    if (this.config.project) {
      this.axios.defaults.headers['OpenAI-Project'] = this.config.project;
    }
  }

  /**
   * Generate text completion
   */
  async generateText(request: LLMRequest): Promise<LLMResponse> {
    try {
      const payload = this.buildOpenAIRequest(request);

      const response = await this.request('/chat/completions', {
        method: 'POST',
        data: payload,
        useCache: false, // Don't cache LLM requests
      });

      return this.transformOpenAIResponse(response.data);

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
      ...this.buildOpenAIRequest(request),
      stream: true,
    };

    try {
      const response = await this.axios.post('/chat/completions', payload, {
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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
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
    const prompt = `
Analyze the following text for political bias and sentiment. Provide a structured analysis:

Text: "${text}"

Please provide:
1. Political bias analysis (left/center/right/neutral with confidence)
2. Sentiment analysis (positive/negative/neutral with scores)
3. Topic identification with confidence scores
4. Any flagged content (hate speech, violence, etc.)
5. Recommendations for improving neutrality

Respond in JSON format.
`;

    const request: LLMRequest = {
      messages: [
        {
          role: 'system',
          content: 'You are a neutral content analyst. Analyze text for bias and provide objective, structured feedback.',
        },
        { role: 'user', content: prompt },
      ],
      model: 'gpt-4-turbo-preview',
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
    try {
      const response = await this.request('/models');
      return response.data.data;

    } catch (error) {
      this.logger.error('Failed to fetch models', { error: error.message });
      throw error;
    }
  }

  /**
   * Build OpenAI API request
   */
  private buildOpenAIRequest(request: LLMRequest): any {
    return {
      model: request.model || this.config.model,
      messages: request.messages,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      top_p: request.topP ?? this.config.topP,
      frequency_penalty: request.frequencyPenalty ?? this.config.frequencyPenalty,
      presence_penalty: request.presencePenalty ?? this.config.presencePenalty,
      stop: request.stop,
      stream: request.stream || false,
    };
  }

  /**
   * Transform OpenAI response to standard format
   */
  private transformOpenAIResponse(data: any): LLMResponse {
    const choice = data.choices[0];
    const usage = data.usage;

    return {
      success: true,
      data: {
        choices: [{
          index: choice.index,
          message: {
            role: choice.message.role,
            content: choice.message.content,
          },
          finishReason: choice.finish_reason,
        }],
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        model: data.model,
        costTracking: {
          requestCost: this.calculateCost(usage),
          tokensUsed: usage.total_tokens,
          model: data.model,
          provider: 'openai',
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
        stream.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                this.push(null);
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const chunk: LLMStreamChunk = {
                  id: parsed.id,
                  object: parsed.object,
                  created: parsed.created,
                  model: parsed.model,
                  choices: parsed.choices.map((choice: any) => ({
                    index: choice.index,
                    delta: choice.delta,
                    finishReason: choice.finish_reason,
                  })),
                };
                this.push(JSON.stringify(chunk) + '\n');
              } catch (error) {
                // Ignore malformed chunks
              }
            }
          }
        });

        stream.on('end', () => {
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

    prompt += '\nPlease generate the content:';

    return prompt;
  }

  /**
   * Build system prompt for content generation
   */
  private buildSystemPrompt(request: ContentGenerationRequest): string {
    const { type, constraints } = request;

    let systemPrompt = `You are PulseX, an AI assistant that generates concise, neutral, and informative content for daily briefings. `;

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
    // Simple parsing - in production, you'd use more sophisticated parsing
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
        confidence: 0.8, // Placeholder - would calculate based on various factors
        sources: [], // Would extract from original articles
      },
      quality: {
        relevanceScore: 0.8, // Placeholder - would calculate based on user preferences
        coherenceScore: 0.9, // Placeholder - would calculate using various metrics
        biasScore: 0.7, // Placeholder - would calculate using bias analysis
        factualAccuracy: 0.8, // Placeholder - would calculate using fact checking
        overallQuality: 0.8, // Placeholder - would combine all quality metrics
      },
    };
  }

  /**
   * Parse bias analysis
   */
  private parseBiasAnalysis(analysisText: string): BiasAnalysis {
    try {
      return JSON.parse(analysisText);
    } catch (error) {
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
  }

  /**
   * Calculate cost for OpenAI API usage
   */
  private calculateCost(usage: any): number {
    // OpenAI pricing (as of 2024)
    const pricing = {
      'gpt-4-turbo-preview': {
        input: 0.01 / 1000, // $0.01 per 1K input tokens
        output: 0.03 / 1000, // $0.03 per 1K output tokens
      },
      'gpt-4-vision-preview': {
        input: 0.01 / 1000,
        output: 0.03 / 1000,
      },
      'gpt-3.5-turbo-16k': {
        input: 0.001 / 1000,
        output: 0.002 / 1000,
      },
    };

    const modelPricing = pricing[this.config.model as string] || pricing['gpt-4-turbo-preview'];

    const inputCost = usage.prompt_tokens * modelPricing.input;
    const outputCost = usage.completion_tokens * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Health check specific to OpenAI
   */
  async healthCheck() {
    try {
      const response = await this.request('/models', { timeout: 5000 });
      return {
        status: 'healthy',
        responseTime: response.metadata?.processingTime || 0,
        lastCheck: new Date().toISOString(),
        errorRate: 0,
        details: {
          modelsAvailable: response.data?.data?.length || 0,
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