/**
 * MiForge LongHorizonPlanner — NEW TECH P3
 *
 * Multi-day goal → daily milestones → runs until done.
 * Human checkpoints at each milestone boundary (Gate 1 pattern).
 *
 * How it works:
 *   1. Takes a high-level goal (e.g., "Build auth system for the platform")
 *   2. Decomposes into milestones (1 per day roughly)
 *   3. Each milestone has concrete tasks
 *   4. Executes tasks sequentially, checkpointing after each milestone
 *   5. At each checkpoint: reports progress, asks human to continue
 *   6. Adapts plan based on what was learned in previous milestones
 *
 * All LLM calls use free providers. Cost: $0.00.
 */

import { FREE_PROVIDERS } from '../providers/index.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface Goal {
  id: string;
  description: string;
  createdAt: number;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'failed';
  milestones: Milestone[];
  currentMilestoneIndex: number;
  context: string[];    // Accumulated learnings across milestones
  totalTokens: number;
  totalCost: number;    // Always $0.00
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  tasks: Task[];
  status: 'pending' | 'active' | 'completed' | 'skipped' | 'failed';
  completedAt?: number;
  learnings: string[];  // What was learned during this milestone
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  result?: string;
  tokensUsed: number;
}

export interface PlannerConfig {
  /** Max milestones per goal (default: 7) */
  maxMilestones?: number;
  /** Max tasks per milestone (default: 5) */
  maxTasksPerMilestone?: number;
  /** LLM provider for planning */
  llmProvider?: string;
  /** LLM model */
  llmModel?: string;
  /** Whether to require human approval at checkpoints */
  requireCheckpointApproval?: boolean;
  /** Callback for checkpoint notifications */
  onCheckpoint?: (goal: Goal, milestone: Milestone) => Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════
// LONG HORIZON PLANNER
// ═══════════════════════════════════════════════════════════════

export class LongHorizonPlanner {
  private config: Required<PlannerConfig>;
  private goals: Map<string, Goal> = new Map();

  constructor(config?: PlannerConfig) {
    this.config = {
      maxMilestones: config?.maxMilestones || 7,
      maxTasksPerMilestone: config?.maxTasksPerMilestone || 5,
      llmProvider: config?.llmProvider || 'nvidia_nim',
      llmModel: config?.llmModel || 'moonshotai/kimi-k2-thinking', // Best for planning
      requireCheckpointApproval: config?.requireCheckpointApproval ?? true,
      onCheckpoint: config?.onCheckpoint || (async () => true), // Default: auto-continue
    };
  }

  /**
   * Create a plan from a high-level goal
   */
  async plan(goalDescription: string): Promise<Goal> {
    const goal: Goal = {
      id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description: goalDescription,
      createdAt: Date.now(),
      status: 'planning',
      milestones: [],
      currentMilestoneIndex: 0,
      context: [],
      totalTokens: 0,
      totalCost: 0,
    };

    // Use LLM to decompose into milestones
    const planPrompt = `You are a project planner. Decompose this goal into ${this.config.maxMilestones} or fewer milestones.
Each milestone should be completable in roughly 1 working session (a few hours).
Each milestone has up to ${this.config.maxTasksPerMilestone} concrete tasks.

GOAL: ${goalDescription}

Output ONLY valid JSON:
{
  "milestones": [
    {
      "title": "Milestone title",
      "description": "What this milestone achieves",
      "tasks": ["task 1 description", "task 2 description", ...]
    }
  ]
}`;

    const response = await this.callLLM(planPrompt);
    goal.totalTokens += response.tokens;

    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        goal.milestones = (parsed.milestones || []).slice(0, this.config.maxMilestones).map((m: any, i: number) => ({
          id: `ms_${i}`,
          title: m.title || `Milestone ${i + 1}`,
          description: m.description || '',
          tasks: (m.tasks || []).slice(0, this.config.maxTasksPerMilestone).map((t: string, j: number) => ({
            id: `task_${i}_${j}`,
            description: t,
            status: 'pending' as const,
            tokensUsed: 0,
          })),
          status: 'pending' as const,
          learnings: [],
        }));
      }
    } catch (err) {
      console.warn('[Planner] Failed to parse milestones:', err);
      // Fallback: single milestone with the goal as one task
      goal.milestones = [{
        id: 'ms_0',
        title: 'Complete Goal',
        description: goalDescription,
        tasks: [{ id: 'task_0_0', description: goalDescription, status: 'pending', tokensUsed: 0 }],
        status: 'pending',
        learnings: [],
      }];
    }

    goal.status = 'active';
    this.goals.set(goal.id, goal);

    console.log(`[Planner] Created plan with ${goal.milestones.length} milestones`);
    for (const ms of goal.milestones) {
      console.log(`  • ${ms.title} (${ms.tasks.length} tasks)`);
    }

    return goal;
  }

  /**
   * Execute the next milestone in a goal
   * Returns false if goal is complete or paused
   */
  async executeNextMilestone(goalId: string, executor: (task: string, context: string[]) => Promise<string>): Promise<{
    completed: boolean;
    milestone?: Milestone;
    goalComplete: boolean;
  }> {
    const goal = this.goals.get(goalId);
    if (!goal || goal.status !== 'active') {
      return { completed: false, goalComplete: goal?.status === 'completed' };
    }

    const milestone = goal.milestones[goal.currentMilestoneIndex];
    if (!milestone) {
      goal.status = 'completed';
      return { completed: false, goalComplete: true };
    }

    milestone.status = 'active';
    console.log(`\n[Planner] Starting milestone ${goal.currentMilestoneIndex + 1}/${goal.milestones.length}: ${milestone.title}`);

    // Execute each task in the milestone
    for (const task of milestone.tasks) {
      if (task.status !== 'pending') continue;

      task.status = 'active';
      console.log(`  → Task: ${task.description.slice(0, 60)}...`);

      try {
        const result = await executor(task.description, goal.context);
        task.result = result;
        task.status = 'completed';
        console.log(`    ✅ Done`);
      } catch (err: any) {
        task.status = 'failed';
        task.result = `Error: ${err.message}`;
        console.log(`    ❌ Failed: ${err.message}`);
      }
    }

    // Milestone complete — extract learnings
    const learnings = await this.extractLearnings(milestone, goal);
    milestone.learnings = learnings;
    goal.context.push(...learnings);
    milestone.status = 'completed';
    milestone.completedAt = Date.now();

    // Checkpoint: ask human to continue (if configured)
    if (this.config.requireCheckpointApproval) {
      console.log(`\n[Planner] 🔔 Checkpoint: Milestone "${milestone.title}" complete.`);
      const shouldContinue = await this.config.onCheckpoint(goal, milestone);
      if (!shouldContinue) {
        goal.status = 'paused';
        return { completed: true, milestone, goalComplete: false };
      }
    }

    // Advance to next milestone
    goal.currentMilestoneIndex++;
    if (goal.currentMilestoneIndex >= goal.milestones.length) {
      goal.status = 'completed';
      return { completed: true, milestone, goalComplete: true };
    }

    // Optionally: re-plan remaining milestones based on learnings
    if (learnings.length > 0 && goal.currentMilestoneIndex < goal.milestones.length - 1) {
      await this.adaptPlan(goal);
    }

    return { completed: true, milestone, goalComplete: false };
  }

  /**
   * Run the entire goal to completion (all milestones)
   */
  async runToCompletion(goalId: string, executor: (task: string, context: string[]) => Promise<string>): Promise<Goal> {
    let goalComplete = false;
    while (!goalComplete) {
      const result = await this.executeNextMilestone(goalId, executor);
      goalComplete = result.goalComplete;
      if (!result.completed && !goalComplete) break; // Paused or error
    }
    return this.goals.get(goalId)!;
  }

  /**
   * Get goal status
   */
  getGoal(goalId: string): Goal | undefined {
    return this.goals.get(goalId);
  }

  /**
   * List all goals
   */
  listGoals(): Goal[] {
    return Array.from(this.goals.values());
  }

  /**
   * Pause a running goal
   */
  pause(goalId: string): void {
    const goal = this.goals.get(goalId);
    if (goal && goal.status === 'active') {
      goal.status = 'paused';
    }
  }

  /**
   * Resume a paused goal
   */
  resume(goalId: string): void {
    const goal = this.goals.get(goalId);
    if (goal && goal.status === 'paused') {
      goal.status = 'active';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════

  private async extractLearnings(milestone: Milestone, goal: Goal): Promise<string[]> {
    const completedTasks = milestone.tasks.filter(t => t.status === 'completed');
    if (completedTasks.length === 0) return [];

    const prompt = `Based on completing these tasks, what are the key learnings that should inform future work?

Milestone: ${milestone.title}
Tasks completed:
${completedTasks.map(t => `- ${t.description}: ${(t.result || '').slice(0, 200)}`).join('\n')}

List 1-3 concise learnings (one sentence each). Output as JSON array: ["learning 1", "learning 2"]`;

    const response = await this.callLLM(prompt);
    goal.totalTokens += response.tokens;

    try {
      const match = response.text.match(/\[[\s\S]*?\]/);
      if (match) return JSON.parse(match[0]) as string[];
    } catch { /* parse error */ }
    return [];
  }

  private async adaptPlan(goal: Goal): Promise<void> {
    const remaining = goal.milestones.slice(goal.currentMilestoneIndex);
    if (remaining.length === 0) return;

    const prompt = `Given these learnings from completed work, should the remaining plan be adjusted?

Learnings: ${goal.context.slice(-5).join('; ')}

Remaining milestones:
${remaining.map((m, i) => `${i + 1}. ${m.title}: ${m.description}`).join('\n')}

If adjustments are needed, output JSON: {"adjustments": [{"milestone_index": 0, "new_title": "...", "reason": "..."}]}
If no changes needed, output: {"adjustments": []}`;

    const response = await this.callLLM(prompt);
    goal.totalTokens += response.tokens;

    try {
      const match = response.text.match(/\{[\s\S]*?\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        for (const adj of parsed.adjustments || []) {
          const idx = goal.currentMilestoneIndex + (adj.milestone_index || 0);
          if (goal.milestones[idx]) {
            goal.milestones[idx].title = adj.new_title || goal.milestones[idx].title;
            console.log(`[Planner] Adapted milestone ${idx + 1}: ${adj.reason}`);
          }
        }
      }
    } catch { /* no adaptation needed */ }
  }

  private async callLLM(prompt: string): Promise<{ text: string; tokens: number }> {
    const provider = FREE_PROVIDERS.find(p => p.name === this.config.llmProvider);
    if (!provider) return { text: '', tokens: 0 };

    const apiKey = process.env[provider.apiKeyEnv] || '';
    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.llmModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return { text: '', tokens: 0 };
      const data = await res.json() as any;
      return { text: data.choices?.[0]?.message?.content || '', tokens: data.usage?.total_tokens || 0 };
    } catch {
      return { text: '', tokens: 0 };
    }
  }
}

export const planner = new LongHorizonPlanner();
