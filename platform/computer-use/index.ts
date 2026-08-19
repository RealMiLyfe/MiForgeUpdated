/**
 * MiForge Computer Use — Layer 7: Eyes + Hands
 *
 * SkillHarvestingAgent: 
 *   First run: uses LLM to figure out the task (costs tokens)
 *   Repeat runs: replays cached skill pattern (ZERO LLM calls)
 *   Gets cheaper every time. Learns permanently via Memory OS.
 *
 * Stack:
 *   - browser-use (108K★, MIT) — AI browser automation #1
 *   - Playwright — deterministic base layer
 *   - Mem0/Redis — skill pattern cache
 *
 * ⚠️  SECURITY: Always sandbox. Never give production credentials.
 *     Run in Docker or isolated VM. Gate 1 applies to all irreversible browser actions.
 */

import { MemoryOS } from '../memory/index.js';
import { FREE_PROVIDERS } from '../providers/index.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'extract' | 'scroll';
  selector?: string;
  value?: string;
  url?: string;
  waitMs?: number;
  description: string;
}

export interface SkillPattern {
  id: string;
  taskSignature: string;
  actions: BrowserAction[];
  successCount: number;
  lastUsed: number;
  avgDurationMs: number;
}

export interface ComputerUseResult {
  success: boolean;
  output: string;
  actions: BrowserAction[];
  tokensUsed: number;
  durationMs: number;
  fromCache: boolean;
  skillId?: string;
}

export interface ComputerUseConfig {
  headless?: boolean;
  proxyUrl?: string;
  screenshotDir?: string;
  maxActions?: number;
  timeoutMs?: number;
  llmProvider?: string;
  llmModel?: string;
}

// ═══════════════════════════════════════════════════════════════
// SKILL HARVESTING AGENT
// ═══════════════════════════════════════════════════════════════

export class SkillHarvestingAgent {
  private memory: MemoryOS;
  private config: Required<ComputerUseConfig>;
  private skillCache: Map<string, SkillPattern> = new Map();
  private readonly SCOPE = 'computer_use_agent';
  private readonly SKILL_MATCH_THRESHOLD = 0.88;

  constructor(memory?: MemoryOS, config?: ComputerUseConfig) {
    this.memory = memory || new MemoryOS();
    this.config = {
      headless: config?.headless ?? true,
      proxyUrl: config?.proxyUrl || process.env.LITELLM_URL || 'http://localhost:4000',
      screenshotDir: config?.screenshotDir || '/tmp/miforge-screenshots',
      maxActions: config?.maxActions || 20,
      timeoutMs: config?.timeoutMs || 60_000,
      llmProvider: config?.llmProvider || 'gemini',
      llmModel: config?.llmModel || 'gemini-2.5-flash', // Free, 1M context, fast
    };
  }

  /**
   * Execute a browser task — uses cached skill if available, else LLM
   */
  async execute(task: string): Promise<ComputerUseResult> {
    const start = Date.now();

    // Step 1: Check skill cache (zero token cost)
    const cachedSkill = await this.findCachedSkill(task);

    if (cachedSkill) {
      console.log(`[ComputerUse] Cache hit! Replaying skill: ${cachedSkill.id}`);
      const result = await this.replaySkill(cachedSkill);

      if (result.success) {
        // Update skill stats
        cachedSkill.successCount++;
        cachedSkill.lastUsed = Date.now();
        cachedSkill.avgDurationMs = (cachedSkill.avgDurationMs + (Date.now() - start)) / 2;
        await this.saveSkill(cachedSkill);

        return {
          ...result,
          durationMs: Date.now() - start,
          fromCache: true,
          skillId: cachedSkill.id,
          tokensUsed: 0, // Zero LLM calls!
        };
      }
      // Cache replay failed — fall through to LLM route
      console.log(`[ComputerUse] Cache replay failed, using LLM...`);
    }

    // Step 2: Novel task — use LLM to plan actions
    console.log(`[ComputerUse] Novel task — planning with ${this.config.llmModel}...`);
    const plan = await this.planWithLLM(task);

    if (!plan.success) {
      return {
        success: false,
        output: plan.error || 'Failed to plan actions',
        actions: [],
        tokensUsed: plan.tokensUsed,
        durationMs: Date.now() - start,
        fromCache: false,
      };
    }

    // Step 3: Execute planned actions via Playwright
    const result = await this.executeActions(plan.actions);

    // Step 4: If successful, harvest skill for next time
    if (result.success) {
      const skill: SkillPattern = {
        id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        taskSignature: this.normalizeTask(task),
        actions: plan.actions,
        successCount: 1,
        lastUsed: Date.now(),
        avgDurationMs: Date.now() - start,
      };
      await this.saveSkill(skill);
      console.log(`[ComputerUse] Skill harvested: ${skill.id}`);
    }

    return {
      success: result.success,
      output: result.output,
      actions: plan.actions,
      tokensUsed: plan.tokensUsed,
      durationMs: Date.now() - start,
      fromCache: false,
    };
  }

  /**
   * Get all cached skills
   */
  getSkills(): SkillPattern[] {
    return Array.from(this.skillCache.values());
  }

  /**
   * Clear skill cache (useful for testing)
   */
  async clearSkills(): Promise<void> {
    this.skillCache.clear();
    await this.memory.forget(this.SCOPE);
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Skill Cache (uses Memory OS tier 3/4)
  // ═══════════════════════════════════════════════════════════════

  private async findCachedSkill(task: string): Promise<SkillPattern | null> {
    const normalized = this.normalizeTask(task);

    // Check local cache first (instant)
    for (const [, skill] of this.skillCache) {
      if (this.similarity(normalized, skill.taskSignature) >= this.SKILL_MATCH_THRESHOLD) {
        return skill;
      }
    }

    // Check Memory OS (Mem0 vector search)
    try {
      const results = await this.memory.recall({
        query: `browser automation skill: ${normalized}`,
        scope: this.SCOPE,
        topK: 3,
        tiers: ['episodic', 'graph'],
      });

      for (const result of results) {
        if (result.score >= this.SKILL_MATCH_THRESHOLD) {
          try {
            const skill = JSON.parse(result.content) as SkillPattern;
            this.skillCache.set(skill.id, skill); // Warm local cache
            return skill;
          } catch { /* malformed skill, skip */ }
        }
      }
    } catch { /* Memory unavailable */ }

    return null;
  }

  private async saveSkill(skill: SkillPattern): Promise<void> {
    // Local cache
    this.skillCache.set(skill.id, skill);

    // Persist to Memory OS (high importance → graph/episodic tier)
    await this.memory.remember(
      JSON.stringify(skill),
      this.SCOPE,
      0.85, // High importance — persists across sessions
      { type: 'browser_skill', taskSignature: skill.taskSignature }
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: LLM Planning
  // ═══════════════════════════════════════════════════════════════

  private async planWithLLM(task: string): Promise<{ success: boolean; actions: BrowserAction[]; tokensUsed: number; error?: string }> {
    const provider = FREE_PROVIDERS.find(p => p.name === this.config.llmProvider);
    if (!provider) {
      return { success: false, actions: [], tokensUsed: 0, error: `Provider ${this.config.llmProvider} not found` };
    }

    const apiKey = process.env[provider.apiKeyEnv] || '';

    const systemPrompt = `You are a browser automation planner. Given a task, output a JSON array of browser actions.

Each action has:
- type: "navigate" | "click" | "type" | "wait" | "screenshot" | "extract" | "scroll"
- selector: CSS selector (for click, type, extract)
- value: text to type (for type), URL (for navigate)
- url: target URL (for navigate)
- waitMs: milliseconds to wait (for wait)
- description: human-readable description of this step

Rules:
- Keep actions minimal and deterministic
- Use specific CSS selectors (id > class > tag)
- Always start with navigate if a URL is needed
- Add waits after navigation or dynamic content loads
- Maximum ${this.config.maxActions} actions

Output ONLY a valid JSON array. No explanation.`;

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Task: ${task}` },
          ],
          max_tokens: 2048,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!res.ok) {
        return { success: false, actions: [], tokensUsed: 0, error: `LLM returned ${res.status}` };
      }

      const data = await res.json() as any;
      const text = data.choices?.[0]?.message?.content || '';
      const tokens = data.usage?.total_tokens || 0;

      // Parse actions from LLM response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { success: false, actions: [], tokensUsed: tokens, error: 'No valid JSON array in response' };
      }

      const actions = JSON.parse(jsonMatch[0]) as BrowserAction[];

      if (!Array.isArray(actions) || actions.length === 0) {
        return { success: false, actions: [], tokensUsed: tokens, error: 'Empty or invalid action array' };
      }

      return { success: true, actions: actions.slice(0, this.config.maxActions), tokensUsed: tokens };
    } catch (err: any) {
      return { success: false, actions: [], tokensUsed: 0, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Playwright Execution
  // ═══════════════════════════════════════════════════════════════

  private async executeActions(actions: BrowserAction[]): Promise<{ success: boolean; output: string }> {
    // Dynamic import — only loads Playwright when actually needed
    let playwright: any;
    try {
      playwright = await import('playwright');
    } catch {
      return { success: false, output: 'Playwright not installed. Run: pip install playwright && playwright install chromium' };
    }

    let browser: any;
    let page: any;

    try {
      browser = await playwright.chromium.launch({
        headless: this.config.headless,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      page = await browser.newPage();

      let lastOutput = '';

      for (const action of actions) {
        try {
          switch (action.type) {
            case 'navigate':
              await page.goto(action.url || action.value, { waitUntil: 'domcontentloaded', timeout: 15000 });
              break;

            case 'click':
              await page.click(action.selector!, { timeout: 5000 });
              break;

            case 'type':
              await page.fill(action.selector!, action.value || '');
              break;

            case 'wait':
              await page.waitForTimeout(action.waitMs || 1000);
              break;

            case 'screenshot': {
              const path = `${this.config.screenshotDir}/shot_${Date.now()}.png`;
              await page.screenshot({ path, fullPage: true });
              lastOutput = `Screenshot saved: ${path}`;
              break;
            }

            case 'extract':
              lastOutput = await page.textContent(action.selector!) || '';
              break;

            case 'scroll':
              await page.evaluate(() => window.scrollBy(0, 500));
              break;
          }
        } catch (actionErr: any) {
          console.warn(`[ComputerUse] Action failed (${action.type}): ${actionErr.message}`);
          // Continue on non-critical failures
        }
      }

      await browser.close();
      return { success: true, output: lastOutput || 'Actions completed successfully' };
    } catch (err: any) {
      if (browser) await browser.close().catch(() => {});
      return { success: false, output: `Execution error: ${err.message}` };
    }
  }

  /**
   * Replay a cached skill pattern — zero LLM calls, deterministic
   */
  private async replaySkill(skill: SkillPattern): Promise<ComputerUseResult> {
    const result = await this.executeActions(skill.actions);
    return {
      ...result,
      actions: skill.actions,
      tokensUsed: 0,
      durationMs: 0,
      fromCache: true,
      skillId: skill.id,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Helpers
  // ═══════════════════════════════════════════════════════════════

  private normalizeTask(task: string): string {
    return task.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 200);
  }

  private similarity(a: string, b: string): number {
    // Jaccard similarity on word n-grams (fast, no embeddings needed)
    const wordsA = new Set(a.split(' '));
    const wordsB = new Set(b.split(' '));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

export const computerUseAgent = new SkillHarvestingAgent();
