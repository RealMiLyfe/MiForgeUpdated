# Changelog

All notable changes to the MiForge Platform.

## [1.0.0] — 2026-08-19

### Added

#### Core Platform (12 Layers)
- **Providers** — 15+ free AI providers with auto-failover, confidence routing, 429 prediction
- **ProviderHealthOracle** — ML-based (EMA) rate limit predictor with latency spike detection
- **Orchestration** — SwarmOrchestrator (parallel models → consensus), 5 specialist agents
- **LongHorizonPlanner** — Multi-day goals → milestones → tasks with human checkpoints
- **Memory OS** — 4-tier (context → Redis → Mem0 → Cognee graph) with real backends
- **CodebaseMemory** — Full codebase knowledge graph (parses TS/Python, builds dependency graph)
- **RAG** — Cohere embed + ChromaDB vector + Cohere rerank + Cognee graph augmentation
- **Computer Use** — SkillHarvestingAgent (browser-use + Playwright, skill caching)
- **MCP AutoConfig** — Scans project → auto-installs appropriate MCP servers
- **Safety** — 7 Sacred Human Gates with Telegram approval polling + persistent audit log
- **Observability** — CostZero Dashboard (real-time provider health, $0.00 always)
- **Self-Improvement** — Genetic prompt optimizer + eval harness + weekly cron

#### Interfaces
- **Voice Pipeline** — NVIDIA Parakeet STT → Groq LLM → Coqui TTS (<500ms target)
- **Puter.js** — Browser SDK (400+ models, user-pays, dev pays $0)
- **Discord Bot** — Prefix commands, channel filtering, typing indicator
- **Telegram Bot** — Chat interface + safety gate approval listener

#### SDKs
- **TypeScript SDK** — `MiForge` class with all layers accessible
- **Python SDK** — `pip install miforge` with all layers as Python modules

#### Infrastructure
- **docker-compose.yml** — Redis, KuzuDB, ChromaDB, LiteLLM, Phoenix, Open WebUI
- **Dockerfile** — Multi-stage production container
- **CI/CD** — GitHub Actions (typecheck, lint, Docker build, provider health)
- **Harness Configs** — fcc, aider, opencode, claude-code, openhands, ollama
- **bootstrap.sh** — One script builds entire system from zero
- **Makefile** — Unified task runner for all platform operations

#### Testing
- TypeScript tests: providers, safety, memory, MCP, swarm (vitest)
- Python tests: providers, memory, safety (pytest)
- Integration test hitting real free providers

### Technical Details
- Monthly cost: $0.00
- Free tokens: Unlimited (15+ providers stacked)
- Human touch: Only at 7 Sacred Gates
- License: MIT

---

## [0.1.0] — 2026-08-19 (Initial)

### Added
- Repository created with MiLyfe branding
- GitHub issue automation (AI-powered triage, duplicate detection, spam filtering)
- Issue templates (bug report, feature request)
- GitHub Actions workflows (8 workflows)
- .kiro/specs documentation

---

*Built with 🔨 by MiLyfe*
