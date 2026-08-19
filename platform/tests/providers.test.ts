/**
 * MiForge Platform Tests — Provider Routing & Confidence Router
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfidenceRouter } from '../providers/confidence-router.js';
import { FREE_PROVIDERS, ROUTING_TABLE } from '../providers/index.js';

describe('FREE_PROVIDERS catalog', () => {
  it('should have at least 8 providers defined', () => {
    expect(FREE_PROVIDERS.length).toBeGreaterThanOrEqual(8);
  });

  it('every provider should have required fields', () => {
    for (const p of FREE_PROVIDERS) {
      expect(p.name).toBeTruthy();
      expect(p.baseUrl).toBeTruthy();
      expect(p.testModel).toBeTruthy();
      expect(p.rpmLimit).toBeGreaterThan(0);
      expect(p.bestFor.length).toBeGreaterThan(0);
    }
  });

  it('should include local fallbacks (ollama, lmstudio)', () => {
    const names = FREE_PROVIDERS.map(p => p.name);
    expect(names).toContain('ollama');
    expect(names).toContain('lmstudio');
  });

  it('local providers should not require API keys', () => {
    const ollama = FREE_PROVIDERS.find(p => p.name === 'ollama')!;
    const lm = FREE_PROVIDERS.find(p => p.name === 'lmstudio')!;
    expect(ollama.apiKeyEnv).toBe('');
    expect(lm.apiKeyEnv).toBe('');
  });

  it('local providers should have effectively unlimited RPM', () => {
    const ollama = FREE_PROVIDERS.find(p => p.name === 'ollama')!;
    expect(ollama.rpmLimit).toBeGreaterThanOrEqual(9999);
  });
});

describe('ROUTING_TABLE', () => {
  it('should have routes for all major task types', () => {
    expect(ROUTING_TABLE).toHaveProperty('coding');
    expect(ROUTING_TABLE).toHaveProperty('speed');
    expect(ROUTING_TABLE).toHaveProperty('deep_reasoning');
    expect(ROUTING_TABLE).toHaveProperty('long_context');
    expect(ROUTING_TABLE).toHaveProperty('general');
    expect(ROUTING_TABLE).toHaveProperty('private');
    expect(ROUTING_TABLE).toHaveProperty('embed');
    expect(ROUTING_TABLE).toHaveProperty('rerank');
  });

  it('every route should reference a valid provider', () => {
    const providerNames = FREE_PROVIDERS.map(p => p.name);
    for (const [, routes] of Object.entries(ROUTING_TABLE)) {
      for (const route of routes) {
        expect(providerNames).toContain(route.provider);
        expect(route.model).toBeTruthy();
      }
    }
  });

  it('general route should have at least 3 fallbacks', () => {
    expect(ROUTING_TABLE['general'].length).toBeGreaterThanOrEqual(3);
  });
});

describe('ConfidenceRouter', () => {
  let router: ConfidenceRouter;

  beforeEach(() => {
    router = new ConfidenceRouter();
  });

  it('should route to a provider for any task type', () => {
    const result = router.route('coding');
    expect(result.provider).toBeTruthy();
    expect(result.model).toBeTruthy();
    expect(result.fallbacks).toBeDefined();
  });

  it('should fallback to ollama when all providers near limit', () => {
    // Simulate hitting rate limits on all cloud providers
    for (const p of FREE_PROVIDERS.filter(p => p.name !== 'ollama' && p.name !== 'lmstudio')) {
      for (let i = 0; i < p.rpmLimit; i++) {
        router.recordRequest(p.name, 100, true);
      }
    }
    const result = router.route('general');
    expect(result.provider).toBe('ollama');
  });

  it('should track total tokens with zero cost', () => {
    router.recordRequest('groq', 500, true);
    router.recordRequest('nvidia_nim', 1000, true);
    const stats = router.getStats();
    expect(stats.totalTokens).toBe(1500);
    expect(stats.totalCost).toBe(0);
  });

  it('should detect near rate limit correctly', () => {
    // Groq has 30 RPM limit, threshold at 85% = 25.5
    for (let i = 0; i < 26; i++) {
      router.recordRequest('groq', 10, true);
    }
    expect(router.isNearRateLimit('groq')).toBe(true);
  });

  it('should NOT detect near rate limit when under threshold', () => {
    router.recordRequest('groq', 10, true);
    router.recordRequest('groq', 10, true);
    expect(router.isNearRateLimit('groq')).toBe(false);
  });

  it('should return provider health percentages', () => {
    const stats = router.getStats();
    expect(stats.providerHealth).toBeDefined();
    // All providers should be at 100% (empty) initially
    for (const [, health] of Object.entries(stats.providerHealth)) {
      expect(health).toBe(1);
    }
  });
});
