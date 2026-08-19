/**
 * MiForge Safety: Llama Guard Content Filter
 *
 * Free LLM-based content safety layer using Meta's Llama Guard model.
 * Runs locally via Ollama (free, unlimited) or NVIDIA NIM (free tier).
 *
 * Checks both INPUT (user prompts) and OUTPUT (agent responses) for:
 *   - Violence / self-harm
 *   - Criminal planning
 *   - Hate speech
 *   - Sexual content involving minors
 *   - Weapons / dangerous substances
 *   - PII exposure
 *   - Prompt injection attempts
 *
 * Usage:
 *   const guard = new LlamaGuard();
 *   const result = await guard.check("user message here");
 *   if (!result.safe) { block(result.violatedCategories); }
 *
 * Install: ollama pull llama-guard3:8b
 * Or use via NVIDIA NIM: meta/llama-guard-3-8b (free tier)
 */

export interface GuardResult {
  safe: boolean;
  violatedCategories: string[];
  confidence: number;
  rawOutput: string;
}

export interface LlamaGuardConfig {
  /** Where to run Llama Guard (default: ollama) */
  provider?: 'ollama' | 'nvidia_nim';
  /** Model name */
  model?: string;
  /** Custom unsafe categories to check */
  categories?: string[];
  /** Base URL override */
  baseUrl?: string;
}

const DEFAULT_CATEGORIES = [
  'S1: Violent Crimes',
  'S2: Non-Violent Crimes',
  'S3: Sex-Related Crimes',
  'S4: Child Sexual Exploitation',
  'S5: Defamation',
  'S6: Specialized Advice (medical/legal/financial)',
  'S7: Privacy Violations',
  'S8: Intellectual Property',
  'S9: Indiscriminate Weapons (CBRN)',
  'S10: Hate Speech',
  'S11: Suicide & Self-Harm',
  'S12: Sexual Content',
  'S13: Elections & Politics',
  'S14: Code Interpreter Abuse',
];

export class LlamaGuard {
  private provider: string;
  private model: string;
  private baseUrl: string;
  private categories: string[];

  constructor(config?: LlamaGuardConfig) {
    this.provider = config?.provider || 'ollama';
    this.model = config?.model || (this.provider === 'ollama' ? 'llama-guard3:8b' : 'meta/llama-guard-3-8b');
    this.baseUrl = config?.baseUrl || (this.provider === 'ollama'
      ? (process.env.OLLAMA_BASE_URL || 'http://localhost:11434')
      : 'https://integrate.api.nvidia.com/v1');
    this.categories = config?.categories || DEFAULT_CATEGORIES;
  }

  /**
   * Check if content is safe (input OR output)
   */
  async check(content: string, role: 'user' | 'assistant' = 'user'): Promise<GuardResult> {
    const prompt = this.buildPrompt(content, role);

    try {
      const response = await this.callModel(prompt);
      return this.parseResponse(response);
    } catch (err: any) {
      console.warn(`[LlamaGuard] Check failed: ${err.message} — defaulting to SAFE`);
      // Fail-open: if guard is unavailable, allow (don't block legitimate use)
      return { safe: true, violatedCategories: [], confidence: 0, rawOutput: `Error: ${err.message}` };
    }
  }

  /**
   * Check a full conversation (multi-turn)
   */
  async checkConversation(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<GuardResult> {
    const formatted = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
      .join('\n\n');
    return this.check(formatted, 'user');
  }

  /**
   * Check if Llama Guard is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (this.provider === 'ollama') {
        const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return false;
        const data = await res.json() as { models: { name: string }[] };
        return data.models?.some(m => m.name.includes('llama-guard')) || false;
      } else {
        // NVIDIA NIM — just try a health check
        const apiKey = process.env.NVIDIA_API_KEY || '';
        if (!apiKey) return false;
        const res = await fetch(`${this.baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get supported categories
   */
  getCategories(): string[] {
    return [...this.categories];
  }

  // ── Private ──

  private buildPrompt(content: string, role: string): string {
    return `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

Task: Check if there is unsafe content in '${role}' messages in conversations according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
${this.categories.join('\n')}
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

${role === 'user' ? 'User' : 'Agent'}: ${content.slice(0, 4000)}

<END CONVERSATION>

Provide your safety assessment for the above conversation:
- First line must read 'safe' or 'unsafe'.
- If unsafe, a second line must include a comma-separated list of violated categories.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
  }

  private async callModel(prompt: string): Promise<string> {
    if (this.provider === 'ollama') {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, stream: false, options: { temperature: 0, num_predict: 50 } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json() as { response: string };
      return data.response || '';
    } else {
      // NVIDIA NIM
      const apiKey = process.env.NVIDIA_API_KEY || '';
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`NIM returned ${res.status}`);
      const data = await res.json() as any;
      return data.choices?.[0]?.message?.content || '';
    }
  }

  private parseResponse(response: string): GuardResult {
    const lines = response.trim().split('\n').map(l => l.trim()).filter(l => l);
    const firstLine = (lines[0] || '').toLowerCase();

    if (firstLine === 'safe') {
      return { safe: true, violatedCategories: [], confidence: 0.95, rawOutput: response };
    }

    if (firstLine === 'unsafe' || firstLine.includes('unsafe')) {
      const categories = lines.length > 1
        ? lines[1].split(',').map(c => c.trim()).filter(c => c)
        : ['unknown'];
      return { safe: false, violatedCategories: categories, confidence: 0.9, rawOutput: response };
    }

    // Ambiguous response — default to safe (fail-open)
    return { safe: true, violatedCategories: [], confidence: 0.5, rawOutput: response };
  }
}

export const llamaGuard = new LlamaGuard();
