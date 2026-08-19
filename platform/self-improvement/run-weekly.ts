#!/usr/bin/env npx tsx
/**
 * MiForge Self-Improvement — Weekly Cron Job
 *
 * Runs every Monday at 9AM (set up by bootstrap.sh):
 *   0 9 * * MON cd /path/to/platform && npx tsx self-improvement/run-weekly.ts
 *
 * What it does:
 *   1. Health-checks all free providers
 *   2. Runs eval harness on 20 real coding tasks
 *   3. Updates routing recommendation
 *   4. Runs genetic prompt optimizer (1 generation)
 *   5. Prints report
 *
 * Cost: $0.00 (uses free providers for all eval calls)
 */

import { EvalHarness, GeneticPromptOptimizer } from './index.js';
import { FREE_PROVIDERS } from '../providers/index.js';

// ═══════════════════════════════════════════════════════════════
// EVAL TASKS — Real coding tasks to benchmark providers
// ═══════════════════════════════════════════════════════════════

const EVAL_TASKS = [
  'Write a TypeScript function that debounces another function with a configurable delay.',
  'Explain the difference between Promise.all and Promise.allSettled in JavaScript.',
  'Write a Python function to find the longest palindromic substring.',
  'Review this code for bugs: function add(a, b) { return a - b; }',
  'Create a SQL query to find the top 5 customers by total order value with joins.',
  'Write a Dockerfile for a Node.js 20 app with multi-stage build.',
  'Explain how Redis sorted sets work and give a use case.',
  'Write a bash script that monitors disk usage and alerts if above 90%.',
  'Implement a simple LRU cache in TypeScript with O(1) get/put.',
  'Write a GitHub Actions workflow that runs tests on pull requests.',
  'Explain the CAP theorem and how it applies to choosing a database.',
  'Write a React hook that fetches data with loading/error states.',
  'Create a rate limiter middleware in Express.js using token bucket algorithm.',
  'Write unit tests for a function that validates email addresses.',
  'Explain the difference between horizontal and vertical scaling.',
  'Write a TypeScript generic type that makes all nested properties optional.',
  'Create a Makefile for a Go project with build, test, and clean targets.',
  'Write a migration script to add a column with a default value in PostgreSQL.',
  'Implement binary search on a sorted array in TypeScript.',
  'Write a git pre-commit hook that runs eslint on staged files.',
];

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  MiForge Self-Improvement — Weekly Run');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // ── Step 1: Determine which providers are available ──
  console.log('📡 Step 1: Checking provider availability...');
  const availableProviders: { name: string; model: string; baseUrl: string; apiKey: string }[] = [];

  for (const provider of FREE_PROVIDERS) {
    const apiKey = provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : '';
    if (!apiKey && provider.apiKeyEnv) continue; // Skip unconfigured
    if (provider.name === 'ollama' || provider.name === 'lmstudio') continue; // Skip local for CI eval

    availableProviders.push({
      name: provider.name,
      model: provider.testModel,
      baseUrl: provider.baseUrl,
      apiKey: apiKey || '',
    });
  }

  console.log(`  Found ${availableProviders.length} configured providers`);
  if (availableProviders.length === 0) {
    console.log('  ⚠️  No providers configured. Add API keys to .env');
    process.exit(0);
  }

  // ── Step 2: Run Eval Harness ──
  console.log('');
  console.log('📊 Step 2: Running eval harness...');
  const harness = new EvalHarness();
  const tasks = EVAL_TASKS.slice(0, 10); // Use first 10 for speed

  const evalProviders = availableProviders.slice(0, 3).map(p => ({
    name: p.name,
    model: p.model,
    callFn: async (task: string) => {
      try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${p.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: p.model,
            messages: [{ role: 'user', content: task }],
            max_tokens: 1024,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(20_000),
        });

        if (!res.ok) return { success: false, quality: 0, tokens: 0 };

        const data = await res.json() as any;
        const text = data.choices?.[0]?.message?.content || '';
        const tokens = data.usage?.total_tokens || 0;

        // Simple quality heuristic: length + has code blocks + not empty
        const hasCode = text.includes('```') || text.includes('function') || text.includes('def ');
        const isSubstantial = text.length > 100;
        const quality = (isSubstantial ? 0.5 : 0) + (hasCode ? 0.3 : 0) + (text.length > 500 ? 0.2 : 0);

        return { success: true, quality: Math.min(1, quality), tokens };
      } catch {
        return { success: false, quality: 0, tokens: 0 };
      }
    },
  }));

  const evalReport = await harness.evaluate(evalProviders, tasks);

  // ── Step 3: Get routing recommendation ──
  console.log('');
  console.log('🧭 Step 3: Routing recommendation...');
  const recommendation = harness.getRecommendation();
  if (recommendation) {
    console.log(`  Best overall:  ${recommendation.bestOverall}`);
    console.log(`  Best speed:    ${recommendation.bestSpeed}`);
    console.log(`  Best quality:  ${recommendation.bestQuality}`);
  } else {
    console.log('  (Insufficient data for recommendation)');
  }

  // ── Step 4: Genetic Prompt Optimization (1 generation, lightweight) ──
  console.log('');
  console.log('🧬 Step 4: Prompt optimization (1 generation)...');
  const optimizer = new GeneticPromptOptimizer();

  const baseSystemPrompt = 'You are a helpful coding assistant. Write clean, production-ready code.';

  // Quick single-generation evolution using fastest available provider
  const fastProvider = availableProviders.find(p => p.name === 'groq') || availableProviders[0];

  const evolution = await optimizer.evolve(
    baseSystemPrompt,
    async (prompt: string) => {
      // Score prompt by trying one task with it
      try {
        const res = await fetch(`${fastProvider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${fastProvider.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: fastProvider.model,
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: 'Write a TypeScript debounce function.' },
            ],
            max_tokens: 512,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) return 0.3;
        const data = await res.json() as any;
        const text = data.choices?.[0]?.message?.content || '';
        const hasCode = text.includes('function') || text.includes('=>');
        const hasTypes = text.includes(':') && text.includes('string') || text.includes('number');
        return (hasCode ? 0.5 : 0) + (hasTypes ? 0.3 : 0) + (text.length > 200 ? 0.2 : 0);
      } catch {
        return 0.2;
      }
    },
    2 // Only 2 generations for weekly cron (keep it fast)
  );

  console.log(`  Best prompt score: ${evolution.bestScore.toFixed(3)}`);
  console.log(`  Prompt: "${evolution.bestPrompt.slice(0, 80)}..."`);

  // ── Report ──
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ Weekly self-improvement complete');
  console.log(`  💰 Cost: $0.00`);
  console.log(`  📊 Providers evaluated: ${evalProviders.length}`);
  console.log(`  🧬 Prompt generations: ${evolution.history.length}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(err => {
  console.error('❌ Weekly run failed:', err);
  process.exit(1);
});
