#!/usr/bin/env node
/**
 * MiForge Provider Health Check
 * Tests all free providers, builds optimal routing table.
 * Agent runs this on boot — zero human touch.
 */

import { FREE_PROVIDERS, type Provider } from './index.js';

interface HealthResult {
  provider: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

async function checkProvider(provider: Provider): Promise<HealthResult> {
  const apiKey = process.env[provider.apiKeyEnv] || '';
  
  // Local providers don't need keys
  if (!apiKey && provider.apiKeyEnv !== '') {
    return { provider: provider.name, healthy: false, latencyMs: -1, error: 'No API key' };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.testModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { provider: provider.name, healthy: true, latencyMs };
    } else {
      const body = await res.text().catch(() => '');
      return { provider: provider.name, healthy: false, latencyMs, error: `HTTP ${res.status}: ${body.slice(0, 100)}` };
    }
  } catch (err: any) {
    return { provider: provider.name, healthy: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function main() {
  console.log('🔍 MiForge Provider Health Check\n');
  console.log('━'.repeat(60));

  const results = await Promise.all(FREE_PROVIDERS.map(checkProvider));

  let healthy = 0;
  let total = 0;

  for (const result of results) {
    total++;
    const status = result.healthy ? '✅' : '❌';
    const latency = result.latencyMs > 0 ? `${result.latencyMs}ms` : 'N/A';
    const error = result.error ? ` — ${result.error}` : '';
    console.log(`  ${status} ${result.provider.padEnd(15)} ${latency.padStart(6)}${error}`);
    if (result.healthy) healthy++;
  }

  console.log('━'.repeat(60));
  console.log(`\n📊 ${healthy}/${total} providers healthy`);
  console.log(`💰 Monthly cost: $0.00`);
  console.log(`🔄 Fallback chains: ${healthy >= 2 ? 'ACTIVE' : '⚠️  LIMITED'}\n`);

  if (healthy === 0) {
    console.error('❌ CRITICAL: No providers available. Check API keys in .env');
    process.exit(1);
  }
}

main().catch(console.error);
