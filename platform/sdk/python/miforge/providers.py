"""
MiForge Providers — Free AI provider catalog and intelligent routing.

15+ providers, 442+ models, zero credit cards.
Auto-failover, confidence-based routing, proactive 429 prediction.
"""

import os
import time
from dataclasses import dataclass, field
from collections import deque
from typing import Optional

import httpx


@dataclass
class Provider:
    name: str
    base_url: str
    test_model: str
    requires_phone: bool
    api_key_env: str
    rpm_limit: int
    best_for: list[str]


FREE_PROVIDERS: list[Provider] = [
    Provider("nvidia_nim", "https://integrate.api.nvidia.com/v1",
             "nvidia/nemotron-3-super-120b-a12b", True, "NVIDIA_API_KEY", 40,
             ["coding", "reasoning", "general"]),
    Provider("groq", "https://api.groq.com/openai/v1",
             "llama-3.3-70b-versatile", False, "GROQ_API_KEY", 30,
             ["speed", "realtime", "voice"]),
    Provider("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/",
             "gemini-2.5-flash", False, "GEMINI_API_KEY", 15,
             ["long_context", "multimodal", "analysis"]),
    Provider("openrouter", "https://openrouter.ai/api/v1",
             "openrouter/auto", False, "OPENROUTER_API_KEY", 20,
             ["variety", "fallback", "auto_routing"]),
    Provider("cerebras", "https://api.cerebras.ai/v1",
             "llama-3.3-70b", False, "CEREBRAS_API_KEY", 30,
             ["volume", "speed"]),
    Provider("cohere", "https://api.cohere.ai/v1",
             "command-r-plus", False, "COHERE_API_KEY", 20,
             ["embed", "rerank", "rag"]),
    Provider("ollama", "http://localhost:11434/v1",
             "qwen3-coder:latest", False, "", 9999,
             ["private", "offline", "unlimited"]),
]

ROUTING_TABLE: dict[str, list[dict[str, str]]] = {
    "deep_reasoning": [
        {"provider": "nvidia_nim", "model": "moonshotai/kimi-k2-thinking"},
        {"provider": "gemini", "model": "gemini-2.5-flash-thinking"},
    ],
    "coding": [
        {"provider": "nvidia_nim", "model": "qwen/qwen3-coder-480b"},
        {"provider": "nvidia_nim", "model": "nvidia/nemotron-3-super-120b-a12b"},
        {"provider": "ollama", "model": "qwen3-coder:latest"},
    ],
    "speed": [
        {"provider": "groq", "model": "llama-3.3-70b-versatile"},
        {"provider": "cerebras", "model": "llama-3.3-70b"},
    ],
    "long_context": [
        {"provider": "gemini", "model": "gemini-2.5-flash"},
        {"provider": "nvidia_nim", "model": "nvidia/nemotron-3-super-120b-a12b"},
    ],
    "general": [
        {"provider": "nvidia_nim", "model": "nvidia/nemotron-3-super-120b-a12b"},
        {"provider": "groq", "model": "llama-3.3-70b-versatile"},
        {"provider": "openrouter", "model": "openrouter/auto"},
    ],
}


class ConfidenceRouter:
    """Routes requests to the best free provider, predicts 429s proactively."""

    def __init__(self):
        self._history: dict[str, deque] = {p.name: deque() for p in FREE_PROVIDERS}
        self.total_tokens = 0
        self.total_cost = 0.00  # Always $0.00

    def route(self, task_type: str = "general") -> dict[str, str]:
        """Get best provider + model for a task type."""
        candidates = ROUTING_TABLE.get(task_type, ROUTING_TABLE["general"])
        for candidate in candidates:
            if not self.is_near_rate_limit(candidate["provider"]):
                return candidate
        # All near limit — local fallback
        return {"provider": "ollama", "model": "qwen3-coder:latest"}

    def record_request(self, provider: str, tokens: int):
        """Record a completed request for rate limit tracking."""
        self._history.setdefault(provider, deque()).append(time.time())
        self.total_tokens += tokens
        # Prune entries older than 60s
        cutoff = time.time() - 60
        q = self._history[provider]
        while q and q[0] < cutoff:
            q.popleft()

    def is_near_rate_limit(self, provider_name: str) -> bool:
        """True if provider is at 85%+ of its RPM limit."""
        provider = next((p for p in FREE_PROVIDERS if p.name == provider_name), None)
        if not provider:
            return True
        recent = len(self._history.get(provider_name, deque()))
        return recent >= provider.rpm_limit * 0.85

    def health_check(self) -> dict[str, bool]:
        """Check which providers are reachable."""
        results = {}
        for p in FREE_PROVIDERS:
            api_key = os.environ.get(p.api_key_env, "")
            if not api_key and p.api_key_env:
                results[p.name] = False
                continue
            try:
                r = httpx.post(
                    f"{p.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": p.test_model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 5},
                    timeout=10,
                )
                results[p.name] = r.status_code == 200
            except Exception:
                results[p.name] = False
        return results
