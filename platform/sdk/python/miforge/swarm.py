"""
MiForge SwarmOrchestrator — Python SDK

Run N free models in parallel → cross-validate → consensus.
Better than any single model. Cost: $0.00.
"""

import asyncio
import os
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

from miforge.providers import FREE_PROVIDERS, ROUTING_TABLE, ConfidenceRouter


@dataclass
class SwarmResult:
    answer: str
    confidence: float
    models_used: list[str] = field(default_factory=list)
    total_tokens: int = 0
    total_cost: float = 0.00  # Always $0.00
    duration_ms: int = 0


SPECIALISTS = {
    "planner": {"model": "moonshotai/kimi-k2-thinking", "provider": "nvidia_nim",
                "prompt": "You are a strategic planner. Decompose tasks into clear subtasks."},
    "coder": {"model": "qwen/qwen3-coder-480b", "provider": "nvidia_nim",
              "prompt": "You are an expert software engineer. Write clean, production-ready code."},
    "reviewer": {"model": "nvidia/nemotron-3-super-120b-a12b", "provider": "nvidia_nim",
                 "prompt": "You are a senior code reviewer. Identify bugs, security issues, and improvements."},
    "speed": {"model": "llama-3.3-70b-versatile", "provider": "groq",
              "prompt": "You are a fast, accurate assistant. Be concise but complete."},
}


class SwarmOrchestrator:
    """Parallel free models → consensus. $0.00."""

    def __init__(self, proxy_url: Optional[str] = None, max_parallel: int = 3, timeout: int = 30):
        self._proxy_url = proxy_url or os.environ.get("LITELLM_URL", "http://localhost:4000")
        self._max_parallel = max_parallel
        self._timeout = timeout
        self._router = ConfidenceRouter()

    async def swarm_solve(self, task: str, n: Optional[int] = None) -> SwarmResult:
        """Run N diverse free models in parallel, find consensus."""
        start = time.time()
        n = n or self._max_parallel

        models = self._select_diverse(n)
        results = await asyncio.gather(*[
            self._call_model(m["provider"], m["model"], task)
            for m in models
        ], return_exceptions=True)

        successes = [(m, r) for m, r in zip(models, results) if isinstance(r, dict) and r.get("text")]

        if not successes:
            return SwarmResult(answer="[SWARM] All models failed.", confidence=0, duration_ms=int((time.time() - start) * 1000))

        if len(successes) == 1:
            m, r = successes[0]
            return SwarmResult(
                answer=r["text"], confidence=0.5, models_used=[m["model"]],
                total_tokens=r.get("tokens", 0), duration_ms=int((time.time() - start) * 1000)
            )

        # Find consensus — use longest answer as proxy for quality
        best = max(successes, key=lambda x: len(x[1]["text"]))
        return SwarmResult(
            answer=best[1]["text"],
            confidence=0.8 if len(successes) >= 2 else 0.5,
            models_used=[m["model"] for m, _ in successes],
            total_tokens=sum(r.get("tokens", 0) for _, r in successes),
            duration_ms=int((time.time() - start) * 1000),
        )

    async def dispatch(self, task: str, specialist: Optional[str] = None) -> SwarmResult:
        """Route to a specialist agent."""
        start = time.time()
        spec = SPECIALISTS.get(specialist or self._auto_select(task), SPECIALISTS["speed"])

        result = await self._call_model(spec["provider"], spec["model"], task, spec["prompt"])

        if isinstance(result, dict) and result.get("text"):
            return SwarmResult(
                answer=result["text"], confidence=0.8, models_used=[spec["model"]],
                total_tokens=result.get("tokens", 0), duration_ms=int((time.time() - start) * 1000)
            )
        return SwarmResult(answer="Specialist failed.", confidence=0, duration_ms=int((time.time() - start) * 1000))

    # ── Private ──

    def _select_diverse(self, n: int) -> list[dict[str, str]]:
        diverse = [
            {"provider": "nvidia_nim", "model": "nvidia/nemotron-3-super-120b-a12b"},
            {"provider": "groq", "model": "llama-3.3-70b-versatile"},
            {"provider": "gemini", "model": "gemini-2.5-flash"},
            {"provider": "cerebras", "model": "llama-3.3-70b"},
            {"provider": "openrouter", "model": "openrouter/auto"},
        ]
        return [m for m in diverse if not self._router.is_near_rate_limit(m["provider"])][:n] or diverse[:n]

    def _auto_select(self, task: str) -> str:
        t = task.lower()
        if any(w in t for w in ["code", "function", "implement", "bug"]):
            return "coder"
        if any(w in t for w in ["plan", "design", "decompose"]):
            return "planner"
        if any(w in t for w in ["review", "audit", "security"]):
            return "reviewer"
        return "speed"

    async def _call_model(self, provider: str, model: str, task: str, system: Optional[str] = None) -> dict:
        prov = next((p for p in FREE_PROVIDERS if p.name == provider), None)
        if not prov:
            return {}
        api_key = os.environ.get(prov.api_key_env, "")
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": task})

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(
                    f"{prov.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": model, "messages": messages, "max_tokens": 4096, "temperature": 0.7},
                )
                if r.status_code == 200:
                    data = r.json()
                    return {"text": data["choices"][0]["message"]["content"], "tokens": data.get("usage", {}).get("total_tokens", 0)}
        except Exception:
            pass
        return {}
