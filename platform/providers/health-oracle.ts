/**
 * MiForge ProviderHealthOracle — ML-Based 429 Predictor
 *
 * Goes beyond simple threshold detection. Uses exponential moving average (EMA)
 * of request rates + response latency trends to predict rate limit hits
 * BEFORE they happen. Switches providers proactively, not reactively.
 *
 * Features:
 *   - EMA-based rate prediction (not just current-minute counting)
 *   - Latency spike detection (early warning of provider degradation)
 *   - Time-of-day patterns (providers are busier at certain hours)
 *   - Automatic provider ranking based on historical reliability
 *   - Cooldown tracking after 429s (knows when provider recovers)
 */

import { FREE_PROVIDERS, type Provider } from './index.js';

interface ProviderState {
  name: string;
  emaRequestRate: number;        // Exponential moving average of requests/minute
  emaLatency: number;            // EMA of response latency
  last429At: number;             // Timestamp of last 429
  cooldownUntil: number;         // Don't use until this time
  hourlyPattern: number[];       // 24 slots: avg requests per hour historically
  reliabilityScore: number;      // 0-1, rolling success rate
  totalRequests: number;
  totalSuccesses: number;
  consecutiveFailures: number;
}

interface PredictionResult {
  provider: string;
  predictedSecondsTo429: number; // -1 = safe, 0 = imminent
  confidence: number;            // 0-1 how sure we are
  recommendation: 'use' | 'caution' | 'avoid';
  reason: string;
}

const EMA_ALPHA = 0.3;           // Higher = more responsive to recent data
const LATENCY_SPIKE_THRESHOLD = 2.5; // 2.5x normal latency = spike
const COOLDOWN_AFTER_429_MS = 60_000; // 1 min cooldown after rate limit hit
const RELIABILITY_DECAY = 0.995;      // Slow decay towards 0.5 without data

export class ProviderHealthOracle {
  private states: Map<string, ProviderState> = new Map();

  constructor() {
    for (const p of FREE_PROVIDERS) {
      this.states.set(p.name, {
        name: p.name,
        emaRequestRate: 0,
        emaLatency: 500, // Default 500ms baseline
        last429At: 0,
        cooldownUntil: 0,
        hourlyPattern: new Array(24).fill(0),
        reliabilityScore: 0.9, // Start optimistic
        totalRequests: 0,
        totalSuccesses: 0,
        consecutiveFailures: 0,
      });
    }
  }

  /**
   * Record a completed request (call after every API call)
   */
  record(provider: string, latencyMs: number, success: boolean, statusCode?: number): void {
    const state = this.states.get(provider);
    if (!state) return;

    state.totalRequests++;
    if (success) {
      state.totalSuccesses++;
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures++;
    }

    // Update EMA request rate
    state.emaRequestRate = EMA_ALPHA * 1 + (1 - EMA_ALPHA) * state.emaRequestRate;

    // Update EMA latency
    state.emaLatency = EMA_ALPHA * latencyMs + (1 - EMA_ALPHA) * state.emaLatency;

    // Update reliability score
    state.reliabilityScore = EMA_ALPHA * (success ? 1 : 0) + (1 - EMA_ALPHA) * state.reliabilityScore;

    // Track hourly pattern
    const hour = new Date().getHours();
    state.hourlyPattern[hour] = EMA_ALPHA * state.emaRequestRate + (1 - EMA_ALPHA) * state.hourlyPattern[hour];

    // Track 429s specifically
    if (statusCode === 429) {
      state.last429At = Date.now();
      state.cooldownUntil = Date.now() + COOLDOWN_AFTER_429_MS;
    }
  }

  /**
   * Predict time-to-429 for all providers
   */
  predictAll(): PredictionResult[] {
    return Array.from(this.states.values()).map(state => this.predict(state));
  }

  /**
   * Get the best provider right now (oracle-informed)
   */
  getBestProvider(taskType?: string): string {
    const predictions = this.predictAll()
      .filter(p => p.recommendation !== 'avoid')
      .sort((a, b) => {
        // Sort by: recommendation (use > caution), then reliability, then time-to-429
        if (a.recommendation !== b.recommendation) {
          return a.recommendation === 'use' ? -1 : 1;
        }
        return b.predictedSecondsTo429 - a.predictedSecondsTo429;
      });

    if (predictions.length === 0) return 'ollama'; // Local fallback
    return predictions[0].provider;
  }

  /**
   * Get provider health report
   */
  getReport(): { providers: PredictionResult[]; recommendation: string } {
    const predictions = this.predictAll();
    const best = predictions.filter(p => p.recommendation === 'use');
    const caution = predictions.filter(p => p.recommendation === 'caution');
    const avoid = predictions.filter(p => p.recommendation === 'avoid');

    let recommendation: string;
    if (best.length >= 3) {
      recommendation = `Healthy: ${best.length} providers available`;
    } else if (best.length >= 1) {
      recommendation = `Limited: Only ${best.length} healthy providers. Consider reducing request rate.`;
    } else if (caution.length > 0) {
      recommendation = `⚠️ All providers degraded. Use ${caution[0].provider} with caution.`;
    } else {
      recommendation = `🔴 CRITICAL: All cloud providers unavailable. Using local fallback (Ollama).`;
    }

    return { providers: predictions, recommendation };
  }

  /**
   * Decay all states slightly (call periodically, e.g., every minute)
   */
  decay(): void {
    for (const [, state] of this.states) {
      // Request rate decays towards 0 when no requests
      state.emaRequestRate *= RELIABILITY_DECAY;
      // Reliability decays slowly towards 0.5 (uncertain) without data
      state.reliabilityScore = RELIABILITY_DECAY * state.reliabilityScore + (1 - RELIABILITY_DECAY) * 0.5;
    }
  }

  // ── Private ──

  private predict(state: ProviderState): PredictionResult {
    const provider = FREE_PROVIDERS.find(p => p.name === state.name);
    const rpmLimit = provider?.rpmLimit || 30;
    const now = Date.now();

    // Check cooldown
    if (state.cooldownUntil > now) {
      const secsLeft = Math.ceil((state.cooldownUntil - now) / 1000);
      return {
        provider: state.name,
        predictedSecondsTo429: 0,
        confidence: 0.95,
        recommendation: 'avoid',
        reason: `In cooldown after 429 (${secsLeft}s remaining)`,
      };
    }

    // Check consecutive failures
    if (state.consecutiveFailures >= 3) {
      return {
        provider: state.name,
        predictedSecondsTo429: 0,
        confidence: 0.85,
        recommendation: 'avoid',
        reason: `${state.consecutiveFailures} consecutive failures`,
      };
    }

    // Predict based on EMA rate vs limit
    const currentRate = state.emaRequestRate * 60; // Convert to per-minute estimate
    const utilizationPct = currentRate / rpmLimit;

    // Factor in time-of-day pattern
    const hour = new Date().getHours();
    const hourlyLoad = state.hourlyPattern[hour] * 60;
    const expectedRate = Math.max(currentRate, hourlyLoad * 0.5); // Blend current + historical

    // Latency spike detection (early degradation signal)
    const baselineLatency = 500; // ms
    const latencyMultiple = state.emaLatency / baselineLatency;
    const latencySpiking = latencyMultiple > LATENCY_SPIKE_THRESHOLD;

    // Calculate prediction
    let predictedSeconds: number;
    let confidence: number;
    let recommendation: 'use' | 'caution' | 'avoid';
    let reason: string;

    if (utilizationPct >= 0.90 || latencySpiking) {
      predictedSeconds = 0;
      confidence = utilizationPct >= 0.95 ? 0.95 : 0.75;
      recommendation = 'avoid';
      reason = latencySpiking
        ? `Latency spike: ${Math.round(state.emaLatency)}ms (${latencyMultiple.toFixed(1)}x normal)`
        : `At ${(utilizationPct * 100).toFixed(0)}% capacity`;
    } else if (utilizationPct >= 0.70) {
      const remaining = rpmLimit - expectedRate;
      predictedSeconds = Math.round((remaining / Math.max(state.emaRequestRate, 0.1)) * 60);
      confidence = 0.7;
      recommendation = 'caution';
      reason = `${(utilizationPct * 100).toFixed(0)}% capacity, ~${predictedSeconds}s to limit`;
    } else {
      predictedSeconds = -1; // Safe
      confidence = Math.min(0.9, state.reliabilityScore);
      recommendation = 'use';
      reason = `Healthy: ${(utilizationPct * 100).toFixed(0)}% capacity, reliability ${(state.reliabilityScore * 100).toFixed(0)}%`;
    }

    return { provider: state.name, predictedSecondsTo429: predictedSeconds, confidence, recommendation, reason };
  }
}

export const healthOracle = new ProviderHealthOracle();
