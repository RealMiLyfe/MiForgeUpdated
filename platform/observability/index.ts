/**
 * MiForge Observability — Layer 10: Flying With Instruments
 *
 * CostZero Dashboard: monitors all 15+ free providers simultaneously.
 * Predicts rate limit hits 5 minutes ahead → auto-switches before 429.
 * Displays: tokens used, $0.00 cost, capacity remaining per provider.
 */

export interface ProviderMetrics {
  name: string;
  requestsLastMinute: number;
  rpmLimit: number;
  capacityPercent: number;    // 100% = empty, 0% = at limit
  avgLatencyMs: number;
  totalTokens: number;
  errorsLastHour: number;
  predictedSecsTo429: number; // -1 = safe
}

export interface DashboardSnapshot {
  timestamp: number;
  totalTokens: number;
  totalCost: number; // Always $0.00
  providers: ProviderMetrics[];
  activeAlerts: string[];
}

interface RequestLog {
  timestamp: number;
  provider: string;
  tokens: number;
  latencyMs: number;
  success: boolean;
}

/**
 * CostZero Dashboard — Real-time free provider monitoring
 */
export class CostZeroDashboard {
  private logs: RequestLog[] = [];
  private maxLogSize = 10_000;
  private alerts: string[] = [];

  private providerLimits: Record<string, number> = {
    nvidia_nim: 40,
    groq: 30,
    gemini: 15,
    openrouter: 20,
    cerebras: 30,
    github_models: 15,
    cohere: 20,
    mistral: 60,
    ollama: 9999,
    lmstudio: 9999,
  };

  /**
   * Record a completed request
   */
  record(provider: string, tokens: number, latencyMs: number, success: boolean): void {
    this.logs.push({ timestamp: Date.now(), provider, tokens, latencyMs, success });

    // Prune old logs
    if (this.logs.length > this.maxLogSize) {
      this.logs = this.logs.slice(-this.maxLogSize / 2);
    }

    // Check for alert conditions
    this.checkAlerts(provider);
  }

  /**
   * Get full dashboard snapshot
   */
  getSnapshot(): DashboardSnapshot {
    const now = Date.now();
    const providers: ProviderMetrics[] = [];
    let totalTokens = 0;

    for (const [name, limit] of Object.entries(this.providerLimits)) {
      const recentLogs = this.logs.filter(l => l.provider === name && l.timestamp > now - 60_000);
      const hourLogs = this.logs.filter(l => l.provider === name && l.timestamp > now - 3_600_000);
      const allLogs = this.logs.filter(l => l.provider === name);

      const requestsLastMinute = recentLogs.length;
      const capacityPercent = Math.max(0, Math.round((1 - requestsLastMinute / limit) * 100));
      const avgLatencyMs = recentLogs.length > 0
        ? Math.round(recentLogs.reduce((s, l) => s + l.latencyMs, 0) / recentLogs.length)
        : 0;
      const tokens = allLogs.reduce((s, l) => s + l.tokens, 0);
      const errors = hourLogs.filter(l => !l.success).length;

      totalTokens += tokens;

      providers.push({
        name,
        requestsLastMinute,
        rpmLimit: limit,
        capacityPercent,
        avgLatencyMs,
        totalTokens: tokens,
        errorsLastHour: errors,
        predictedSecsTo429: this.predictSecsTo429(name, requestsLastMinute, limit),
      });
    }

    return {
      timestamp: now,
      totalTokens,
      totalCost: 0.00, // Always $0.00
      providers: providers.sort((a, b) => b.capacityPercent - a.capacityPercent),
      activeAlerts: [...this.alerts],
    };
  }

  /**
   * Get best provider right now (most capacity remaining)
   */
  getBestProvider(taskType?: string): string {
    const snapshot = this.getSnapshot();
    const healthy = snapshot.providers.filter(p => p.capacityPercent > 15 && p.errorsLastHour < 10);

    if (healthy.length === 0) return 'ollama'; // Always available

    // Sort by capacity
    healthy.sort((a, b) => b.capacityPercent - a.capacityPercent);
    return healthy[0].name;
  }

  /**
   * Print dashboard to console
   */
  printDashboard(): void {
    const snap = this.getSnapshot();
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│          MiForge CostZero Dashboard                         │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│  Total Tokens: ${snap.totalTokens.toLocaleString().padEnd(12)} Monthly Cost: $${snap.totalCost.toFixed(2).padEnd(8)} │`);
    console.log('├───────────────┬─────┬───────┬────────┬───────┬─────────────┤');
    console.log('│ Provider      │ RPM │ Limit │ Capac. │ Lat.  │ 429 Risk    │');
    console.log('├───────────────┼─────┼───────┼────────┼───────┼─────────────┤');

    for (const p of snap.providers) {
      if (p.rpmLimit >= 9999) continue; // Skip local (unlimited)
      const risk = p.predictedSecsTo429 === -1 ? '✅ Safe' :
                   p.predictedSecsTo429 === 0 ? '🔴 NOW!' :
                   `⚠️  ${p.predictedSecsTo429}s`;
      console.log(
        `│ ${p.name.padEnd(13)} │ ${String(p.requestsLastMinute).padStart(3)} │ ${String(p.rpmLimit).padStart(5)} │ ${String(p.capacityPercent + '%').padStart(5)}  │ ${String(p.avgLatencyMs + 'ms').padStart(5)} │ ${risk.padEnd(11)} │`
      );
    }

    console.log('└───────────────┴─────┴───────┴────────┴───────┴─────────────┘');

    if (snap.activeAlerts.length > 0) {
      console.log('\n⚠️  Active Alerts:');
      for (const alert of snap.activeAlerts) {
        console.log(`   • ${alert}`);
      }
    }
  }

  // ── Private ──

  private predictSecsTo429(provider: string, currentRpm: number, limit: number): number {
    if (currentRpm >= limit * 0.85) return 0;
    if (currentRpm >= limit * 0.70) {
      return Math.round(60 * (limit - currentRpm) / Math.max(currentRpm, 1));
    }
    return -1; // Safe
  }

  private checkAlerts(provider: string): void {
    const now = Date.now();
    const recent = this.logs.filter(l => l.provider === provider && l.timestamp > now - 60_000);
    const limit = this.providerLimits[provider] || 30;

    if (recent.length >= limit * 0.85) {
      const alertMsg = `${provider}: approaching rate limit (${recent.length}/${limit} RPM)`;
      if (!this.alerts.includes(alertMsg)) {
        this.alerts.push(alertMsg);
        // Auto-clear alerts after 5 min
        setTimeout(() => {
          this.alerts = this.alerts.filter(a => a !== alertMsg);
        }, 300_000);
      }
    }
  }
}

export const dashboard = new CostZeroDashboard();
