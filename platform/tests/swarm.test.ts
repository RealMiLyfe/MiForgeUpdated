/**
 * MiForge Platform Tests — SwarmOrchestrator (unit tests, no live API calls)
 */

import { describe, it, expect } from 'vitest';
import { SwarmOrchestrator } from '../orchestration/swarm.js';

describe('SwarmOrchestrator', () => {
  describe('Constructor', () => {
    it('should create instance with default config', () => {
      const swarm = new SwarmOrchestrator();
      expect(swarm).toBeDefined();
    });

    it('should accept custom config', () => {
      const swarm = new SwarmOrchestrator({
        maxParallel: 5,
        timeoutMs: 60_000,
        consensusThreshold: 0.8,
      });
      expect(swarm).toBeDefined();
    });
  });

  describe('getSpecialists', () => {
    it('should return all 5 specialist roles', () => {
      const swarm = new SwarmOrchestrator();
      const specialists = swarm.getSpecialists();
      expect(Object.keys(specialists)).toHaveLength(5);
      expect(specialists).toHaveProperty('planner');
      expect(specialists).toHaveProperty('coder');
      expect(specialists).toHaveProperty('reviewer');
      expect(specialists).toHaveProperty('researcher');
      expect(specialists).toHaveProperty('speed');
    });

    it('every specialist should have required fields', () => {
      const swarm = new SwarmOrchestrator();
      const specialists = swarm.getSpecialists();
      for (const [name, spec] of Object.entries(specialists)) {
        expect(spec.name).toBe(name);
        expect(spec.model).toBeTruthy();
        expect(spec.provider).toBeTruthy();
        expect(spec.systemPrompt).toBeTruthy();
        expect(spec.capabilities.length).toBeGreaterThan(0);
      }
    });

    it('specialists should use different providers for diversity', () => {
      const swarm = new SwarmOrchestrator();
      const specialists = swarm.getSpecialists();
      const providers = new Set(Object.values(specialists).map(s => s.provider));
      // Should have at least 2 different providers
      expect(providers.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('swarmSolve (without live API)', () => {
    it('should return a result even when all models fail', async () => {
      // Use a non-existent proxy URL so all calls fail
      const swarm = new SwarmOrchestrator({ proxyUrl: 'http://localhost:1', timeoutMs: 1000 });
      const result = await swarm.swarmSolve('test task', { n: 2 });

      expect(result).toBeDefined();
      expect(result.answer).toBeTruthy();
      expect(result.confidence).toBe(0);
      expect(result.totalCost).toBe(0);
    });
  });

  describe('dispatch (without live API)', () => {
    it('should return a result even when specialist fails', async () => {
      const swarm = new SwarmOrchestrator({ proxyUrl: 'http://localhost:1', timeoutMs: 1000 });
      const result = await swarm.dispatch('write a hello world function', 'coder');

      expect(result).toBeDefined();
      expect(result.totalCost).toBe(0);
      expect(result.strategy).toBe('specialist');
    });
  });
});
