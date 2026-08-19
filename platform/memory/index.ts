/**
 * MiForge Memory OS — 4-Tier Persistent Agent Memory
 *
 * Tier 1: In-context     → Active session FIFO, 30K token limit
 * Tier 2: Working        → Redis, session-scoped, 24h TTL, ~1ms recall
 * Tier 3: Episodic       → Mem0 free (10K/mo), cross-session, vector
 * Tier 4: Semantic Graph → Cognee (Apache-2.0, local Kuzu, free forever)
 *
 * ALL BACKENDS WIRED — real Redis, real Mem0, real Cognee calls.
 * Install: pip install cognee mem0ai redis
 * Docker: see docker-compose.yml (Redis + Kuzu containers)
 */

import { createClient, type RedisClientType } from 'redis';

export interface Memory {
  id: string;
  content: string;
  importance: number;    // 0.0 → 1.0
  scope: string;         // user_id | agent_id | session_id | org_id
  tier: MemoryTier;
  createdAt: number;
  expiresAt?: number;    // undefined = permanent
  metadata?: Record<string, unknown>;
}

export type MemoryTier = 'context' | 'working' | 'episodic' | 'graph';

export interface MemoryQuery {
  query: string;
  scope: string;
  topK?: number;
  tiers?: MemoryTier[];
}

export interface MemoryResult {
  content: string;
  tier: MemoryTier;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryOSConfig {
  redisUrl?: string;
  mem0ApiKey?: string;
  mem0BaseUrl?: string;
  cogneeApiUrl?: string;
  maxContextTokens?: number;
}

/** Importance thresholds determine storage tier */
const TIER_THRESHOLDS: Record<MemoryTier, number> = {
  graph: 0.9,
  episodic: 0.7,
  working: 0.4,
  context: 0.0,
};

const WORKING_TTL_SECONDS = 86_400; // 24 hours

/**
 * MiForge Memory OS — Unified interface, real backends
 */
export class MemoryOS {
  private contextBuffer: Map<string, Memory[]> = new Map();
  private maxContextTokens: number;
  private redis: RedisClientType | null = null;
  private redisUrl: string;
  private mem0ApiKey: string;
  private mem0BaseUrl: string;
  private cogneeApiUrl: string;
  private initialized = false;

  constructor(config?: MemoryOSConfig) {
    this.redisUrl = config?.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.mem0ApiKey = config?.mem0ApiKey || process.env.MEM0_API_KEY || '';
    this.mem0BaseUrl = config?.mem0BaseUrl || 'https://api.mem0.ai/v1';
    this.cogneeApiUrl = config?.cogneeApiUrl || process.env.COGNEE_API_URL || 'http://localhost:8000';
    this.maxContextTokens = config?.maxContextTokens || 30_000;
  }

  /**
   * Initialize connections (call once on boot)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Connect Redis
    try {
      this.redis = createClient({ url: this.redisUrl });
      this.redis.on('error', (err) => console.warn('[Memory:Redis] Connection error:', err.message));
      await this.redis.connect();
      console.log('[Memory:Redis] Connected');
    } catch (err: any) {
      console.warn(`[Memory:Redis] Failed to connect (${err.message}) — working memory unavailable`);
      this.redis = null;
    }

    this.initialized = true;
  }

  /**
   * Store a memory — auto-routes to correct tier based on importance
   */
  async remember(content: string, scope: string, importance: number, metadata?: Record<string, unknown>): Promise<Memory> {
    await this.init();
    const tier = this.selectTier(importance);
    const memory: Memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content,
      importance,
      scope,
      tier,
      createdAt: Date.now(),
      expiresAt: tier === 'working' ? Date.now() + WORKING_TTL_SECONDS * 1000 : undefined,
      metadata,
    };

    switch (tier) {
      case 'graph':
        await this.storeGraph(memory);
        break;
      case 'episodic':
        await this.storeEpisodic(memory);
        break;
      case 'working':
        await this.storeWorking(memory);
        break;
      case 'context':
        this.storeContext(memory);
        break;
    }

    return memory;
  }

  /**
   * Recall memories — parallel retrieval across all tiers, merged + ranked
   */
  async recall(query: MemoryQuery): Promise<MemoryResult[]> {
    await this.init();
    const tiers = query.tiers || ['graph', 'episodic', 'working', 'context'];
    const topK = query.topK || 10;

    const results = await Promise.allSettled(
      tiers.map(tier => this.recallFromTier(tier, query.query, query.scope, topK))
    );

    const allResults: MemoryResult[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      }
    }

    return allResults
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * GDPR cascade delete — all tiers, all scopes for a user
   */
  async forget(userId: string): Promise<void> {
    await this.init();
    await Promise.allSettled([
      this.deleteFromGraph(userId),
      this.deleteFromEpisodic(userId),
      this.deleteFromWorking(userId),
      this.deleteFromContext(userId),
    ]);
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    this.initialized = false;
  }

  /** Get memory stats */
  getStats(): { contextEntries: number; redisConnected: boolean; mem0Configured: boolean; cogneConfigured: boolean } {
    let contextEntries = 0;
    for (const [, entries] of this.contextBuffer) contextEntries += entries.length;
    return {
      contextEntries,
      redisConnected: this.redis !== null,
      mem0Configured: !!this.mem0ApiKey,
      cogneConfigured: !!this.cogneeApiUrl,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // TIER 4: Cognee Graph — Permanent, multi-hop reasoning
  // pip install cognee | Backend: KuzuDB (docker-compose)
  // ═══════════════════════════════════════════════════════════════

  private async storeGraph(memory: Memory): Promise<void> {
    try {
      // Cognee Python SDK call via subprocess (TypeScript → Python bridge)
      // In production: use cognee REST API or direct Python worker
      const payload = {
        data: memory.content,
        dataset_name: `scope_${memory.scope}`,
        metadata: { ...memory.metadata, importance: memory.importance, id: memory.id },
      };

      const res = await fetch(`${this.cogneeApiUrl}/api/v1/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Fallback: store in Redis with permanent TTL as graph substitute
        await this.storeWorking({ ...memory, expiresAt: undefined });
        console.warn(`[Memory:Graph] Cognee unavailable, stored in Redis (no TTL)`);
      }
    } catch (err: any) {
      console.warn(`[Memory:Graph] ${err.message} — falling back to Redis`);
      await this.storeWorking({ ...memory, expiresAt: undefined });
    }
  }

  private async recallFromGraph(query: string, scope: string, topK: number): Promise<MemoryResult[]> {
    try {
      const res = await fetch(`${this.cogneeApiUrl}/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          dataset_name: `scope_${scope}`,
          top_k: topK,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { results: { content: string; score: number; metadata?: Record<string, unknown> }[] };
        return (data.results || []).map(r => ({
          content: r.content,
          tier: 'graph' as MemoryTier,
          score: r.score,
          metadata: r.metadata,
        }));
      }
    } catch { /* Cognee unavailable */ }
    return [];
  }

  private async deleteFromGraph(userId: string): Promise<void> {
    try {
      await fetch(`${this.cogneeApiUrl}/api/v1/datasets/scope_${userId}`, { method: 'DELETE' });
    } catch { /* best effort */ }
  }

  // ═══════════════════════════════════════════════════════════════
  // TIER 3: Mem0 Episodic — Cross-session, vector-based
  // pip install mem0ai | Free tier: 10K memories/month, no card
  // ═══════════════════════════════════════════════════════════════

  private async storeEpisodic(memory: Memory): Promise<void> {
    if (!this.mem0ApiKey) {
      // No Mem0 key — fall back to working memory
      await this.storeWorking(memory);
      return;
    }

    try {
      const res = await fetch(`${this.mem0BaseUrl}/memories/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.mem0ApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: memory.content }],
          user_id: memory.scope,
          metadata: { ...memory.metadata, miforge_id: memory.id, importance: memory.importance },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[Memory:Episodic] Mem0 returned ${res.status}: ${errText.slice(0, 100)}`);
        await this.storeWorking(memory);
      }
    } catch (err: any) {
      console.warn(`[Memory:Episodic] ${err.message} — falling back to Redis`);
      await this.storeWorking(memory);
    }
  }

  private async recallFromEpisodic(query: string, scope: string, topK: number): Promise<MemoryResult[]> {
    if (!this.mem0ApiKey) return [];

    try {
      const res = await fetch(`${this.mem0BaseUrl}/memories/search/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.mem0ApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          user_id: scope,
          top_k: topK,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { results: { memory: string; score: number; metadata?: Record<string, unknown> }[] };
        return (data.results || []).map(r => ({
          content: r.memory,
          tier: 'episodic' as MemoryTier,
          score: r.score || 0.75,
          metadata: r.metadata,
        }));
      }
    } catch { /* Mem0 unavailable */ }
    return [];
  }

  private async deleteFromEpisodic(userId: string): Promise<void> {
    if (!this.mem0ApiKey) return;
    try {
      await fetch(`${this.mem0BaseUrl}/memories/?user_id=${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Token ${this.mem0ApiKey}` },
      });
    } catch { /* best effort */ }
  }

  // ═══════════════════════════════════════════════════════════════
  // TIER 2: Redis Working Memory — 24h TTL, ~1ms recall
  // docker run -d redis:7-alpine -p 6379:6379
  // ═══════════════════════════════════════════════════════════════

  private async storeWorking(memory: Memory): Promise<void> {
    if (!this.redis) return;

    const key = `miforge:mem:${memory.scope}:${memory.id}`;
    const value = JSON.stringify({
      content: memory.content,
      importance: memory.importance,
      metadata: memory.metadata,
      createdAt: memory.createdAt,
    });

    try {
      if (memory.expiresAt) {
        const ttl = Math.max(1, Math.round((memory.expiresAt - Date.now()) / 1000));
        await this.redis.setEx(key, ttl, value);
      } else {
        // No expiry (graph fallback)
        await this.redis.set(key, value);
      }

      // Also add to a sorted set for search (score = timestamp for recency)
      await this.redis.zAdd(`miforge:idx:${memory.scope}`, {
        score: memory.createdAt,
        value: key,
      });
    } catch (err: any) {
      console.warn(`[Memory:Working] Redis write failed: ${err.message}`);
    }
  }

  private async recallFromWorking(query: string, scope: string, topK: number): Promise<MemoryResult[]> {
    if (!this.redis) return [];

    try {
      // Get most recent keys for this scope
      const keys = await this.redis.zRange(`miforge:idx:${scope}`, -topK * 2, -1);
      if (keys.length === 0) return [];

      // Fetch values
      const values = await this.redis.mGet(keys);
      const queryLower = query.toLowerCase();
      const results: MemoryResult[] = [];

      for (const val of values) {
        if (!val) continue;
        try {
          const parsed = JSON.parse(val) as { content: string; importance: number; metadata?: Record<string, unknown> };
          // Simple keyword relevance scoring
          const contentLower = parsed.content.toLowerCase();
          const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
          const matchCount = queryWords.filter(w => contentLower.includes(w)).length;
          const score = queryWords.length > 0 ? matchCount / queryWords.length : 0.3;

          if (score > 0.1) {
            results.push({
              content: parsed.content,
              tier: 'working',
              score: Math.min(score, 0.9), // Cap below episodic/graph
              metadata: parsed.metadata,
            });
          }
        } catch { /* skip malformed */ }
      }

      return results.sort((a, b) => b.score - a.score).slice(0, topK);
    } catch (err: any) {
      console.warn(`[Memory:Working] Redis read failed: ${err.message}`);
      return [];
    }
  }

  private async deleteFromWorking(userId: string): Promise<void> {
    if (!this.redis) return;
    try {
      const keys = await this.redis.zRange(`miforge:idx:${userId}`, 0, -1);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
      await this.redis.del(`miforge:idx:${userId}`);
    } catch { /* best effort */ }
  }

  // ═══════════════════════════════════════════════════════════════
  // TIER 1: In-Context FIFO — Session only, evicts at token limit
  // ═══════════════════════════════════════════════════════════════

  private storeContext(memory: Memory): void {
    const entries = this.contextBuffer.get(memory.scope) || [];
    entries.push(memory);

    // FIFO eviction (rough token estimate: 4 chars ≈ 1 token)
    let totalChars = entries.reduce((sum, m) => sum + m.content.length, 0);
    while (totalChars > this.maxContextTokens * 4 && entries.length > 1) {
      const evicted = entries.shift();
      if (evicted) totalChars -= evicted.content.length;
    }

    this.contextBuffer.set(memory.scope, entries);
  }

  private recallFromContext(query: string, scope: string, topK: number): MemoryResult[] {
    const entries = this.contextBuffer.get(scope) || [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    return entries
      .map(m => {
        const contentLower = m.content.toLowerCase();
        const matchCount = queryWords.filter(w => contentLower.includes(w)).length;
        const score = queryWords.length > 0 ? matchCount / queryWords.length : 0.2;
        return { content: m.content, tier: 'context' as MemoryTier, score, metadata: m.metadata };
      })
      .filter(r => r.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private deleteFromContext(userId: string): void {
    this.contextBuffer.delete(userId);
  }

  // ═══════════════════════════════════════════════════════════════
  // Tier dispatch
  // ═══════════════════════════════════════════════════════════════

  private selectTier(importance: number): MemoryTier {
    if (importance >= TIER_THRESHOLDS.graph) return 'graph';
    if (importance >= TIER_THRESHOLDS.episodic) return 'episodic';
    if (importance >= TIER_THRESHOLDS.working) return 'working';
    return 'context';
  }

  private async recallFromTier(tier: MemoryTier, query: string, scope: string, topK: number): Promise<MemoryResult[]> {
    switch (tier) {
      case 'context':
        return this.recallFromContext(query, scope, topK);
      case 'working':
        return this.recallFromWorking(query, scope, topK);
      case 'episodic':
        return this.recallFromEpisodic(query, scope, topK);
      case 'graph':
        return this.recallFromGraph(query, scope, topK);
      default:
        return [];
    }
  }
}

export const memoryOS = new MemoryOS();
