import { Logger } from '../../utils/logger';

export interface CostRecord {
  provider: string;
  service: string;
  operation: string;
  cost: number;
  tokens?: number;
  model?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface CostSummary {
  provider: string;
  totalCost: number;
  totalTokens: number;
  operations: number;
  averageCostPerOperation: number;
  averageCostPerToken?: number;
  breakdown: Record<string, {
    cost: number;
    operations: number;
    averageCost: number;
  }>;
}

export interface BudgetAlert {
  provider: string;
  currentSpend: number;
  budget: number;
  percentage: number;
  alertLevel: 'warning' | 'critical';
}

export class CostTracker {
  private serviceName: string;
  private costs: Map<string, CostRecord[]> = new Map();
  private budgets: Map<string, number> = new Map();
  private alerts: BudgetAlert[] = [];
  private logger: Logger;
  private totalDailyBudget?: number;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.logger = new Logger(`${serviceName}-cost-tracker`);

    // Set daily budget from environment or use default
    this.totalDailyBudget = process.env.DAILY_BUDGET ? parseFloat(process.env.DAILY_BUDGET) : undefined;
  }

  /**
   * Track a cost for an API operation
   */
  trackCost(record: Omit<CostRecord, 'timestamp'>): void {
    const costRecord: CostRecord = {
      ...record,
      timestamp: new Date().toISOString(),
    };

    const key = `${record.provider}:${record.service}`;

    if (!this.costs.has(key)) {
      this.costs.set(key, []);
    }

    this.costs.get(key)!.push(costRecord);

    this.logger.debug('Cost tracked', {
      provider: record.provider,
      service: record.service,
      operation: record.operation,
      cost: record.cost,
      tokens: record.tokens,
    });

    // Check budget alerts
    this.checkBudgetAlerts(record.provider);

    // Clean up old records
    this.cleanupOldRecords();
  }

  /**
   * Track cost from axios response (convenience method)
   */
  trackRequest(response: any, provider: string, service: string): void {
    const usage = response.data?.usage;
    const model = response.data?.model;

    if (usage) {
      this.trackCost({
        provider,
        service,
        operation: 'api_request',
        cost: this.estimateCost(provider, model, usage),
        tokens: usage.total_tokens,
        model,
        metadata: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
        },
      });
    }
  }

  /**
   * Get cost summary for a provider
   */
  getSummary(provider?: string, timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'): CostSummary[] {
    const summaries: CostSummary[] = [];
    const cutoffTime = this.getCutoffTime(timeRange);

    const providersToCheck = provider ? [provider] : Array.from(this.costs.keys()).map(key => key.split(':')[0]);
    const uniqueProviders = [...new Set(providersToCheck)];

    for (const providerName of uniqueProviders) {
      const providerCosts = this.getProviderCosts(providerName, cutoffTime);

      const summary: CostSummary = {
        provider: providerName,
        totalCost: 0,
        totalTokens: 0,
        operations: 0,
        averageCostPerOperation: 0,
        breakdown: {},
      };

      for (const record of providerCosts) {
        summary.totalCost += record.cost;
        summary.totalTokens += record.tokens || 0;
        summary.operations++;

        // Breakdown by operation
        if (!summary.breakdown[record.operation]) {
          summary.breakdown[record.operation] = { cost: 0, operations: 0, averageCost: 0 };
        }
        summary.breakdown[record.operation].cost += record.cost;
        summary.breakdown[record.operation].operations++;
      }

      // Calculate averages
      summary.averageCostPerOperation = summary.operations > 0 ? summary.totalCost / summary.operations : 0;
      summary.averageCostPerToken = summary.totalTokens > 0 ? summary.totalCost / summary.totalTokens : 0;

      // Calculate operation averages
      for (const operation in summary.breakdown) {
        const breakdown = summary.breakdown[operation];
        breakdown.averageCost = breakdown.operations > 0 ? breakdown.cost / breakdown.operations : 0;
      }

      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * Set budget for a provider
   */
  setBudget(provider: string, budget: number): void {
    this.budgets.set(provider, budget);
    this.logger.info(`Budget set for ${provider}`, { budget });
  }

  /**
   * Get budget alerts
   */
  getBudgetAlerts(): BudgetAlert[] {
    return this.alerts;
  }

  /**
   * Clear budget alerts
   */
  clearBudgetAlerts(): void {
    this.alerts = [];
  }

  /**
   * Get total costs across all providers
   */
  getTotalCosts(timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'): {
    total: number;
    providers: Record<string, number>;
    trend: {
      period1: number;
      period2: number;
      change: number;
      changePercentage: number;
    };
  } {
    const summaries = this.getSummary(undefined, timeRange);
    const providers: Record<string, number> = {};
    let total = 0;

    for (const summary of summaries) {
      providers[summary.provider] = summary.totalCost;
      total += summary.totalCost;
    }

    // Calculate trend (comparison with previous period)
    const trend = this.calculateTrend(timeRange);

    return {
      total,
      providers,
      trend,
    };
  }

  /**
   * Get cost optimization recommendations
   */
  getOptimizationRecommendations(): {
    provider: string;
    recommendations: string[];
    potentialSavings: number;
  }[] {
    const summaries = this.getSummary(undefined, 'day');
    const recommendations: {
      provider: string;
      recommendations: string[];
      potentialSavings: number;
    }[] = [];

    for (const summary of summaries) {
      const providerRecommendations: string[] = [];
      let potentialSavings = 0;

      // High-cost operations
      for (const [operation, breakdown] of Object.entries(summary.breakdown)) {
        if (breakdown.averageCost > 0.1) {
          providerRecommendations.push(
            `Consider optimizing ${operation} operations (avg cost: $${breakdown.averageCost.toFixed(4)})`
          );
          potentialSavings += breakdown.cost * 0.2; // Assume 20% savings potential
        }
      }

      // High volume low-cost operations
      if (summary.operations > 1000 && summary.averageCostPerOperation > 0.01) {
        providerRecommendations.push(
          `Consider caching results for high-volume operations (${summary.operations} operations/day)`
        );
        potentialSavings += summary.totalCost * 0.3; // Assume 30% savings with caching
      }

      // Model-specific recommendations
      if (summary.breakdown['api_request']) {
        const apiCosts = summary.breakdown['api_request'];
        if (apiCosts.averageCost > 0.05) {
          providerRecommendations.push(
            'Consider using smaller models for simple requests'
          );
          potentialSavings += apiCosts.cost * 0.4; // Assume 40% savings with smaller models
        }
      }

      // Budget alerts
      const budget = this.budgets.get(summary.provider);
      if (budget && (summary.totalCost / budget) > 0.8) {
        providerRecommendations.push(
          `Approaching budget limit: $${summary.totalCost.toFixed(2)} of $${budget.toFixed(2)}`
        );
      }

      if (providerRecommendations.length > 0) {
        recommendations.push({
          provider: summary.provider,
          recommendations: providerRecommendations,
          potentialSavings,
        });
      }
    }

    return recommendations;
  }

  /**
   * Export cost data for analysis
   */
  exportData(format: 'json' | 'csv' = 'json'): string {
    const allRecords: CostRecord[] = [];

    for (const records of this.costs.values()) {
      allRecords.push(...records);
    }

    if (format === 'csv') {
      const headers = ['Provider', 'Service', 'Operation', 'Cost', 'Tokens', 'Model', 'Timestamp'];
      const rows = allRecords.map(record => [
        record.provider,
        record.service,
        record.operation,
        record.cost.toFixed(6),
        record.tokens || '',
        record.model || '',
        record.timestamp,
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(allRecords, null, 2);
  }

  /**
   * Reset all cost tracking data
   */
  resetData(): void {
    this.costs.clear();
    this.alerts = [];
    this.logger.info('Cost tracking data reset');
  }

  /**
   * Estimate cost based on usage
   */
  private estimateCost(provider: string, model?: string, usage?: any): number {
    // This would contain actual pricing models
    const pricing: Record<string, Record<string, { input: number; output: number }>> = {
      openai: {
        'gpt-4-turbo-preview': { input: 0.01 / 1000, output: 0.03 / 1000 },
        'gpt-4-vision-preview': { input: 0.01 / 1000, output: 0.03 / 1000 },
        'gpt-3.5-turbo-16k': { input: 0.001 / 1000, output: 0.002 / 1000 },
      },
      anthropic: {
        'claude-3-opus-20240229': { input: 0.015 / 1000, output: 0.075 / 1000 },
        'claude-3-sonnet-20240229': { input: 0.003 / 1000, output: 0.015 / 1000 },
        'claude-3-haiku-20240307': { input: 0.00025 / 1000, output: 0.00125 / 1000 },
      },
    };

    if (!usage || !model) {
      return 0;
    }

    const providerPricing = pricing[provider];
    if (!providerPricing || !providerPricing[model]) {
      return 0;
    }

    const modelPricing = providerPricing[model];
    const inputCost = (usage.prompt_tokens || 0) * modelPricing.input;
    const outputCost = (usage.completion_tokens || 0) * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Check budget alerts
   */
  private checkBudgetAlerts(provider: string): void {
    const budget = this.budgets.get(provider) || this.totalDailyBudget;
    if (!budget) return;

    const currentSpend = this.getProviderSpend(provider, 'day');
    const percentage = (currentSpend / budget) * 100;

    if (percentage >= 90) {
      this.addBudgetAlert(provider, currentSpend, budget, percentage, 'critical');
    } else if (percentage >= 75) {
      this.addBudgetAlert(provider, currentSpend, budget, percentage, 'warning');
    }
  }

  /**
   * Add budget alert
   */
  private addBudgetAlert(provider: string, currentSpend: number, budget: number, percentage: number, alertLevel: 'warning' | 'critical'): void {
    // Check if alert already exists for this provider
    const existingAlert = this.alerts.find(alert => alert.provider === provider);
    if (existingAlert) {
      // Update existing alert if it's more severe
      if (percentage > existingAlert.percentage) {
        existingAlert.currentSpend = currentSpend;
        existingAlert.percentage = percentage;
        existingAlert.alertLevel = alertLevel;
      }
      return;
    }

    // Add new alert
    const alert: BudgetAlert = {
      provider,
      currentSpend,
      budget,
      percentage,
      alertLevel,
    };

    this.alerts.push(alert);

    this.logger.warn(`Budget alert: ${provider} at ${percentage.toFixed(1)}% of budget`, {
      provider,
      currentSpend,
      budget,
      percentage,
      alertLevel,
    });
  }

  /**
   * Get provider spend for time range
   */
  private getProviderSpend(provider: string, timeRange: 'hour' | 'day' | 'week' | 'month'): number {
    const cutoffTime = this.getCutoffTime(timeRange);
    const providerCosts = this.getProviderCosts(provider, cutoffTime);

    return providerCosts.reduce((total, record) => total + record.cost, 0);
  }

  /**
   * Get provider costs for time range
   */
  private getProviderCosts(provider: string, cutoffTime: Date): CostRecord[] {
    const costs: CostRecord[] = [];

    for (const [key, records] of this.costs.entries()) {
      if (key.startsWith(`${provider}:`)) {
        const filtered = records.filter(record => new Date(record.timestamp) >= cutoffTime);
        costs.push(...filtered);
      }
    }

    return costs;
  }

  /**
   * Get cutoff time for time range
   */
  private getCutoffTime(timeRange: 'hour' | 'day' | 'week' | 'month'): Date {
    const now = new Date();
    switch (timeRange) {
      case 'hour':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'day':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Calculate cost trend
   */
  private calculateTrend(timeRange: 'hour' | 'day' | 'week' | 'month'): {
    period1: number;
    period2: number;
    change: number;
    changePercentage: number;
  } {
    const now = new Date();
    let period1Start: Date;
    let period2Start: Date;
    let period2End: Date;

    switch (timeRange) {
      case 'hour':
        period1Start = new Date(now.getTime() - 60 * 60 * 1000);
        period2Start = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        period2End = period1Start;
        break;
      case 'day':
        period1Start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        period2Start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        period2End = period1Start;
        break;
      case 'week':
        period1Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        period2Start = new Date(now.getTime() - 2 * 7 * 24 * 60 * 60 * 1000);
        period2End = period1Start;
        break;
      case 'month':
        period1Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        period2Start = new Date(now.getTime() - 2 * 30 * 24 * 60 * 60 * 1000);
        period2End = period1Start;
        break;
    }

    const period1Cost = this.getTotalCostsInRange(period1Start, now);
    const period2Cost = this.getTotalCostsInRange(period2Start, period2End);

    const change = period1Cost - period2Cost;
    const changePercentage = period2Cost > 0 ? (change / period2Cost) * 100 : 0;

    return {
      period1: period1Cost,
      period2: period2Cost,
      change,
      changePercentage,
    };
  }

  /**
   * Get total costs in date range
   */
  private getTotalCostsInRange(start: Date, end: Date): number {
    let total = 0;

    for (const records of this.costs.values()) {
      for (const record of records) {
        const recordDate = new Date(record.timestamp);
        if (recordDate >= start && recordDate < end) {
          total += record.cost;
        }
      }
    }

    return total;
  }

  /**
   * Clean up old records to prevent memory bloat
   */
  private cleanupOldRecords(): void {
    const cutoffTime = this.getCutoffTime('month'); // Keep last month of data

    for (const [key, records] of this.costs.entries()) {
      const filtered = records.filter(record => new Date(record.timestamp) >= cutoffTime);
      this.costs.set(key, filtered);
    }
  }
}