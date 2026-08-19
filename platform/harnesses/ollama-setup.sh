#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# MiForge Harness: Ollama Local Setup
# Zero cloud dependency. Private. Unlimited. No rate limits.
#
# Usage: bash harnesses/ollama-setup.sh
# Then:  claude (with ANTHROPIC_BASE_URL=http://localhost:11434)
# ═══════════════════════════════════════════════════════════════

set -e
echo "🧠 MiForge Ollama Local Harness Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Install Ollama if needed ──
if ! command -v ollama &> /dev/null; then
    echo "📦 Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
fi

echo "✅ Ollama $(ollama --version 2>/dev/null || echo 'installed')"

# ── Pull recommended models ──
echo ""
echo "📥 Pulling models (this may take a while on first run)..."

# Primary coding model (best free coding model for local)
echo "  → qwen3-coder (coding specialist)..."
ollama pull qwen3-coder:latest

# Fast general model
echo "  → llama3.1:8b (fast general)..."
ollama pull llama3.1:8b

# Embedding model for RAG
echo "  → nomic-embed-text (embeddings for RAG)..."
ollama pull nomic-embed-text

echo ""
echo "✅ Models ready"

# ── Verify Ollama is serving ──
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo ""
    echo "🚀 Starting Ollama server..."
    ollama serve &
    sleep 2
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Ollama Local Harness Ready"
echo ""
echo "Available models:"
ollama list 2>/dev/null || echo "  (run 'ollama list' to see models)"
echo ""
echo "Usage with Claude Code:"
echo "  export ANTHROPIC_BASE_URL=http://localhost:11434"
echo "  export ANTHROPIC_API_KEY=ollama"
echo "  claude --model qwen3-coder:latest"
echo ""
echo "Usage with Aider:"
echo "  aider --model ollama/qwen3-coder:latest"
echo ""
echo "Usage with OpenCode:"
echo "  export OPENAI_API_BASE=http://localhost:11434/v1"
echo "  export OPENAI_API_KEY=ollama"
echo "  opencode"
echo ""
echo "API endpoint: http://localhost:11434"
echo "  • OpenAI-compatible: http://localhost:11434/v1"
echo "  • Anthropic-compatible: http://localhost:11434 (Ollama v0.14+)"
echo ""
echo "⚡ Rate limit: UNLIMITED | 💰 Cost: \$0.00 | 🔒 Privacy: 100% local"
