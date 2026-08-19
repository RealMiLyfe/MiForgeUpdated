/**
 * MiForge Interfaces — Layer 0: How Humans + Agents Enter The System
 *
 * Exports all interface modules:
 *   - Puter.js (browser, no-key, user-pays)
 *   - Discord bot (server-based)
 *   - Telegram bot (personal + safety gate approvals)
 *   - Voice pipeline (STT → LLM → TTS)
 */

export { PuterAgent, PUTER_MODELS, PUTER_HTML_TEMPLATE } from './puter.js';
export type { PuterConfig, PuterChatResult } from './puter.js';

export { MiForgeDiscordBot, discordBot } from './discord.js';
export type { DiscordBotConfig } from './discord.js';

export { MiForgeTelegramBot, telegramBot } from './telegram.js';
export type { TelegramBotConfig, ApprovalRequest } from './telegram.js';

export { VoicePipeline, voicePipeline } from '../voice/index.js';
export type { VoiceConfig, VoiceResult, STTResult } from '../voice/index.js';
