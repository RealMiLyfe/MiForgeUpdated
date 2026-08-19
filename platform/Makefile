# ═══════════════════════════════════════════════════════════════
# MiForge Platform — Unified Task Runner
# Usage: make <target>
# ═══════════════════════════════════════════════════════════════

.PHONY: help bootstrap up down health test build clean install configure lint

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Setup ──

bootstrap: ## One command → entire platform from zero
	bash bootstrap.sh

install: ## Install Node + Python dependencies
	npm install
	cd sdk/python && pip install -e ".[all]"

# ── Infrastructure ──

up: ## Start all services (Redis, ChromaDB, LiteLLM, Phoenix, WebUI)
	docker compose up -d
	@echo "✅ Services running. WebUI: http://localhost:3000 | Phoenix: http://localhost:6006"

down: ## Stop all services
	docker compose down

logs: ## Show service logs (follow)
	docker compose logs -f

ps: ## Show running services
	docker compose ps

# ── Development ──

build: ## Compile TypeScript
	npx tsc -b tsconfig.json

test: ## Run all tests
	npx vitest --run

test-watch: ## Run tests in watch mode
	npx vitest

lint: ## Lint TypeScript
	npx eslint '**/*.ts' --max-warnings 0 || true

# ── Platform Operations ──

health: ## Check all free provider health
	npx tsx providers/health-check.mts

configure: ## Auto-configure MCP servers for current project
	npx tsx -e "import { autoconfig } from './mcp/index.js'; autoconfig('.');"

dashboard: ## Print CostZero dashboard
	npx tsx -e "import { dashboard } from './observability/index.js'; dashboard.printDashboard();"

improve: ## Run weekly self-improvement (eval + prompt optimization)
	npx tsx self-improvement/run-weekly.ts

index-codebase: ## Index codebase into knowledge graph
	npx tsx -e "import { codebaseMemory } from './memory/codebase-memory.js'; codebaseMemory.index('..');"

# ── Agent Harnesses ──

fcc: ## Start free-claude-code proxy
	source harnesses/fcc.env && fcc-server

aider: ## Start Aider with MiForge proxy
	source harnesses/aider.env && aider

openhands: ## Start OpenHands autonomous agent
	docker compose -f harnesses/openhands.docker-compose.yml up

ollama-setup: ## Setup Ollama local models
	bash harnesses/ollama-setup.sh

# ── Cleanup ──

clean: ## Remove build artifacts
	rm -rf dist/ coverage/ node_modules/.cache
	find . -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name '*.pyc' -delete 2>/dev/null || true

nuke: ## Full reset (removes volumes — DATA LOSS)
	docker compose down -v
	rm -rf dist/ node_modules/
	@echo "⚠️  All data volumes removed. Run 'make bootstrap' to rebuild."
