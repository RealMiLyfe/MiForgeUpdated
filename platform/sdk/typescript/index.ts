/**
 * @miforge/platform — Developer SDK (TypeScript)
 *
 * Unified entry point for the MiForge AI Platform.
 * Import everything from here.
 *
 * @example
 * ```typescript
 * import { MiForge } from '@miforge/platform';
 * const forge = new MiForge();
 * const result = await forge.complete('Build a governance module', { taskType: 'coding' });
 * ```
 */

// ── Layer 2: Providers ──
export { ConfidenceRouter, router } from '../../providers/confidence-router.js';
export { FREE_PROVIDERS, ROUTING_TABLE } from '../../providers/index.js';
export type { Provider, RoutingDecision } from '../../providers/index.js';

// ── Layer 3: Orchestration ──
export { SwarmOrchestrator, swarm } from '../../orchestration/swarm.js';
export type { SwarmConfig, SwarmResult, SpecialistRole } from '../../orchestration/swarm.js';

// ── Layer 4: Memory ──
export { MemoryOS, memoryOS } from '../../memory/index.js';
export type { Memory, MemoryTier, MemoryQuery, MemoryResult, MemoryOSConfig } from '../../memory/index.js';

// ── Layer 5: RAG ──
export { RAGPipeline, ragPipeline } from '../../rag/index.js';
export type { Document, RetrievalResult, RAGConfig } from '../../rag/index.js';

// ── Layer 7: Computer Use ──
export { SkillHarvestingAgent, computerUseAgent } from '../../computer-use/index.js';
export type { BrowserAction, SkillPattern, ComputerUseResult, ComputerUseConfig } from '../../computer-use/index.js';

// ── Layer 8: MCP ──
export { autoconfig, scanProject, generateConfig, MCP_CATALOG } from '../../mcp/index.js';
export type { MCPServer } from '../../mcp/index.js';

// ── Layer 9: Safety ──
export { SafetyGateway, safetyGateway, safeExecute, Gate } from '../../safety/index.js';
export type { GateDecision, SafetyConfig } from '../../safety/index.js';

// ── Layer 10: Observability ──
export { CostZeroDashboard, dashboard } from '../../observability/index.js';
export type { ProviderMetrics, DashboardSnapshot } from '../../observability/index.js';

// ── Layer 11: Self-Improvement ──
export { GeneticPromptOptimizer, EvalHarness, promptOptimizer, evalHarness } from '../../self-improvement/index.js';
export type { EvalResult, PromptVariant } from '../../self-improvement/index.js';

// ── Voice ──
export { VoicePipeline, voicePipeline } from '../../voice/index.js';
export type { VoiceConfig, VoiceResult, STTResult } from '../../voice/index.js';

// ── Interfaces ──
export { PuterAgent, PUTER_MODELS, PUTER_HTML_TEMPLATE } from '../../interfaces/puter.js';
export type { PuterConfig, PuterChatResult } from '../../interfaces/puter.js';
export { MiForgeDiscordBot, discordBot } from '../../interfaces/discord.js';
export type { DiscordBotConfig } from '../../interfaces/discord.js';
export { MiForgeTelegramBot, telegramBot } from '../../interfaces/telegram.js';
export type { TelegramBotConfig, ApprovalRequest } from '../../interfaces/telegram.js';

// ── Main Platform Class ──

import { MemoryOS } from '../../memory/index.js';
import { RAGPipeline } from '../../rag/index.js';
import { SafetyGateway, safeExecute, Gate } from '../../safety/index.js';
import { CostZeroDashboard } from '../../observability/index.js';
import { ConfidenceRouter } from '../../providers/confidence-router.js';
import { SwarmOrchestrator } from '../../orchestration/swarm.js';
import { SkillHarvestingAgent } from '../../computer-use/index.js';
import { VoicePipeline } from '../../voice/index.js';

export interface MiForgeConfig {
  routing?: Record<string, string>;
  safetyGates?: boolean;
  autoApproveBelow?: Gate;
  redisUrl?: string;
  mem0Key?: string;
  cohereKey?: string;
}

/**
 * MiForge — The unified AI platform class.
 * One import, all 12 layers accessible.
 */
export class MiForge {
  public memory: MemoryOS;
  public rag: RAGPipeline;
  public safety: SafetyGateway;
  public dashboard: CostZeroDashboard;
  public router: ConfidenceRouter;
  public swarm: SwarmOrchestrator;
  public computerUse: SkillHarvestingAgent;
  public voice: VoicePipeline;

  constructor(config?: MiForgeConfig) {
    this.memory = new MemoryOS({ redisUrl: config?.redisUrl, mem0ApiKey: config?.mem0Key });
    this.rag = new RAGPipeline({ cohereApiKey: config?.cohereKey });
    this.safety = new SafetyGateway({ autoApproveBelow: config?.autoApproveBelow });
    this.dashboard = new CostZeroDashboard();
    this.router = new ConfidenceRouter();
    this.swarm = new SwarmOrchestrator();
    this.computerUse = new SkillHarvestingAgent(this.memory);
    this.voice = new VoicePipeline();
  }

  /** AI completion — auto-routes to best free provider */
  async complete(prompt: string, options?: {
    taskType?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  }): Promise<{ text: string; provider: string; model: string; tokens: number }> {
    const taskType = options?.taskType || 'general';
    const route = this.router.route(taskType);
    const { FREE_PROVIDERS } = await import('../../providers/index.js');
    const providerInfo = FREE_PROVIDERS.find(p => p.name === route.provider);
    if (!providerInfo) throw new Error(`Provider ${route.provider} not found`);

    const apiKey = process.env[providerInfo.apiKeyEnv] || '';
    const start = Date.now();
    const messages: { role: string; content: string }[] = [];
    if (options?.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${providerInfo.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: route.model,
        messages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
      }),
    });

    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;
    this.router.recordRequest(route.provider, tokens, res.ok);
    this.dashboard.record(route.provider, tokens, Date.now() - start, res.ok);
    return { text, provider: route.provider, model: route.model, tokens };
  }

  /** Safe execution — wraps any action with 7 safety gates */
  async safe<T>(actionDescription: string, fn: () => Promise<T>): Promise<T | null> {
    const result = await safeExecute(actionDescription, fn, this.safety);
    if (result.blocked) return null;
    return result.result!;
  }

  /** Platform status snapshot */
  status() {
    return {
      memory: this.memory.getStats(),
      providers: this.dashboard.getSnapshot(),
      safety: this.safety.getStats(),
      skills: this.computerUse.getSkills().length,
    };
  }
}
