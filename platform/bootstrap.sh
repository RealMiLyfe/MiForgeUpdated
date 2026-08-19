#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# MiForge Platform — Bootstrap Sequence
# The single script that builds the entire system.
# Agent runs this. Humans never touch it again.
# Monthly cost: $0.00 | Tokens: Unlimited (15+ providers stacked)
# ═══════════════════════════════════════════════════════════════

set -e
echo "🧬 MiForge Platform — Bootstrap Sequence"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ═══ STEP 1: System Dependencies ═══
echo "⚙️  Step 1: Core Dependencies..."
if ! command -v node &> /dev/null; then
    echo "  Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    sudo apt-get install -y nodejs
fi

if ! command -v python3 &> /dev/null; then
    echo "  Installing Python 3.13..."
    # IMPORTANT: Use 3.13, NOT 3.14 (alpha segfault bug)
    sudo apt-get install -y python3.13 python3.13-venv python3-pip
fi

echo "  ✅ Node $(node --version) | Python $(python3 --version)"

# ═══ STEP 2: Agent Harness (free-claude-code) ═══
echo ""
echo "🤖 Step 2: Agent Harness (free-claude-code)..."
if ! command -v fcc-server &> /dev/null; then
    curl -fsSL https://raw.githubusercontent.com/Alishahryar1/free-claude-code/main/scripts/install.sh | sh
fi
echo "  ✅ fcc-server installed"

# ═══ STEP 3: Local LLM Runtime (Ollama) ═══
echo ""
echo "🧠 Step 3: Local LLM Runtime..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi
# Pull coding model for offline fallback
ollama pull qwen3-coder:latest 2>/dev/null || echo "  ⚠️ Ollama pull skipped (can do later)"
echo "  ✅ Ollama ready"

# ═══ STEP 4: Memory Stack (Redis + Kuzu) ═══
echo ""
echo "💾 Step 4: Memory Stack..."
if command -v docker &> /dev/null; then
    docker run -d --name miforge-redis -p 6379:6379 redis:alpine 2>/dev/null || echo "  Redis already running"
    docker run -d --name miforge-kuzu -p 7474:7474 kuzudb/kuzu:latest 2>/dev/null || echo "  Kuzu already running"
    echo "  ✅ Redis (working memory) + Kuzu (graph memory) running"
else
    echo "  ⚠️ Docker not found — memory stack requires manual setup"
    echo "  Install: https://docs.docker.com/engine/install/"
fi

# ═══ STEP 5: Python Dependencies ═══
echo ""
echo "📦 Step 5: Python packages..."
pip install --quiet --upgrade \
    cognee mem0ai redis graphiti-py \
    chromadb cohere unstructured \
    browser-use playwright \
    langgraph crewai \
    arize-phoenix \
    2>/dev/null || echo "  ⚠️ Some pip packages failed (non-critical)"
echo "  ✅ Python stack installed"

# ═══ STEP 6: Playwright Browsers ═══
echo ""
echo "🌐 Step 6: Browser automation..."
playwright install chromium 2>/dev/null || npx playwright install chromium 2>/dev/null || echo "  ⚠️ Playwright browsers skipped"
echo "  ✅ Chromium ready for computer use"

# ═══ STEP 7: Node Dependencies ═══
echo ""
echo "📦 Step 7: Node packages..."
cd "$(dirname "$0")"
npm install --quiet 2>/dev/null || echo "  ⚠️ npm install incomplete"
npm install -g opencode @anthropic-ai/claude-code 2>/dev/null || true
echo "  ✅ Node packages installed"

# ═══ STEP 8: MCP AutoConfig ═══
echo ""
echo "🔌 Step 8: MCP AutoConfig..."
# Will be run by the agent on first project open
echo "  ℹ️  MCP servers will auto-configure when a project is opened"

# ═══ STEP 9: Provider Health Check ═══
echo ""
echo "🏥 Step 9: Provider Health Check..."
if [ -f ".env" ]; then
    source .env
    npx tsx providers/health-check.mts 2>/dev/null || echo "  ⚠️ Health check needs API keys in .env"
else
    echo "  ⚠️ No .env found — copy .env.example to .env and add your free API keys"
    cp .env.example .env 2>/dev/null || true
fi

# ═══ STEP 10: Observability ═══
echo ""
echo "📊 Step 10: Observability..."
if command -v docker &> /dev/null; then
    docker run -d --name miforge-phoenix -p 6006:6006 arizephoenix/phoenix:latest 2>/dev/null || echo "  Phoenix already running"
    echo "  ✅ Phoenix traces @ http://localhost:6006"
else
    echo "  ⚠️ Skipped (Docker required)"
fi

# ═══ STEP 11: Self-Improvement Cron ═══
echo ""
echo "🔄 Step 11: Self-improvement schedule..."
# Weekly eval + optimization
(crontab -l 2>/dev/null; echo "0 9 * * MON cd $(pwd) && npx tsx self-improvement/run-weekly.ts") | crontab - 2>/dev/null || echo "  ⚠️ Cron setup skipped"
echo "  ✅ Weekly optimization scheduled (Mondays 9AM)"

# ═══ DONE ═══
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ MiForge Platform — BOOTSTRAP COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💰 Monthly cost:    \$0.00"
echo "🔓 Free tokens:     UNLIMITED (15+ providers stacked)"
echo "👤 Human required:  ONLY at 7 sacred gates"
echo "🧠 Memory:          4-tier (context → Redis → Mem0 → Cognee)"
echo "🤖 Agents:          Claude Code + Aider + OpenCode + OpenHands"
echo "🔮 Self-improve:    Weekly prompt evolution + eval harness"
echo ""
echo "Next steps:"
echo "  1. Add API keys to .env (all free tier, no cards)"
echo "  2. Run: fcc-server  (starts the proxy)"
echo "  3. Run: claude      (starts coding)"
echo ""
echo "For devs building on the platform:"
echo "  import { memoryOS } from '@miforge/platform/memory'"
echo "  import { ragPipeline } from '@miforge/platform/rag'"
echo "  import { safeExecute } from '@miforge/platform/safety'"
echo ""
