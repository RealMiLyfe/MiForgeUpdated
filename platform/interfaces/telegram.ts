/**
 * MiForge Interface: Telegram Bot
 *
 * Dual-purpose:
 *   1. USER INTERFACE — Chat with MiForge AI via Telegram
 *   2. SAFETY GATE — Receives approval requests from the 7 Sacred Gates
 *
 * Setup:
 *   1. Create bot via @BotFather on Telegram
 *   2. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env
 *   3. Run: npx tsx interfaces/telegram.ts
 *
 * Dependencies: npm install node-telegram-bot-api
 * License: MIT
 */

import { FREE_PROVIDERS } from '../providers/index.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TelegramBotConfig {
  /** Telegram bot token from @BotFather */
  token?: string;
  /** Admin chat ID(s) for safety gate approvals */
  adminChatIds?: string[];
  /** LLM provider */
  llmProvider?: string;
  /** LLM model */
  llmModel?: string;
  /** System prompt */
  systemPrompt?: string;
  /** Whether to accept messages from anyone (false = admin only) */
  publicAccess?: boolean;
}

export interface ApprovalRequest {
  id: string;
  gate: number;
  reason: string;
  action: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM BOT
// ═══════════════════════════════════════════════════════════════

export class MiForgeTelegramBot {
  private config: Required<TelegramBotConfig>;
  private conversationHistory: Map<string, { role: string; content: string }[]> = new Map();
  private pendingApprovals: Map<string, { resolve: (approved: boolean) => void; request: ApprovalRequest }> = new Map();

  constructor(config?: TelegramBotConfig) {
    this.config = {
      token: config?.token || process.env.TELEGRAM_BOT_TOKEN || '',
      adminChatIds: config?.adminChatIds || (process.env.TELEGRAM_CHAT_ID ? [process.env.TELEGRAM_CHAT_ID] : []),
      llmProvider: config?.llmProvider || 'nvidia_nim',
      llmModel: config?.llmModel || 'nvidia/nemotron-3-super-120b-a12b',
      systemPrompt: config?.systemPrompt || 'You are MiForge, an AI assistant on Telegram. Be helpful and concise.',
      publicAccess: config?.publicAccess ?? false,
    };
  }

  /**
   * Start the Telegram bot (polling mode)
   */
  async start(): Promise<void> {
    if (!this.config.token) {
      console.error('[Telegram] No TELEGRAM_BOT_TOKEN set. Add it to .env');
      return;
    }

    const TelegramBot = (await import('node-telegram-bot-api')).default;
    const bot = new TelegramBot(this.config.token, { polling: true });

    console.log('[Telegram] Bot starting...');

    bot.on('message', async (msg) => {
      const chatId = String(msg.chat.id);
      const text = msg.text?.trim();
      if (!text) return;

      // Access control
      if (!this.config.publicAccess && !this.config.adminChatIds.includes(chatId)) {
        await bot.sendMessage(Number(chatId), '⛔ Access denied. This bot is admin-only.');
        return;
      }

      // Check for approval responses (YES/NO)
      if (this.config.adminChatIds.includes(chatId)) {
        const upperText = text.toUpperCase();
        if (upperText === 'YES' || upperText === 'NO') {
          const handled = this.handleApprovalResponse(upperText === 'YES');
          if (handled) {
            await bot.sendMessage(Number(chatId), upperText === 'YES' ? '✅ Approved.' : '❌ Blocked.');
            return;
          }
        }
      }

      // Handle commands
      if (text === '/start') {
        await bot.sendMessage(Number(chatId), '🔨 MiForge AI is ready. Send any message to chat.\n\nCommands:\n/clear — Reset conversation\n/status — Platform status');
        return;
      }

      if (text === '/clear') {
        this.conversationHistory.delete(chatId);
        await bot.sendMessage(Number(chatId), '🧹 Conversation cleared.');
        return;
      }

      if (text === '/status') {
        await bot.sendMessage(Number(chatId),
          `📊 MiForge Status\n` +
          `Provider: ${this.config.llmProvider}\n` +
          `Model: ${this.config.llmModel}\n` +
          `Pending approvals: ${this.pendingApprovals.size}\n` +
          `Cost: $0.00`
        );
        return;
      }

      // Chat with LLM
      await bot.sendChatAction(Number(chatId), 'typing');

      const history = this.conversationHistory.get(chatId) || [];
      history.push({ role: 'user', content: text });
      while (history.length > 20) history.shift();
      this.conversationHistory.set(chatId, history);

      const response = await this.callLLM(history);
      history.push({ role: 'assistant', content: response });

      await bot.sendMessage(Number(chatId), response, { parse_mode: 'Markdown' }).catch(async () => {
        // Fallback without Markdown if it fails
        await bot.sendMessage(Number(chatId), response);
      });
    });

    console.log('[Telegram] Bot online. Listening for messages...');
  }

  /**
   * Send a safety gate approval request to admin
   * Returns a Promise that resolves when admin responds YES/NO
   */
  async requestApproval(request: ApprovalRequest): Promise<boolean> {
    if (!this.config.token || this.config.adminChatIds.length === 0) {
      console.warn('[Telegram] No admin configured — auto-denying approval');
      return false;
    }

    const message = [
      `🔴 *MiForge Safety Gate ${request.gate}*`,
      ``,
      `*Reason:* ${request.reason}`,
      `*Action:* \`${request.action.slice(0, 200)}\``,
      `*Time:* ${new Date(request.timestamp).toISOString()}`,
      ``,
      `Reply *YES* to approve or *NO* to block.`,
    ].join('\n');

    // Send to all admins
    const TelegramBot = (await import('node-telegram-bot-api')).default;
    const bot = new TelegramBot(this.config.token, { polling: false });

    for (const adminId of this.config.adminChatIds) {
      await bot.sendMessage(Number(adminId), message, { parse_mode: 'Markdown' }).catch(console.warn);
    }

    // Wait for response (timeout = 5 minutes)
    return new Promise<boolean>((resolve) => {
      this.pendingApprovals.set(request.id, { resolve, request });

      // Auto-deny after timeout
      setTimeout(() => {
        if (this.pendingApprovals.has(request.id)) {
          this.pendingApprovals.delete(request.id);
          resolve(false); // Timeout = deny (safe default)
        }
      }, 300_000); // 5 minutes
    });
  }

  // ── Private ──

  private handleApprovalResponse(approved: boolean): boolean {
    // Resolve the oldest pending approval
    const [firstKey, firstValue] = this.pendingApprovals.entries().next().value || [];
    if (!firstKey || !firstValue) return false;

    firstValue.resolve(approved);
    this.pendingApprovals.delete(firstKey);
    return true;
  }

  private async callLLM(history: { role: string; content: string }[]): Promise<string> {
    const provider = FREE_PROVIDERS.find(p => p.name === this.config.llmProvider);
    if (!provider) return 'Error: Provider not configured.';

    const apiKey = process.env[provider.apiKeyEnv] || '';

    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.llmModel,
          messages: [
            { role: 'system', content: this.config.systemPrompt },
            ...history.slice(-10),
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) return `Error: LLM returned ${res.status}.`;

      const data = await res.json() as any;
      return data.choices?.[0]?.message?.content || 'No response.';
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }
}

export const telegramBot = new MiForgeTelegramBot();
