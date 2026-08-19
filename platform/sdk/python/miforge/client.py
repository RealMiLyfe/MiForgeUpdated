"""
MiForge — The unified Python client.

Usage:
    from miforge import MiForge

    forge = MiForge()
    result = forge.complete("Explain this code", task_type="coding")
    print(result.text, result.provider, result.tokens)
"""

import os
from dataclasses import dataclass
from typing import Optional, Callable, Any

import httpx

from miforge.providers import ConfidenceRouter, FREE_PROVIDERS
from miforge.memory import MemoryOS
from miforge.rag import RAGPipeline
from miforge.safety import SafetyGateway, safe_execute


@dataclass
class CompletionResult:
    text: str
    provider: str
    model: str
    tokens: int
    cost: float = 0.00  # Always $0.00


class MiForge:
    """
    MiForge AI Platform — unified Python client.

    Provides access to all platform layers:
      - .complete()  → AI completion (auto-routed to free provider)
      - .memory      → 4-tier persistent Memory OS
      - .rag         → RAG pipeline (embed → vector → rerank)
      - .safe()      → Execute with safety gate protection
      - .router      → Provider routing + health
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        mem0_api_key: Optional[str] = None,
        cohere_api_key: Optional[str] = None,
    ):
        self.router = ConfidenceRouter()
        self.memory = MemoryOS(redis_url=redis_url, mem0_api_key=mem0_api_key)
        self.rag = RAGPipeline(cohere_api_key=cohere_api_key)
        self.safety = SafetyGateway()

    def complete(
        self,
        prompt: str,
        task_type: str = "general",
        system_prompt: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> CompletionResult:
        """
        AI completion — auto-routes to best free provider.

        Args:
            prompt: The user message
            task_type: Route hint (coding, speed, deep_reasoning, long_context, general)
            system_prompt: Optional system prompt
            max_tokens: Max response tokens
            temperature: Sampling temperature

        Returns:
            CompletionResult with text, provider, model, tokens, cost ($0.00)
        """
        route = self.router.route(task_type)
        provider = next((p for p in FREE_PROVIDERS if p.name == route["provider"]), None)
        if not provider:
            return CompletionResult(text="Error: No provider available", provider="", model="", tokens=0)

        api_key = os.environ.get(provider.api_key_env, "")
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            r = httpx.post(
                f"{provider.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": route["model"], "messages": messages, "max_tokens": max_tokens, "temperature": temperature},
                timeout=30,
            )
            if r.status_code == 200:
                data = r.json()
                text = data["choices"][0]["message"]["content"]
                tokens = data.get("usage", {}).get("total_tokens", 0)
                self.router.record_request(route["provider"], tokens)
                return CompletionResult(text=text, provider=route["provider"], model=route["model"], tokens=tokens)
            else:
                return CompletionResult(text=f"Error: Provider returned {r.status_code}", provider=route["provider"], model=route["model"], tokens=0)
        except Exception as e:
            return CompletionResult(text=f"Error: {e}", provider=route["provider"], model=route["model"], tokens=0)

    def safe(self, action_description: str, fn: Callable, **kwargs) -> Any:
        """Execute a function with safety gate protection."""
        return safe_execute(action_description, fn, self.safety, **kwargs)

    def health(self) -> dict[str, bool]:
        """Check which providers are reachable."""
        return self.router.health_check()
