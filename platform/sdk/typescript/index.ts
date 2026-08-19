/**
 * @miforge/platform — Developer SDK
 * 
 * The unified entry point for developers building on the MiForge platform.
 * This is how devs integrate AI capabilities directly into the MiLyfe
 * governance platform.
 * 
 * @example
 * ```typescript
 * import { MiForge } from '@miforge/platform';
 * 
 * const forge = new MiForge();
 * 
 * // AI completion with auto-routing (free, no card)
 * const response = await forge.complete('Explain this code', { taskType: 'coding' });
 * 
 * // Store a memory
 * await forge.memory.remember('User prefers TypeScript', 'user_123', 0.8);
 * 
 * // RAG retrieval
 * const docs = await forge.rag.retrieve('How does auth work?');
 * 
 * // Safe execution (checks all 7 gates)
 * await forge.safe('deploy production', async () => { ... });
 * ```
 */

// Re-export all layers
export { MemoryOS, memoryOS } from '../../memory/index.js';
export type { Memory, MemoryTier, MemoryQuery, MemoryResult } from '../../memory/index.js';

export { RAGPipeline, ragPipeline } from '../../rag/index.js';
export type { Document, RetrievalResult, RAGConfig } from '../../rag/index.js';

export { SafetyGateway, safetyGateway, safeExecute, Gate } from '../../safety/index.js';
export type { GateDecision, SafetyConfig } from '../../safety/index.js';

export { CostZeroDashboard, dashboard } from '../../observability/index.js';
export type { ProviderMetrics, DashboardSnapshot } from '../../observability/index.js';

export { ConfidenceRouter, router } from '../../providers/confidence-router.js';
export { FREE_PROVIDERS, ROUTING_TABLE } from '../../providers/index.js';
export type { Provider, RoutingDecision } from '../../providers/index.js';

export { autoconfig, scanProject, MCP_CATALOG } from '../../mcp/index.js';
export type { MCPServer } from '../../mcp/index.js';

export { GeneticPromptOptimizer, EvalHarness, promptOptimizer, evalHarness } from '../../self-improvement/index.js';
export type { EvalResult, PromptVariant } from '../../self-improvement/index.js';

// ── Main Platform Class ──

import { MemoryOS } from '../../memory/index.js';
import { RAGPipeline } from '../../rag/index.js';
import { SafetyGateway, safeExecute, Gate } from '../../safety/index.js';
import { CostZeroDashboard } from '../../observability/index.js';
import { ConfidenceRouter } from '../../providers/confidence-router.js';

export interface MiForgeConfig {
  /** Override provider routing for specific task types */
  routing?: Record<string, string>;
  /** Enable/disable safety gates (default: all enabled) */
  safetyGates?: boolean;
  /** Auto-approve gates below this level (dev mode only) */
  autoApproveBelow?: Gate;
  /** Redis URL for working memory */
  redisUrl?: string;
  /** Mem0 API key for episodic memory */
  mem0Key?: string;
}

/**
 * MiForge — The unified AI platform for the MiLyfe ecosystem.
 * 
 * This is the primary class developers use to access all platform capabilities.
 * Everything routes through free providers. Zero credit cards.
 */
export class MiForge {
  public memory: MemoryOS;
  public rag: RAGPipeline;
  public safety: SafetyGateway;
  public dashboard: CostZeroDashboard;
  public router: ConfidenceRouter;

  constructor(config?: MiForgeConfig) {
    this.memory = new MemoryOS({
      redisUrl: config?.redisUrl,
      mem0Key: config?.mem0Key,
    });
    this.rag = new RAGPipeline();
    this.safety = new SafetyGateway({
      autoApproveBelow: config?.autoApproveBelow,
    });
    this.dashboard = new CostZeroDashboard();
    this.router = new ConfidenceRouter();
  }

  /**
   * AI completion — auto-routes to best free provider
   */
  async complete(prompt: string, options?: {
    taskType?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  }): Promise<{ text: string; provider: string; model: string; tokens: number }> {
    const taskType = options?.taskType || 'general';
    const route = this.router.route(taskType);
    const { provider } = await import('../../providers/index.js');

    const providerInfo = (await import('../../providers/index.js')).FREE_PROVIDERS.find(
      p => p.name === route.provider
    );

    if (!providerInfo) {
      throw new Error(`Provider ${route.provider} not found`);
    }

    const apiKey = process.env[providerInfo.apiKeyEnv] || '';
    const startTime = Date.now();

    const res = await fetch(`${providerInfo.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: route.model,
        messages: [
          ...(options?.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
      }),
    });

    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;
    const latency = Date.now() - startTime;

    // Record metrics
    this.router.recordRequest(route.provider, tokens, res.ok);
    this.dashboard.record(route.provider, tokens, latency, res.ok);

    return {
      text,
      provider: route.provider,
      model: route.model,
      tokens,
    };
  }

  /**
   * Safe execution — wraps any action with all 7 safety gates
   */
  async safe<T>(actionDescription: string, fn: () => Promise<T>): Promise<T | null> {
    const result = await safeExecute(actionDescription, fn, this.safety);
    if (result.blocked) {
      console.warn(`[MiForge] Action blocked by Gate ${result.gate}: ${result.reason}`);
      return null;
    }
    return result.result!;
  }

  /**
   * Get platform status
   */
  status(): {
    memory: ReturnType<MemoryOS['getStats']>;
    providers: ReturnType<CostZeroDashboard['getSnapshot']>;
    safety: ReturnType<SafetyGateway['getStats']>;
  } {
    return {
      memory: this.memory.getStats(),
      providers: this.dashboard.getSnapshot(),
      safety: this.safety.getStats(),
    };
  }
}
