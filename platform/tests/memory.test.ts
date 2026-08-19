/**
 * MiForge Platform Tests — Memory OS (Context tier only, no external deps)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryOS } from '../memory/index.js';

describe('MemoryOS', () => {
  let memory: MemoryOS;

  beforeEach(() => {
    // Initialize without external backends (context tier works standalone)
    memory = new MemoryOS({
      redisUrl: 'redis://nonexistent:6379', // Won't connect — that's fine
      mem0ApiKey: '',
      cogneeApiUrl: 'http://nonexistent:8000',
    });
  });

  describe('Tier selection', () => {
    it('should route importance >= 0.9 to graph tier', async () => {
      const mem = await memory.remember('Critical fact', 'user_1', 0.95);
      expect(mem.tier).toBe('graph');
    });

    it('should route importance 0.7-0.89 to episodic tier', async () => {
      const mem = await memory.remember('Important fact', 'user_1', 0.75);
      expect(mem.tier).toBe('episodic');
    });

    it('should route importance 0.4-0.69 to working tier', async () => {
      const mem = await memory.remember('Session fact', 'user_1', 0.5);
      expect(mem.tier).toBe('working');
    });

    it('should route importance < 0.4 to context tier', async () => {
      const mem = await memory.remember('Trivial fact', 'user_1', 0.2);
      expect(mem.tier).toBe('context');
    });
  });

  describe('Context tier (in-memory, no external deps)', () => {
    it('should store and recall from context tier', async () => {
      await memory.remember('User likes TypeScript', 'user_1', 0.1);
      await memory.remember('User prefers dark mode', 'user_1', 0.15);

      const results = await memory.recall({
        query: 'TypeScript',
        scope: 'user_1',
        tiers: ['context'],
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('TypeScript');
      expect(results[0].tier).toBe('context');
    });

    it('should respect scope isolation', async () => {
      await memory.remember('Secret for user A', 'user_a', 0.1);
      await memory.remember('Secret for user B', 'user_b', 0.1);

      const resultsA = await memory.recall({ query: 'Secret', scope: 'user_a', tiers: ['context'] });
      const resultsB = await memory.recall({ query: 'Secret', scope: 'user_b', tiers: ['context'] });

      expect(resultsA.length).toBe(1);
      expect(resultsA[0].content).toContain('user A');
      expect(resultsB.length).toBe(1);
      expect(resultsB[0].content).toContain('user B');
    });

    it('should evict old entries when context buffer is full', async () => {
      // Fill buffer with many entries
      for (let i = 0; i < 200; i++) {
        await memory.remember(`Entry ${i} with some padding text to increase size`, 'user_1', 0.1);
      }

      const results = await memory.recall({ query: 'Entry', scope: 'user_1', tiers: ['context'] });
      // Should still have entries (not crash), but earlier ones may be evicted
      expect(results.length).toBeGreaterThan(0);
    });

    it('should forget (clear) context for a user', async () => {
      await memory.remember('Remember this', 'user_1', 0.1);
      await memory.forget('user_1');

      const results = await memory.recall({ query: 'Remember', scope: 'user_1', tiers: ['context'] });
      expect(results.length).toBe(0);
    });
  });

  describe('Memory IDs', () => {
    it('should generate unique IDs for each memory', async () => {
      const m1 = await memory.remember('First', 'user_1', 0.1);
      const m2 = await memory.remember('Second', 'user_1', 0.1);
      expect(m1.id).not.toBe(m2.id);
      expect(m1.id).toMatch(/^mem_/);
    });
  });

  describe('Stats', () => {
    it('should report context entries count', async () => {
      await memory.remember('A', 'user_1', 0.1);
      await memory.remember('B', 'user_1', 0.1);
      const stats = memory.getStats();
      expect(stats.contextEntries).toBe(2);
    });

    it('should report redis as disconnected when unreachable', () => {
      const stats = memory.getStats();
      expect(stats.redisConnected).toBe(false);
    });
  });
});
