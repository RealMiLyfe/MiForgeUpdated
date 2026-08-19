# MiForge Python SDK

> `pip install miforge`

The complete free AI development stack for the MiLyfe ecosystem. Zero credit cards.

## Quick Start

```python
from miforge import MiForge

forge = MiForge()

# AI Completion (auto-routes to best free provider)
result = forge.complete("Write a Python fibonacci generator", task_type="coding")
print(result.text)
print(f"Provider: {result.provider} | Tokens: {result.tokens} | Cost: ${result.cost}")

# Memory (persists across sessions)
forge.memory.remember("User prefers async/await patterns", scope="user_42", importance=0.8)
memories = forge.memory.recall("coding preferences", scope="user_42")

# RAG (retrieval-augmented generation)
from miforge.rag import Document
forge.rag.ingest([Document(id="doc1", content="MiLyfe governance rules...")])
results = forge.rag.retrieve("How does user governance work?")

# Safe Execution (7 Sacred Human Gates)
result = forge.safe("deploy to production", lambda: deploy_service())
# ^ Triggers Gate 1 → Telegram notification → must approve

# Swarm (parallel models → consensus)
import asyncio
from miforge import SwarmOrchestrator
swarm = SwarmOrchestrator()
result = asyncio.run(swarm.swarm_solve("Optimize this database query"))
print(f"Consensus: {result.answer} | Confidence: {result.confidence}")
```

## Install

```bash
# Core (providers + memory + safety)
pip install miforge

# With RAG support
pip install miforge[rag]

# With everything
pip install miforge[all]
```

## Environment Variables

```bash
# Free tier keys (no credit card)
export NVIDIA_API_KEY=...     # build.nvidia.com (email + phone)
export GROQ_API_KEY=...       # console.groq.com (email only)
export GEMINI_API_KEY=...     # aistudio.google.com (email only)
export COHERE_API_KEY=...     # dashboard.cohere.com (email only)

# Memory backends
export REDIS_URL=redis://localhost:6379
export MEM0_API_KEY=...       # mem0.ai (free: 10K/month)

# Safety gates
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID=...
```

## License

MIT — ©2026 MiLyfe, Inc.
