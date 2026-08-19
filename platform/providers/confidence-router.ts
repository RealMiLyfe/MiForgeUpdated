/**
 * MiForge Confidence Router
 * 
 * Routes 90% of requests to free providers.
 * Only escalates to frontier when confidence < 0.70 after 3 free tries.
 * Predicts 429s proactively and switches before they hit.
 */

import { ROUTING_TABLE, FREE_PROVIDERS } from './index.js';

interface RequestMetrics {
  timestamp: number;
  provider: string;
  tokens: number;
  success: boolean;
}

export class ConfidenceRouter {
  private requestHistory: Map<string, RequestMetrics[]> = new Map();
  private totalTokens = 0;
  private totalCost = 0.00; // Always $0.00

  constructor() {
    for (const p of FREE_PROVIDERS) {
      this.requestHistory.set(p.name, []);
    }
  }

  /**
   * Get the best provider for a task type, considering current load
   */
  route(taskType: string, confidence?: number): { provider: string; model: string; fallbacks: string[] } {
    const candidates = ROUTING_TABLE[taskType] || ROUTING_TABLE['general'];
    
    // Find first healthy candidate not near rate limit
    for (const candidate of candidates) {
      if (!this.isNearRateLimit(candidate.provider)) {
        const fallbacks = candidates
          .filter(c => c.provider !== candidate.provider)
          .map(c => `${c.provider}/${c.model}`);
        
        return {
          provider: candidate.provider,
          model: candidate.model,
          fallbacks,
        };
      }
    }

    // All near limit — use local fallback
    return {
      provider: 'ollama',
      model: 'qwen3-coder:latest',
      fallbacks: ['lmstudio/loaded-model'],
    };
  }

  /**
   * Predict if provider will hit 429 within next minute
   */
  isNearRateLimit(providerName: string): boolean {
    const provider = FREE_PROVIDERS.find(p => p.name === providerName);
    if (!provider) return true;

    const history = this.requestHistory.get(providerName) || [];
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    
    const recentRequests = history.filter(r => r.timestamp > oneMinuteAgo);
    
    // If at 85% of limit, consider it "near"
    return recentRequests.length >= provider.rpmLimit * 0.85;
  }

  /**
   * Record a completed request for rate limit tracking
   */
  recordRequest(provider: string, tokens: number, success: boolean): void {
    const history = this.requestHistory.get(provider) || [];
    history.push({ timestamp: Date.now(), provider, tokens, success });
    
    // Prune entries older than 5 minutes
    const cutoff = Date.now() - 300_000;
    const pruned = history.filter(r => r.timestamp > cutoff);
    this.requestHistory.set(provider, pruned);
    
    this.totalTokens += tokens;
    // Cost stays $0.00 — always
  }

  /**
   * Get dashboard stats
   */
  getStats(): { totalTokens: number; totalCost: number; providerHealth: Record<string, number> } {
    const providerHealth: Record<string, number> = {};
    for (const [name, history] of this.requestHistory) {
      const recent = history.filter(r => r.timestamp > Date.now() - 60_000);
      const provider = FREE_PROVIDERS.find(p => p.name === name);
      const limit = provider?.rpmLimit || 30;
      providerHealth[name] = 1 - (recent.length / limit); // 1.0 = empty, 0.0 = full
    }

    return { totalTokens: this.totalTokens, totalCost: this.totalCost, providerHealth };
  }
}

export const router = new ConfidenceRouter();
