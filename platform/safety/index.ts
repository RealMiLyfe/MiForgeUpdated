/**
 * MiForge Safety Layer — Layer 9: The 7 Sacred Human Gates
 *
 * Universal safety wrapper for ALL agent actions across ALL harnesses.
 * Works with: Claude Code, Aider, OpenHands, Goose, Cline, any agent.
 *
 * RULE: Humans only touch 7 gates. Everything else is autonomous.
 */

export enum Gate {
  IRREVERSIBLE_ACTION = 1,
  CREDENTIALS = 2,
  NOVEL_SITUATION = 3,
  MULTI_AGENT_CONFLICT = 4,
  LEGAL_COMPLIANCE = 5,
  QUALITY_THRESHOLD = 6,
  SELF_MODIFICATION = 7,
}

export interface GateDecision {
  gate: Gate;
  reason: string;
  action: string;
  approved: boolean;
  timestamp: number;
  decidedBy: 'human' | 'auto';
}

export interface SafetyConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
  approvalTimeoutMs?: number;
  autoApproveBelow?: Gate; // Auto-approve gates below this number (for dev mode)
}

/**
 * Keywords that trigger Gate 1: Irreversible Actions
 */
const IRREVERSIBLE_KEYWORDS = [
  'delete', 'drop', 'rm -rf', 'git push', 'deploy',
  'send_email', 'charge', 'payment', 'publish',
  'kubectl delete', 'terraform destroy', 'merge',
  'force push', 'truncate', 'format',
];

/**
 * Patterns that trigger Gate 5: PII/Legal
 */
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,              // SSN
  /\b4[0-9]{12}(?:[0-9]{3})?\b/,        // Visa
  /\b5[1-5][0-9]{14}\b/,                 // Mastercard
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email (sensitive context)
];

/**
 * The Safety Wrapper — checks every action before execution
 */
export class SafetyGateway {
  private config: SafetyConfig;
  private decisionLog: GateDecision[] = [];

  constructor(config?: SafetyConfig) {
    this.config = {
      telegramBotToken: config?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: config?.telegramChatId || process.env.TELEGRAM_CHAT_ID,
      approvalTimeoutMs: config?.approvalTimeoutMs || 300_000, // 5 min
      autoApproveBelow: config?.autoApproveBelow,
    };
  }

  /**
   * Check if an action is safe to execute
   * Returns: { safe: true } or { safe: false, gate, reason }
   */
  async checkAction(action: string, context?: Record<string, unknown>): Promise<{
    safe: boolean;
    gate?: Gate;
    reason?: string;
  }> {
    const actionLower = action.toLowerCase();

    // Gate 1: Irreversible actions
    for (const keyword of IRREVERSIBLE_KEYWORDS) {
      if (actionLower.includes(keyword)) {
        return { safe: false, gate: Gate.IRREVERSIBLE_ACTION, reason: `Irreversible action detected: "${keyword}"` };
      }
    }

    // Gate 5: PII detection
    for (const pattern of PII_PATTERNS) {
      if (pattern.test(action)) {
        return { safe: false, gate: Gate.LEGAL_COMPLIANCE, reason: 'PII detected in action payload' };
      }
    }

    // Gate 6: Quality threshold (if confidence provided)
    if (context?.confidence && (context.confidence as number) < 0.70) {
      return { safe: false, gate: Gate.QUALITY_THRESHOLD, reason: `Low confidence: ${context.confidence}` };
    }

    // Gate 7: Self-modification
    if (actionLower.includes('modify_routing') || actionLower.includes('change_memory_rules') || actionLower.includes('update_safety_config')) {
      return { safe: false, gate: Gate.SELF_MODIFICATION, reason: 'Agent attempting self-modification' };
    }

    return { safe: true };
  }

  /**
   * Request human approval for a blocked action.
   * Sends Telegram notification and polls for YES/NO response.
   * Times out after approvalTimeoutMs (default 5 min) → auto-deny.
   */
  async requestApproval(gate: Gate, reason: string, action: string): Promise<boolean> {
    // Dev mode: auto-approve certain gates
    if (this.config.autoApproveBelow && gate < this.config.autoApproveBelow) {
      this.logDecision(gate, reason, action, true, 'auto');
      return true;
    }

    const message = [
      `🔴 MiForge Safety Gate ${gate} Triggered`,
      ``,
      `Reason: ${reason}`,
      `Action: ${action.slice(0, 200)}`,
      ``,
      `Reply YES to approve, NO to block.`,
    ].join('\n');

    // Notify via Telegram + poll for response
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      const sentMsg = await this.sendTelegram(message);
      if (sentMsg) {
        const approved = await this.pollTelegramResponse(sentMsg.messageId);
        this.logDecision(gate, reason, action, approved, 'human');
        await this.persistAuditLog();
        return approved;
      }
    }

    // Console fallback (for dev/CI environments without Telegram)
    console.log('\n' + '═'.repeat(60));
    console.log(message);
    console.log('═'.repeat(60));
    console.log('[Safety] No Telegram configured — auto-denying (safe default)\n');

    this.logDecision(gate, reason, action, false, 'auto');
    await this.persistAuditLog();
    return false;
  }

  /**
   * Get full audit log
   */
  getAuditLog(): GateDecision[] {
    return [...this.decisionLog];
  }

  /**
   * Get gate statistics
   */
  getStats(): Record<string, { triggered: number; approved: number; blocked: number }> {
    const stats: Record<string, { triggered: number; approved: number; blocked: number }> = {};
    
    for (const gate of Object.values(Gate).filter(v => typeof v === 'number') as Gate[]) {
      const gateDecisions = this.decisionLog.filter(d => d.gate === gate);
      const name = Gate[gate];
      stats[name] = {
        triggered: gateDecisions.length,
        approved: gateDecisions.filter(d => d.approved).length,
        blocked: gateDecisions.filter(d => !d.approved).length,
      };
    }

    return stats;
  }

  // ── Private ──

  private logDecision(gate: Gate, reason: string, action: string, approved: boolean, decidedBy: 'human' | 'auto'): void {
    this.decisionLog.push({
      gate,
      reason,
      action: action.slice(0, 500),
      approved,
      timestamp: Date.now(),
      decidedBy,
    });
  }

  private async sendTelegram(message: string): Promise<{ messageId: number } | null> {
    const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.telegramChatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });
      if (res.ok) {
        const data = await res.json() as { result: { message_id: number } };
        return { messageId: data.result.message_id };
      }
    } catch (err) {
      console.error('[Safety] Telegram notification failed:', err);
    }
    return null;
  }

  /**
   * Poll Telegram for a YES/NO reply after our message.
   * Checks every 5s for up to approvalTimeoutMs.
   */
  private async pollTelegramResponse(afterMessageId: number): Promise<boolean> {
    const timeout = this.config.approvalTimeoutMs || 300_000;
    const interval = 5_000; // 5s polling
    const start = Date.now();
    let offset = 0;

    while (Date.now() - start < timeout) {
      try {
        const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/getUpdates?offset=${offset}&timeout=4`;
        const res = await fetch(url);
        if (!res.ok) break;

        const data = await res.json() as { result: { update_id: number; message?: { text?: string; chat?: { id: number }; message_id: number } }[] };

        for (const update of data.result || []) {
          offset = update.update_id + 1;
          const msg = update.message;
          if (!msg || !msg.text) continue;
          if (String(msg.chat?.id) !== this.config.telegramChatId) continue;
          if (msg.message_id <= afterMessageId) continue;

          const text = msg.text.trim().toUpperCase();
          if (text === 'YES') return true;
          if (text === 'NO') return false;
        }
      } catch { /* network error — continue polling */ }

      await new Promise(r => setTimeout(r, interval));
    }

    // Timeout = deny (safe default)
    console.log('[Safety] Telegram approval timed out — denying.');
    return false;
  }

  /**
   * Persist audit log to disk (JSON lines format)
   */
  private async persistAuditLog(): Promise<void> {
    try {
      const { appendFileSync, mkdirSync } = await import('fs');
      const { join } = await import('path');
      const logDir = join(process.cwd(), 'logs');
      mkdirSync(logDir, { recursive: true });
      const logPath = join(logDir, 'safety-audit.jsonl');
      const lastEntry = this.decisionLog[this.decisionLog.length - 1];
      if (lastEntry) {
        appendFileSync(logPath, JSON.stringify(lastEntry) + '\n');
      }
    } catch { /* best effort — non-critical */ }
  }
}

/**
 * Decorator-style wrapper for safe execution
 */
export async function safeExecute<T>(
  action: string,
  fn: () => Promise<T>,
  gateway?: SafetyGateway,
  context?: Record<string, unknown>
): Promise<{ result?: T; blocked?: boolean; gate?: Gate; reason?: string }> {
  const safety = gateway || new SafetyGateway();
  const check = await safety.checkAction(action, context);

  if (!check.safe) {
    const approved = await safety.requestApproval(check.gate!, check.reason!, action);
    if (!approved) {
      return { blocked: true, gate: check.gate, reason: check.reason };
    }
  }

  const result = await fn();
  return { result };
}

export const safetyGateway = new SafetyGateway();
