/**
 * MiForge Interface: Puter.js — The No-Key Browser Route
 *
 * Puter.js is the ONLY interface where users pay their own usage through
 * their Puter account — the developer pays nothing, ever, at any scale.
 *
 * 400+ models. Zero API keys. Zero backend. Zero cost to developer.
 * Includes: Claude Opus 5, GPT-5, Gemini 3.x, DALL-E 3, embeddings, and more.
 *
 * Usage: Include this in your frontend HTML/React app.
 * License: Apache-2.0
 *
 * @example
 * ```html
 * <script src="https://js.puter.com/v2/"></script>
 * <script type="module">
 *   import { PuterAgent } from './interfaces/puter.js';
 *   const agent = new PuterAgent();
 *   const result = await agent.chat('Explain quantum computing');
 *   console.log(result.text);
 * </script>
 * ```
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PuterConfig {
  /** Default model tier for chat */
  defaultTier?: 'flagship' | 'fast' | 'vision' | 'reasoning';
  /** System prompt */
  systemPrompt?: string;
  /** Enable streaming */
  stream?: boolean;
}

export interface PuterChatResult {
  text: string;
  model: string;
  tier: string;
  tokensUsed?: number;
}

/**
 * Model catalog — maps tiers to Puter.js model names
 * These are the actual model identifiers in the Puter.js SDK.
 */
export const PUTER_MODELS = {
  // Flagship (best reasoning)
  flagship: 'claude-opus-5',
  // Fast (autocomplete, quick responses)
  fast: 'claude-haiku-4-5',
  // Vision (image understanding)
  vision: 'gpt-5-vision',
  // Reasoning (chain-of-thought)
  reasoning: 'o3',
  // Image generation
  image_gen: 'dall-e-3',
  // Embeddings (for RAG)
  embed: 'text-embedding-3-large',
  // Long context
  long: 'gemini-2.5-flash',
  // Code
  code: 'claude-sonnet-5',
} as const;

// ═══════════════════════════════════════════════════════════════
// PUTER.JS AGENT WRAPPER
// ═══════════════════════════════════════════════════════════════

/**
 * PuterAgent — Typed wrapper around Puter.js AI SDK
 *
 * This class is designed to run in the BROWSER (not Node.js).
 * It requires the Puter.js script tag to be loaded first:
 *   <script src="https://js.puter.com/v2/"></script>
 *
 * The developer pays $0. The user authenticates with their own Puter account.
 */
export class PuterAgent {
  private config: Required<PuterConfig>;
  private conversationHistory: { role: string; content: string }[] = [];

  constructor(config?: PuterConfig) {
    this.config = {
      defaultTier: config?.defaultTier || 'flagship',
      systemPrompt: config?.systemPrompt || 'You are MiForge, an AI assistant built on the MiLyfe platform. Be helpful, concise, and accurate.',
      stream: config?.stream ?? true,
    };
  }

  /**
   * Chat completion — routes to user's Puter account (developer pays $0)
   */
  async chat(message: string, options?: {
    tier?: keyof typeof PUTER_MODELS;
    model?: string;
    stream?: boolean;
  }): Promise<PuterChatResult> {
    const puter = this.getPuter();
    const tier = options?.tier || this.config.defaultTier;
    const model = options?.model || PUTER_MODELS[tier as keyof typeof PUTER_MODELS] || PUTER_MODELS.flagship;

    this.conversationHistory.push({ role: 'user', content: message });

    const messages = [
      { role: 'system', content: this.config.systemPrompt },
      ...this.conversationHistory.slice(-20), // Last 10 turns
    ];

    if (options?.stream ?? this.config.stream) {
      // Streaming response
      const stream = await puter.ai.chat(messages, { model, stream: true });
      let text = '';
      for await (const chunk of stream) {
        text += chunk?.text || '';
      }
      this.conversationHistory.push({ role: 'assistant', content: text });
      return { text, model, tier };
    } else {
      // Non-streaming
      const response = await puter.ai.chat(messages, { model, stream: false });
      const text = response?.message?.content || response?.text || '';
      this.conversationHistory.push({ role: 'assistant', content: text });
      return { text, model, tier };
    }
  }

  /**
   * Generate an image (DALL-E 3 via Puter)
   */
  async generateImage(prompt: string): Promise<{ url: string }> {
    const puter = this.getPuter();
    const result = await puter.ai.txt2img(prompt, { model: PUTER_MODELS.image_gen });
    return { url: result?.url || '' };
  }

  /**
   * Generate embeddings (for client-side RAG)
   */
  async embed(texts: string[]): Promise<number[][]> {
    const puter = this.getPuter();
    const results: number[][] = [];
    for (const text of texts) {
      const embedding = await puter.ai.embed(text, { model: PUTER_MODELS.embed });
      results.push(embedding?.embedding || []);
    }
    return results;
  }

  /**
   * Reset conversation
   */
  reset(): void {
    this.conversationHistory = [];
  }

  /**
   * Get available models
   */
  getModels(): typeof PUTER_MODELS {
    return PUTER_MODELS;
  }

  // ── Private ──

  private getPuter(): any {
    if (typeof globalThis !== 'undefined' && (globalThis as any).puter) {
      return (globalThis as any).puter;
    }
    throw new Error(
      'Puter.js not loaded. Add <script src="https://js.puter.com/v2/"></script> to your HTML.'
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// HTML TEMPLATE (copy-paste ready for developers)
// ═══════════════════════════════════════════════════════════════

export const PUTER_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <title>MiForge — Puter.js AI Interface</title>
  <script src="https://js.puter.com/v2/"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3; height: 100vh; display: flex; flex-direction: column; }
    #chat { flex: 1; overflow-y: auto; padding: 20px; }
    .msg { margin: 8px 0; padding: 12px 16px; border-radius: 12px; max-width: 80%; }
    .user { background: #1a237e; margin-left: auto; }
    .assistant { background: #161b22; border: 1px solid #30363d; }
    #input-row { display: flex; padding: 12px; gap: 8px; border-top: 1px solid #30363d; }
    input { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid #30363d; background: #161b22; color: #e6edf3; font-size: 14px; }
    button { padding: 12px 24px; border-radius: 8px; border: none; background: linear-gradient(135deg, #1a237e, #0d8a6e); color: white; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div id="chat"></div>
  <div id="input-row">
    <input id="msg" placeholder="Ask MiForge anything..." onkeydown="if(event.key==='Enter')send()"/>
    <button onclick="send()">Send</button>
  </div>
  <script>
    const models = {
      flagship: 'claude-opus-5',
      fast: 'claude-haiku-4-5',
      code: 'claude-sonnet-5',
    };

    async function send() {
      const input = document.getElementById('msg');
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';

      addMsg('user', msg);
      const el = addMsg('assistant', '...');

      const stream = await puter.ai.chat(msg, { model: models.flagship, stream: true });
      let text = '';
      for await (const chunk of stream) {
        text += chunk?.text || '';
        el.textContent = text;
      }
    }

    function addMsg(role, text) {
      const chat = document.getElementById('chat');
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = text;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
      return div;
    }
  </script>
</body>
</html>`;
