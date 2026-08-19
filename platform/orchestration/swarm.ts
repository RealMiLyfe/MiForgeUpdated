/**
 * MiForge SwarmOrchestrator — Layer 3: Multi-Agent Orchestration
 *
 * Pattern: Run N free models in parallel on same task → cross-validate → consensus
 * Result: Better than any single model. Still $0.
 *
 * Architecture (proven by Anthropic, Cognition, Microsoft):
 *   - Single orchestrator owns full context
 *   - Spawns isolated specialist subagents
 *   - Subagents return compressed summaries only
 *   - No shared mutable state between agents
 *
 * All models route through LiteLLM proxy (localhost:4000) or direct free APIs.
 */

import { FREE_PROVIDERS, ROUTING_TABLE } from '../providers/index.js';
import { ConfidenceRouter } from '../providers/confidence-router.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SwarmConfig {
  /** LiteLLM proxy URL (default: http://localhost:4000) */
  proxyUrl?: string;
  /** Maximum parallel calls (default: 3) */
  maxParallel?: number;
  /** Timeout per model call in ms (default: 30000) */
  timeoutMs?: number;
  /** Minimum consensus threshold 0-1 (default: 0.6) */
  consensusThreshold?: number;
  /** Temperature for generation (default: 0.7) */
  temperature?: number;
}

export interface SwarmResult {
  /** The consensus answer */
  answer: string;
  /** Confidence in consensus (0-1) */
  confidence: number;
  /** Which models agreed */
  agreement: { model: string; agreed: boolean; latencyMs: number }[];
  /** Total tokens used across all models */
  totalTokens: number;
  /** Total cost (always $0.00) */
  totalCost: number;
  /** Which strategy produced the answer */
  strategy: 'consensus' | 'best_single' | 'specialist';
}

export interface SpecialistRole {
  name: string;
  model: string;
  provider: string;
  systemPrompt: string;
  capabilities: string[];
}

interface ModelResponse {
  model: string;
  provider: string;
  text: string;
  tokens: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// SPECIALIST DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const SPECIALISTS: Record<string, SpecialistRole> = {
  planner: {
    name: 'planner',
    model: 'moonshotai/kimi-k2-thinking',
    provider: 'nvidia_nim',
    systemPrompt: 'You are a strategic planner. Decompose complex tasks into clear subtasks. Output a numbered list of steps. Be thorough but concise.',
    capabilities: ['analyze', 'decompose', 'plan', 'prioritize'],
  },
  coder: {
    name: 'coder',
    model: 'qwen/qwen3-coder-480b',
    provider: 'nvidia_nim',
    systemPrompt: 'You are an expert software engineer. Write clean, production-ready code. Include error handling. Follow best practices for the language being used.',
    capabilities: ['write', 'edit', 'refactor', 'debug', 'test'],
  },
  reviewer: {
    name: 'reviewer',
    model: 'nvidia/nemotron-3-super-120b-a12b',
    provider: 'nvidia_nim',
    systemPrompt: 'You are a senior code reviewer. Identify bugs, security issues, performance problems, and style violations. Be constructive and specific.',
    capabilities: ['review', 'critique', 'audit', 'verify'],
  },
  researcher: {
    name: 'researcher',
    model: 'gemini-2.5-flash',
    provider: 'gemini',
    systemPrompt: 'You are a research analyst. Synthesize information clearly. Cite reasoning. Consider multiple angles. Distinguish facts from speculation.',
    capabilities: ['research', 'summarize', 'compare', 'explain'],
  },
  speed: {
    name: 'speed',
    model: 'llama-3.3-70b-versatile',
    provider: 'groq',
    systemPrompt: 'You are a fast, accurate assistant. Give direct answers. No preamble. Be concise but complete.',
    capabilities: ['quick', 'classify', 'extract', 'translate'],
  },
};

// ═══════════════════════════════════════════════════════════════
// SWARM ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

export class SwarmOrchestrator {
  private proxyUrl: string;
  private maxParallel: number;
  private timeoutMs: number;
  private consensusThreshold: number;
  private temperature: number;
  private router: ConfidenceRouter;

  constructor(config?: SwarmConfig) {
    this.proxyUrl = config?.proxyUrl || process.env.LITELLM_URL || 'http://localhost:4000';
    this.maxParallel = config?.maxParallel || 3;
    this.timeoutMs = config?.timeoutMs || 30_000;
    this.consensusThreshold = config?.consensusThreshold || 0.6;
    this.temperature = config?.temperature || 0.7;
    this.router = new ConfidenceRouter();
  }

  /**
   * Swarm Solve — Run N free models in parallel, take consensus
   * Better than any single model. Cost: $0.00.
   */
  async swarmSolve(task: string, options?: {
    models?: string[];
    systemPrompt?: string;
    n?: number;
  }): Promise<SwarmResult> {
    const n = options?.n || this.maxParallel;

    // Select models — use diverse providers for true consensus
    const models = options?.models || this.selectDiverseModels(n);

    // Call all models in parallel
    const responses = await this.callParallel(models, task, options?.systemPrompt);

    // Filter successful responses
    const successes = responses.filter(r => r.success);

    if (successes.length === 0) {
      return {
        answer: '[SWARM] All models failed. Escalate to human.',
        confidence: 0,
        agreement: responses.map(r => ({ model: r.model, agreed: false, latencyMs: r.latencyMs })),
        totalTokens: 0,
        totalCost: 0,
        strategy: 'best_single',
      };
    }

    if (successes.length === 1) {
      return {
        answer: successes[0].text,
        confidence: 0.5, // Single model = medium confidence
        agreement: responses.map(r => ({ model: r.model, agreed: r.success, latencyMs: r.latencyMs })),
        totalTokens: successes[0].tokens,
        totalCost: 0,
        strategy: 'best_single',
      };
    }

    // Cross-validate and find consensus
    const consensus = await this.findConsensus(successes, task);

    return {
      answer: consensus.answer,
      confidence: consensus.confidence,
      agreement: responses.map(r => ({
        model: r.model,
        agreed: r.success && consensus.agreedModels.includes(r.model),
        latencyMs: r.latencyMs,
      })),
      totalTokens: successes.reduce((sum, r) => sum + r.tokens, 0),
      totalCost: 0, // Always $0.00
      strategy: 'consensus',
    };
  }

  /**
   * Specialist Dispatch — Route to the best specialist for a task type
   */
  async dispatch(task: string, specialistName?: string): Promise<SwarmResult> {
    const specialist = specialistName
      ? SPECIALISTS[specialistName]
      : this.autoSelectSpecialist(task);

    if (!specialist) {
      // Fallback to swarm solve
      return this.swarmSolve(task);
    }

    const response = await this.callModel(
      specialist.provider,
      specialist.model,
      task,
      specialist.systemPrompt
    );

    return {
      answer: response.text,
      confidence: response.success ? 0.8 : 0,
      agreement: [{ model: response.model, agreed: response.success, latencyMs: response.latencyMs }],
      totalTokens: response.tokens,
      totalCost: 0,
      strategy: 'specialist',
    };
  }

  /**
   * Plan and Execute — Decompose task → parallel specialist execution → merge
   */
  async planAndExecute(task: string): Promise<{ plan: string[]; results: SwarmResult[]; merged: string }> {
    // Step 1: Planner decomposes the task
    const planResult = await this.dispatch(
      `Decompose this task into 2-5 clear subtasks. Return ONLY a numbered list, one subtask per line:\n\n${task}`,
      'planner'
    );

    const subtasks = planResult.answer
      .split('\n')
      .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(line => line.length > 5);

    if (subtasks.length === 0) {
      // Planning failed — fall back to swarm
      const fallback = await this.swarmSolve(task);
      return { plan: [task], results: [fallback], merged: fallback.answer };
    }

    // Step 2: Execute subtasks in parallel with appropriate specialists
    const results = await Promise.all(
      subtasks.map(subtask => {
        const specialist = this.autoSelectSpecialist(subtask);
        return this.dispatch(subtask, specialist?.name);
      })
    );

    // Step 3: Merge results
    const mergePrompt = `Synthesize these results into a coherent answer:\n\n${
      results.map((r, i) => `[Subtask ${i + 1}]: ${subtasks[i]}\n[Result]: ${r.answer}`).join('\n\n')
    }`;

    const merged = await this.dispatch(mergePrompt, 'reviewer');

    return { plan: subtasks, results, merged: merged.answer };
  }

  /**
   * Get available specialists
   */
  getSpecialists(): Record<string, SpecialistRole> {
    return { ...SPECIALISTS };
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Model calling
  // ═══════════════════════════════════════════════════════════════

  private async callParallel(
    models: { provider: string; model: string }[],
    task: string,
    systemPrompt?: string
  ): Promise<ModelResponse[]> {
    const calls = models.map(m => this.callModel(m.provider, m.model, task, systemPrompt));

    const results = await Promise.allSettled(calls);

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        model: models[i].model,
        provider: models[i].provider,
        text: '',
        tokens: 0,
        latencyMs: this.timeoutMs,
        success: false,
        error: r.reason?.message || 'Unknown error',
      };
    });
  }

  private async callModel(
    provider: string,
    model: string,
    task: string,
    systemPrompt?: string
  ): Promise<ModelResponse> {
    const start = Date.now();
    const providerInfo = FREE_PROVIDERS.find(p => p.name === provider);
    const baseUrl = providerInfo?.baseUrl || this.proxyUrl;
    const apiKey = providerInfo?.apiKeyEnv ? (process.env[providerInfo.apiKeyEnv] || '') : 'miforge-local-dev';

    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: task });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const endpoint = baseUrl.includes('generativelanguage.googleapis.com')
        ? `${baseUrl}chat/completions`
        : `${baseUrl}/chat/completions`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://miforge.dev' } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 4096,
          temperature: this.temperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { model, provider, text: '', tokens: 0, latencyMs, success: false, error: `HTTP ${res.status}: ${errText.slice(0, 100)}` };
      }

      const data = await res.json() as any;
      const text = data.choices?.[0]?.message?.content || '';
      const tokens = data.usage?.total_tokens || 0;

      // Record in router for rate limit tracking
      this.router.recordRequest(provider, tokens, true);

      return { model, provider, text, tokens, latencyMs, success: true };
    } catch (err: any) {
      return {
        model, provider, text: '', tokens: 0,
        latencyMs: Date.now() - start,
        success: false,
        error: err.name === 'AbortError' ? 'Timeout' : err.message,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Consensus finding
  // ═══════════════════════════════════════════════════════════════

  private async findConsensus(responses: ModelResponse[], originalTask: string): Promise<{
    answer: string;
    confidence: number;
    agreedModels: string[];
  }> {
    if (responses.length <= 1) {
      return { answer: responses[0]?.text || '', confidence: 0.5, agreedModels: [responses[0]?.model || ''] };
    }

    // Strategy: Use the fastest responding model to judge consensus among all answers
    const judge = responses.reduce((fastest, r) => r.latencyMs < fastest.latencyMs ? r : fastest);

    const judgingPrompt = `You are a consensus judge. Given these ${responses.length} independent answers to the same question, determine:
1. Do they substantially agree? (YES/NO)
2. What is the best synthesis of their answers?
3. Confidence level (0.0-1.0)

ORIGINAL QUESTION: ${originalTask.slice(0, 500)}

${responses.map((r, i) => `ANSWER ${i + 1} (${r.model}):\n${r.text.slice(0, 1000)}`).join('\n\n---\n\n')}

Respond in this exact format:
AGREE: YES or NO
CONFIDENCE: 0.X
SYNTHESIS: <your merged answer>`;

    // Use Groq for fast judging (320 tok/s)
    const judgeResponse = await this.callModel('groq', 'llama-3.3-70b-versatile', judgingPrompt);

    if (!judgeResponse.success) {
      // Fallback: pick longest answer (heuristic for thoroughness)
      const best = responses.reduce((longest, r) => r.text.length > longest.text.length ? r : longest);
      return { answer: best.text, confidence: 0.6, agreedModels: [best.model] };
    }

    // Parse judge response
    const judgeText = judgeResponse.text;
    const agreeMatch = judgeText.match(/AGREE:\s*(YES|NO)/i);
    const confMatch = judgeText.match(/CONFIDENCE:\s*([\d.]+)/);
    const synthMatch = judgeText.match(/SYNTHESIS:\s*([\s\S]+)/i);

    const agreed = agreeMatch?.[1]?.toUpperCase() === 'YES';
    const confidence = Math.min(1, Math.max(0, parseFloat(confMatch?.[1] || '0.6')));
    const synthesis = synthMatch?.[1]?.trim() || responses[0].text;

    return {
      answer: synthesis,
      confidence: agreed ? confidence : confidence * 0.7,
      agreedModels: agreed ? responses.map(r => r.model) : [responses[0].model],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Model/specialist selection
  // ═══════════════════════════════════════════════════════════════

  private selectDiverseModels(n: number): { provider: string; model: string }[] {
    // Pick from different providers for true diversity
    const diverse = [
      { provider: 'nvidia_nim', model: 'nvidia/nemotron-3-super-120b-a12b' },
      { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      { provider: 'gemini', model: 'gemini-2.5-flash' },
      { provider: 'cerebras', model: 'llama-3.3-70b' },
      { provider: 'openrouter', model: 'openrouter/auto' },
    ];

    // Filter to providers that aren't near rate limit
    const available = diverse.filter(m => !this.router.isNearRateLimit(m.provider));

    if (available.length >= n) return available.slice(0, n);
    return diverse.slice(0, n); // Use all even if some near limit
  }

  private autoSelectSpecialist(task: string): SpecialistRole | null {
    const taskLower = task.toLowerCase();

    // Keyword-based routing to specialist
    for (const [, specialist] of Object.entries(SPECIALISTS)) {
      for (const cap of specialist.capabilities) {
        if (taskLower.includes(cap)) return specialist;
      }
    }

    // Heuristic patterns
    if (/\b(code|function|class|implement|fix|bug|test)\b/i.test(task)) return SPECIALISTS.coder;
    if (/\b(plan|design|architect|break down|decompose)\b/i.test(task)) return SPECIALISTS.planner;
    if (/\b(review|audit|check|security|vulnerab)\b/i.test(task)) return SPECIALISTS.reviewer;
    if (/\b(explain|research|compare|what is|how does)\b/i.test(task)) return SPECIALISTS.researcher;
    if (/\b(quick|fast|classify|extract|translate|summarize)\b/i.test(task)) return SPECIALISTS.speed;

    return null; // No specialist matched — caller should use swarmSolve
  }
}

export const swarm = new SwarmOrchestrator();
