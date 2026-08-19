# MiForge AI Platform

> **The Complete Free AI Development Stack — Every Layer, Zero Credit Cards**

This is the runtime platform powering MiLyfe's governance ecosystem. Developers building on MiLyfe integrate AI capabilities directly through this SDK.

---

## Architecture

```
╔══════════════════════════════════════════════════════════════╗
║              MiForge Platform Architecture                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  providers/     → 15+ free AI providers, auto-failover      ║
║  memory/        → 4-tier persistent memory OS               ║
║  rag/           → Embed + Vector + Rerank + Graph           ║
║  mcp/           → Auto-configured tool servers              ║
║  safety/        → 7 Sacred Human Gates                      ║
║  observability/ → CostZero Dashboard, traces                ║
║  self-improvement/ → Genetic optimizer, eval harness        ║
║  sdk/           → Developer-facing API                      ║
║                                                              ║
║  Monthly Cost: $0.00 | Tokens: Unlimited                    ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Quick Start (Developers)

### 1. Bootstrap the platform

```bash
cd platform
bash bootstrap.sh
```

### 2. Add your free API keys

```bash
cp .env.example .env
# Fill in keys from free tiers (no credit card required):
# - NVIDIA NIM: build.nvidia.com (email + phone)
# - Groq: console.groq.com (email only)
# - Gemini: aistudio.google.com (email only)
# - Cohere: dashboard.cohere.com (email only)
# - OpenRouter: openrouter.ai (email only)
```

### 3. Use in your code

```typescript
import { MiForge } from '@miforge/platform';

const forge = new MiForge();

// ── AI Completion (auto-routes to best free provider) ──
const response = await forge.complete('Explain this code', {
  taskType: 'coding',  // Routes to Qwen3 Coder 480B on NVIDIA NIM
});
console.log(response.text);
console.log(`Provider: ${response.provider} | Tokens: ${response.tokens} | Cost: $0.00`);

// ── Persistent Memory (survives across sessions) ──
await forge.memory.remember(
  'User prefers functional programming patterns',
  'user_123',
  0.8  // importance → stored in Mem0 episodic tier
);

const memories = await forge.memory.recall({
  query: 'user coding preferences',
  scope: 'user_123',
});

// ── RAG (retrieval-augmented generation) ──
await forge.rag.ingest([
  { id: 'doc1', content: 'MiLyfe governance rules...' },
  { id: 'doc2', content: 'Platform API documentation...' },
]);

const relevant = await forge.rag.retrieve('How does user governance work?');

// ── Safe Execution (7 Sacred Human Gates) ──
const result = await forge.safe('deploy to production', async () => {
  // This will trigger Gate 1 (irreversible action)
  // Human gets Telegram notification → must approve
  return await deployService();
});

// ── Platform Status ──
const status = forge.status();
console.log(status.providers.totalCost); // Always $0.00
```

---

## Provider Routing

The platform automatically routes requests to the best free provider:

| Task Type | Primary Provider | Model | Fallbacks |
|-----------|-----------------|-------|-----------|
| Deep Reasoning | NVIDIA NIM | Kimi K2 Thinking | GitHub Models (o3), Gemini |
| Coding | NVIDIA NIM | Qwen3 Coder 480B | Nemotron 3 Super, Ollama |
| Speed/RT | Groq | Llama 3.3 70B | Cerebras, Gemini Flash |
| Long Context | Gemini | 2.5 Flash (1M ctx) | NVIDIA NIM, OpenRouter |
| Private/Offline | Ollama | qwen3-coder | LM Studio |
| Embeddings | Cohere | embed-v3.0 | Ollama nomic-embed |
| Rerank | Cohere | rerank-v3.0 | (only free rerank API) |

---

## Memory OS (4 Tiers)

| Tier | Backend | TTL | Use Case | Cost |
|------|---------|-----|----------|------|
| Context | In-memory FIFO | Session | Active conversation | $0 |
| Working | Redis | 24 hours | Short-term facts | $0 |
| Episodic | Mem0 | Permanent | Cross-session memory | $0 (10K/mo) |
| Graph | Cognee/Kuzu | Permanent | Multi-hop reasoning | $0 (Apache-2.0) |

Importance score determines tier:
- `0.9+` → Graph (permanent, relational)
- `0.7+` → Episodic (cross-session)
- `0.4+` → Working (24h window)
- `< 0.4` → Context (session only)

---

## Safety Gates

Every action passes through the safety layer. 7 gates where humans must approve:

| Gate | Trigger | Example |
|------|---------|---------|
| 1. Irreversible | delete, deploy, publish, merge | `rm -rf`, `git push --force` |
| 2. Credentials | API keys, passwords needed | Agent needs a new token |
| 3. Novel Situation | Confidence < 0.65 | Never-seen-before task type |
| 4. Multi-Agent Conflict | Agents disagree | Two agents edit same file |
| 5. Legal/Compliance | PII detected | SSN, credit card in payload |
| 6. Quality Threshold | Score < 0.70 after 3 tries | Escalate to frontier model |
| 7. Self-Modification | Agent changes own rules | Routing update, memory rules |

---

## MCP AutoConfig

Scans your project structure → auto-installs the right MCP servers:

```typescript
import { autoconfig } from '@miforge/platform';

// Scans project → finds .git, Dockerfile, *.sql, etc.
// Auto-installs: git, docker, postgres, fetch, filesystem, memory, sandbox
autoconfig('/path/to/your/project');
```

---

## Self-Improvement

The platform gets better every week automatically:

- **Genetic Prompt Optimizer**: System prompts evolve through mutation + crossbreeding
- **Eval Harness**: Tests all providers on YOUR real tasks weekly
- **Routing Updates**: Best provider for your workload auto-selected

```bash
# Runs every Monday at 9AM via cron (set up by bootstrap.sh)
npx tsx self-improvement/run-weekly.ts
```

---

## For MiLyfe Governance Platform Developers

This platform is designed to be embedded directly into the MiLyfe lifestyle governance system. Key integration points:

```typescript
// In your MiLyfe governance module:
import { MiForge } from '@miforge/platform';

const forge = new MiForge({
  safetyGates: true,        // Always on for governance
  autoApproveBelow: undefined, // Never auto-approve in production
});

// Governance decision support
const analysis = await forge.complete(
  `Analyze this governance proposal: ${proposalText}`,
  { taskType: 'deep_reasoning' }
);

// Store governance decisions in graph memory
await forge.memory.remember(
  `Decision: ${decision.summary}`,
  `org_${orgId}`,
  0.95  // High importance → graph tier (permanent)
);

// Retrieve relevant precedents
const precedents = await forge.rag.retrieve(
  `Similar governance decisions about ${topic}`
);
```

---

## File Structure

```
platform/
├── bootstrap.sh              # One script to build everything
├── .env.example              # All free API keys documented
├── package.json              # Monorepo workspace config
├── tsconfig.json             # TypeScript config
├── providers/
│   ├── index.ts              # Provider catalog + routing table
│   ├── confidence-router.ts  # Intelligent routing + 429 prediction
│   ├── health-check.mts      # Boot-time provider verification
│   └── litellm-config.yaml   # LiteLLM proxy configuration
├── memory/
│   └── index.ts              # 4-tier Memory OS
├── rag/
│   └── index.ts              # Full RAG pipeline (embed→vector→rerank→graph)
├── mcp/
│   └── index.ts              # MCP server autoconfig
├── safety/
│   └── index.ts              # 7 Sacred Human Gates
├── observability/
│   └── index.ts              # CostZero Dashboard
├── self-improvement/
│   └── index.ts              # Genetic optimizer + eval harness
└── sdk/
    └── typescript/
        └── index.ts          # Developer SDK entry point
```

---

## Golden Rules

```
1. NO CREDIT CARD — Ever. Not even "optional".
2. NO HUMAN TOUCH — Every config step executable by an agent.
3. NO TRIAL TIMERS — Permanent free tiers only.
4. PRODUCTION-SAFE — MIT / Apache-2.0 licenses only.
5. AGENT-BOOTABLE — Every tool installable via one CLI command.
6. FALLBACK-FIRST — Every layer has 2+ free alternatives.
7. SELF-IMPROVING — Gets better every week automatically.
```
