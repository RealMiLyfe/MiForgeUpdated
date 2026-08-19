/**
 * MiForge Interface: Discord Bot
 *
 * Connects MiForge AI to a Discord server. Routes messages through
 * the free provider stack (LiteLLM proxy or direct NVIDIA NIM).
 *
 * Setup:
 *   1. Create bot at https://discord.com/developers/applications
 *   2. Enable Message Content Intent
 *   3. Add DISCORD_BOT_TOKEN to .env
 *   4. Run: npx tsx interfaces/discord.ts
 *
 * Dependencies: npm install discord.js
 * License: MIT (discord.js is Apache-2.0)
 */

import { FREE_PROVIDERS } from '../providers/index.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DiscordBotConfig {
  /** Discord bot token */
  token?: string;
  /** Channel IDs to respond in (empty = all channels) */
  channelIds?: string[];
  /** Bot prefix (default: !forge) */
  prefix?: string;
  /** LLM provider to use */
  llmProvider?: string;
  /** LLM model */
  llmModel?: string;
  /** System prompt */
  systemPrompt?: string;
  /** Max response length (Discord limit: 2000 chars) */
  maxLength?: number;
}

// ═══════════════════════════════════════════════════════════════
// DISCORD BOT
// ═══════════════════════════════════════════════════════════════

export class MiForgeDiscordBot {
  private config: Required<DiscordBotConfig>;
  private conversationHistory: Map<string, { role: string; content: string }[]> = new Map();

  constructor(config?: DiscordBotConfig) {
    this.config = {
      token: config?.token || process.env.DISCORD_BOT_TOKEN || '',
      channelIds: config?.channelIds || [],
      prefix: config?.prefix || '!forge',
      llmProvider: config?.llmProvider || 'nvidia_nim',
      llmModel: config?.llmModel || 'nvidia/nemotron-3-super-120b-a12b',
      systemPrompt: config?.systemPrompt || 'You are MiForge, an AI assistant on Discord. Be helpful, concise, and friendly. Keep responses under 1500 characters.',
      maxLength: config?.maxLength || 1900,
    };
  }

  /**
   * Start the Discord bot
   */
  async start(): Promise<void> {
    if (!this.config.token) {
      console.error('[Discord] No DISCORD_BOT_TOKEN set. Add it to .env');
      return;
    }

    // Dynamic import — only loads discord.js when actually starting
    const { Client, GatewayIntentBits } = await import('discord.js');

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    client.on('ready', () => {
      console.log(`[Discord] Bot online: ${client.user?.tag}`);
      console.log(`[Discord] Prefix: ${this.config.prefix}`);
      console.log(`[Discord] Provider: ${this.config.llmProvider}/${this.config.llmModel}`);
    });

    client.on('messageCreate', async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Check channel filter
      if (this.config.channelIds.length > 0 && !this.config.channelIds.includes(message.channelId)) return;

      // Check prefix or @mention
      const content = message.content.trim();
      let prompt: string;

      if (content.startsWith(this.config.prefix)) {
        prompt = content.slice(this.config.prefix.length).trim();
      } else if (message.mentions.has(client.user!.id)) {
        prompt = content.replace(/<@!?\d+>/g, '').trim();
      } else {
        return; // Not addressed to us
      }

      if (!prompt) {
        await message.reply('How can I help? Use `!forge <your question>` or @mention me.');
        return;
      }

      // Show typing indicator
      await message.channel.sendTyping();

      // Get/create conversation history for this channel
      const channelId = message.channelId;
      const history = this.conversationHistory.get(channelId) || [];
      history.push({ role: 'user', content: prompt });

      // Keep last 10 turns
      while (history.length > 20) history.shift();
      this.conversationHistory.set(channelId, history);

      // Call LLM
      const response = await this.callLLM(history);

      // Add to history
      history.push({ role: 'assistant', content: response });

      // Send response (split if too long)
      if (response.length <= this.config.maxLength) {
        await message.reply(response);
      } else {
        // Split into chunks
        const chunks = this.splitMessage(response, this.config.maxLength);
        for (const chunk of chunks) {
          await message.channel.send(chunk);
        }
      }
    });

    await client.login(this.config.token);
  }

  /**
   * Call LLM via free provider
   */
  private async callLLM(history: { role: string; content: string }[]): Promise<string> {
    const provider = FREE_PROVIDERS.find(p => p.name === this.config.llmProvider);
    if (!provider) return 'Error: Provider not configured.';

    const apiKey = process.env[provider.apiKeyEnv] || '';
    if (!apiKey && provider.apiKeyEnv) return 'Error: API key not set.';

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
          max_tokens: 512,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) return `Error: LLM returned ${res.status}. Try again.`;

      const data = await res.json() as any;
      return data.choices?.[0]?.message?.content || 'No response generated.';
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }

  private splitMessage(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    while (text.length > 0) {
      if (text.length <= maxLen) {
        chunks.push(text);
        break;
      }
      // Find last newline or space within limit
      let splitAt = text.lastIndexOf('\n', maxLen);
      if (splitAt < maxLen / 2) splitAt = text.lastIndexOf(' ', maxLen);
      if (splitAt < maxLen / 2) splitAt = maxLen;
      chunks.push(text.slice(0, splitAt));
      text = text.slice(splitAt).trim();
    }
    return chunks;
  }
}

export const discordBot = new MiForgeDiscordBot();
