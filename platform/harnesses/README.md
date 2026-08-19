# MiForge Agent Harnesses

Pre-configured environments for every supported coding agent.
Each harness points at the MiForge proxy (LiteLLM on :4000) so agents
believe they're talking to Anthropic/OpenAI but actually hit free providers.

## Quick Start

```bash
# Pick ONE agent and run its setup:
source harnesses/fcc.env && fcc-server          # free-claude-code (primary)
source harnesses/aider.env && aider             # Aider (git-native)
source harnesses/opencode.env && opencode       # OpenCode (broadest)
source harnesses/claude-code.env && claude       # Claude Code via proxy
```

## How It Works

```
Agent (Claude Code / Aider / OpenCode / etc.)
    ↓ thinks it's talking to Anthropic
LiteLLM Proxy (localhost:4000)
    ↓ transforms + routes
Free Provider (NVIDIA NIM / Groq / Gemini / Ollama)
    ↓ inference at $0.00
Response → back to agent seamlessly
```

## Agents Supported

| Agent | Config File | Stars | License | Best For |
|-------|------------|-------|---------|----------|
| free-claude-code | `fcc.env` | 9.8K | MIT | Full Claude Code experience, free |
| Aider | `aider.env` | 44.9K | Apache-2.0 | Git-aware surgical edits |
| OpenCode | `opencode.env` | — | MIT | Broadest provider support |
| Claude Code | `claude-code.env` | — | Proprietary | Official CLI via proxy |
| OpenHands | `openhands.docker-compose.yml` | 75K | MIT | Autonomous agent (Devin-style) |
| Ollama local | `ollama-setup.sh` | — | MIT | Offline, private, unlimited |
