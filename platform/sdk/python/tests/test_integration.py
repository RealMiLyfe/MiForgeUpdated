"""
Integration test — hits a real free provider if API key is available.
Skips gracefully if no keys configured (CI without secrets).

Run with: pytest tests/test_integration.py -v
"""

import os
import pytest
import httpx


GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
NVIDIA_KEY = os.environ.get("NVIDIA_API_KEY", "")
COHERE_KEY = os.environ.get("COHERE_API_KEY", "")


@pytest.mark.skipif(not GROQ_KEY, reason="GROQ_API_KEY not set")
class TestGroqIntegration:
    def test_chat_completion(self):
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
            json={"model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": "Say hello"}], "max_tokens": 10},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["choices"][0]["message"]["content"]
        assert data["usage"]["total_tokens"] > 0
        # Cost assertion: $0.00 (free tier)


@pytest.mark.skipif(not NVIDIA_KEY, reason="NVIDIA_API_KEY not set")
class TestNvidiaIntegration:
    def test_chat_completion(self):
        r = httpx.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {NVIDIA_KEY}", "Content-Type": "application/json"},
            json={"model": "nvidia/nemotron-3-super-120b-a12b", "messages": [{"role": "user", "content": "Say hi"}], "max_tokens": 10},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["choices"][0]["message"]["content"]


@pytest.mark.skipif(not COHERE_KEY, reason="COHERE_API_KEY not set")
class TestCohereIntegration:
    def test_embed(self):
        r = httpx.post(
            "https://api.cohere.ai/v1/embed",
            headers={"Authorization": f"Bearer {COHERE_KEY}", "Content-Type": "application/json"},
            json={"texts": ["hello world"], "model": "embed-english-v3.0", "input_type": "search_query"},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["embeddings"]) == 1
        assert len(data["embeddings"][0]) > 100  # Embedding dimension

    def test_rerank(self):
        r = httpx.post(
            "https://api.cohere.ai/v2/rerank",
            headers={"Authorization": f"Bearer {COHERE_KEY}", "Content-Type": "application/json"},
            json={
                "query": "machine learning",
                "documents": ["Python is a programming language", "ML uses neural networks", "Cats are cute"],
                "model": "rerank-english-v3.0",
                "top_n": 2,
            },
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["results"]) == 2
        # ML doc should rank highest
        assert data["results"][0]["index"] == 1


class TestMiForgeClient:
    """Test the unified client (works without any API keys — just validates structure)."""

    def test_import(self):
        from miforge import MiForge
        forge = MiForge()
        assert forge.memory is not None
        assert forge.rag is not None
        assert forge.safety is not None
        assert forge.router is not None

    def test_health_returns_dict(self):
        from miforge import MiForge
        forge = MiForge()
        health = forge.health()
        assert isinstance(health, dict)
        # All should be False (no keys in test env unless explicitly set)
        for provider, status in health.items():
            assert isinstance(status, bool)

    def test_safe_blocks_dangerous_action(self):
        from miforge import MiForge
        forge = MiForge()
        result = forge.safe("delete production database", lambda: "BAD")
        assert result is None  # Blocked

    def test_safe_allows_safe_action(self):
        from miforge import MiForge
        forge = MiForge()
        result = forge.safe("read configuration file", lambda: "OK")
        assert result == "OK"
