/**
 * MiForge Self-Improvement — Layer 11: The System Gets Better By Itself
 *
 * - Genetic Prompt Optimizer: prompts evolve weekly using free models for eval
 * - Eval Harness: measures quality on real tasks, updates routing automatically
 * - Confidence Router Learning: tracks which provider is best for YOUR tasks
 *
 * Runs weekly on cron. Cost: $0 (uses Groq/Gemini free tiers for eval).
 */

export interface EvalResult {
  provider: string;
  model: string;
  task: string;
  success: boolean;
  quality: number;     // 0.0 → 1.0
  tokensUsed: number;
  latencyMs: number;
  timestamp: number;
}

export interface PromptVariant {
  id: string;
  prompt: string;
  score: number;
  generation: number;
}

/**
 * Genetic Prompt Optimizer
 *
 * Week 1: Baseline performance
 * Week 2: 15 mutant variants tested → best survives
 * Week 4: Cross-breed top performers → super-prompts emerge
 */
export class GeneticPromptOptimizer {
  private populationSize = 20;
  private mutationRate = 0.3;

  /**
   * Evolve a prompt through N generations
   */
  async evolve(
    basePrompt: string,
    evalFn: (prompt: string) => Promise<number>,
    generations = 10
  ): Promise<{ bestPrompt: string; bestScore: number; history: number[] }> {
    let population = this.initPopulation(basePrompt);
    const history: number[] = [];

    for (let gen = 0; gen < generations; gen++) {
      // Evaluate all variants
      const scores = await Promise.all(
        population.map(async (variant) => {
          const score = await evalFn(variant.prompt);
          return { ...variant, score };
        })
      );

      // Sort by fitness
      scores.sort((a, b) => b.score - a.score);
      const bestScore = scores[0].score;
      history.push(bestScore);
      console.log(`[GeneticOptimizer] Gen ${gen + 1}: best = ${bestScore.toFixed(3)}`);

      // Select top 50%
      const survivors = scores.slice(0, Math.ceil(scores.length / 2));

      // Breed next generation
      population = [
        ...survivors,
        ...this.breed(survivors, this.populationSize - survivors.length),
      ];
    }

    population.sort((a, b) => b.score - a.score);
    return {
      bestPrompt: population[0].prompt,
      bestScore: population[0].score,
      history,
    };
  }

  private initPopulation(basePrompt: string): PromptVariant[] {
    const population: PromptVariant[] = [
      { id: 'base', prompt: basePrompt, score: 0, generation: 0 },
    ];

    for (let i = 1; i < this.populationSize; i++) {
      population.push({
        id: `v${i}`,
        prompt: this.mutate(basePrompt),
        score: 0,
        generation: 0,
      });
    }

    return population;
  }

  private mutate(prompt: string): string {
    const mutations = [
      (p: string) => p + '\nThink step by step before answering.',
      (p: string) => p + '\nAlways show your reasoning process.',
      (p: string) => 'You are a world-class expert. ' + p,
      (p: string) => p + '\nBe concise but thorough.',
      (p: string) => p + '\nConsider edge cases and failure modes.',
      (p: string) => p.replace('You are', 'You are a meticulous'),
      (p: string) => p + '\nVerify your answer before responding.',
      (p: string) => 'IMPORTANT: ' + p,
    ];

    if (Math.random() < this.mutationRate) {
      const mutation = mutations[Math.floor(Math.random() * mutations.length)];
      return mutation(prompt);
    }
    return prompt;
  }

  private breed(survivors: PromptVariant[], count: number): PromptVariant[] {
    const children: PromptVariant[] = [];

    for (let i = 0; i < count; i++) {
      const p1 = survivors[Math.floor(Math.random() * survivors.length)];
      const p2 = survivors[Math.floor(Math.random() * survivors.length)];
      const child = this.crossbreed(p1.prompt, p2.prompt);
      children.push({
        id: `child_${i}`,
        prompt: this.mutate(child),
        score: 0,
        generation: p1.generation + 1,
      });
    }

    return children;
  }

  private crossbreed(p1: string, p2: string): string {
    const sentences1 = p1.split('. ');
    const sentences2 = p2.split('. ');
    const mid = Math.floor(sentences1.length / 2);
    return sentences1.slice(0, mid).concat(sentences2.slice(mid)).join('. ');
  }
}

/**
 * Eval Harness — Weekly automated quality measurement
 *
 * Runs 50 real tasks from your actual use case.
 * Measures: success rate, token efficiency, latency.
 * Reports: which free model is best for YOUR specific tasks.
 * Action: Updates routing table based on results.
 */
export class EvalHarness {
  private results: EvalResult[] = [];

  /**
   * Run evaluation across providers for a set of tasks
   */
  async evaluate(
    providers: { name: string; model: string; callFn: (task: string) => Promise<{ success: boolean; quality: number; tokens: number }> }[],
    tasks: string[]
  ): Promise<Record<string, { successRate: number; avgQuality: number; avgTokens: number; avgLatency: number }>> {
    const report: Record<string, { successRate: number; avgQuality: number; avgTokens: number; avgLatency: number }> = {};

    for (const provider of providers) {
      const providerResults: EvalResult[] = [];

      for (const task of tasks) {
        const start = Date.now();
        try {
          const result = await provider.callFn(task);
          providerResults.push({
            provider: provider.name,
            model: provider.model,
            task,
            success: result.success,
            quality: result.quality,
            tokensUsed: result.tokens,
            latencyMs: Date.now() - start,
            timestamp: Date.now(),
          });
        } catch {
          providerResults.push({
            provider: provider.name,
            model: provider.model,
            task,
            success: false,
            quality: 0,
            tokensUsed: 0,
            latencyMs: Date.now() - start,
            timestamp: Date.now(),
          });
        }
      }

      this.results.push(...providerResults);

      const successes = providerResults.filter(r => r.success);
      report[provider.name] = {
        successRate: successes.length / providerResults.length,
        avgQuality: providerResults.reduce((s, r) => s + r.quality, 0) / providerResults.length,
        avgTokens: providerResults.reduce((s, r) => s + r.tokensUsed, 0) / providerResults.length,
        avgLatency: providerResults.reduce((s, r) => s + r.latencyMs, 0) / providerResults.length,
      };
    }

    // Print report
    console.log('\n📊 MiForge Eval Report');
    console.log('━'.repeat(60));
    for (const [name, metrics] of Object.entries(report)) {
      console.log(`  ${name}:`);
      console.log(`    Success: ${(metrics.successRate * 100).toFixed(1)}%  Quality: ${(metrics.avgQuality * 100).toFixed(1)}%`);
      console.log(`    Tokens: ${Math.round(metrics.avgTokens)}  Latency: ${Math.round(metrics.avgLatency)}ms`);
    }

    return report;
  }

  /**
   * Get recommendation for routing table update
   */
  getRecommendation(): { bestOverall: string; bestSpeed: string; bestQuality: string } | null {
    if (this.results.length === 0) return null;

    const byProvider = new Map<string, EvalResult[]>();
    for (const r of this.results) {
      const existing = byProvider.get(r.provider) || [];
      existing.push(r);
      byProvider.set(r.provider, existing);
    }

    let bestOverall = '';
    let bestScore = 0;
    let bestSpeed = '';
    let bestLatency = Infinity;
    let bestQuality = '';
    let bestQualityScore = 0;

    for (const [name, results] of byProvider) {
      const avgQuality = results.reduce((s, r) => s + r.quality, 0) / results.length;
      const avgLatency = results.reduce((s, r) => s + r.latencyMs, 0) / results.length;
      const successRate = results.filter(r => r.success).length / results.length;
      const combined = avgQuality * 0.6 + successRate * 0.4;

      if (combined > bestScore) { bestScore = combined; bestOverall = name; }
      if (avgLatency < bestLatency) { bestLatency = avgLatency; bestSpeed = name; }
      if (avgQuality > bestQualityScore) { bestQualityScore = avgQuality; bestQuality = name; }
    }

    return { bestOverall, bestSpeed, bestQuality };
  }
}

export const promptOptimizer = new GeneticPromptOptimizer();
export const evalHarness = new EvalHarness();
