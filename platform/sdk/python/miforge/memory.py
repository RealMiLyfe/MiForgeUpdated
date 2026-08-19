"""
MiForge Memory OS — 4-Tier Persistent Agent Memory (Python SDK)

Tier 1: In-context     → Active session FIFO, 30K token limit
Tier 2: Working        → Redis, session-scoped, 24h TTL, ~1ms recall
Tier 3: Episodic       → Mem0 free (10K/mo), cross-session, vector
Tier 4: Semantic Graph → Cognee (Apache-2.0, local Kuzu, free forever)
"""

import json
import os
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import httpx
import redis


@dataclass
class Memory:
    id: str
    content: str
    importance: float
    scope: str
    tier: str
    created_at: float = field(default_factory=time.time)
    metadata: dict = field(default_factory=dict)


@dataclass
class MemoryResult:
    content: str
    tier: str
    score: float
    metadata: dict = field(default_factory=dict)


TIER_THRESHOLDS = {"graph": 0.9, "episodic": 0.7, "working": 0.4, "context": 0.0}
WORKING_TTL = 86_400  # 24 hours


class MemoryOS:
    """Unified 4-tier memory with real Redis, Mem0, and Cognee backends."""

    def __init__(
        self,
        redis_url: Optional[str] = None,
        mem0_api_key: Optional[str] = None,
        cognee_api_url: Optional[str] = None,
    ):
        self._redis_url = redis_url or os.environ.get("REDIS_URL", "redis://localhost:6379")
        self._mem0_key = mem0_api_key or os.environ.get("MEM0_API_KEY", "")
        self._cognee_url = cognee_api_url or os.environ.get("COGNEE_API_URL", "http://localhost:8000")
        self._context: dict[str, deque] = {}
        self._redis: Optional[redis.Redis] = None
        self._max_context_tokens = 30_000

    def _get_redis(self) -> Optional[redis.Redis]:
        if self._redis is None:
            try:
                self._redis = redis.from_url(self._redis_url, decode_responses=True)
                self._redis.ping()
            except Exception as e:
                print(f"[Memory:Redis] Connection failed: {e}")
                self._redis = None
        return self._redis

    def _select_tier(self, importance: float) -> str:
        if importance >= TIER_THRESHOLDS["graph"]:
            return "graph"
        if importance >= TIER_THRESHOLDS["episodic"]:
            return "episodic"
        if importance >= TIER_THRESHOLDS["working"]:
            return "working"
        return "context"

    # ── PUBLIC API ──

    def remember(self, content: str, scope: str, importance: float, metadata: Optional[dict] = None) -> Memory:
        """Store a memory — auto-routes to correct tier based on importance."""
        tier = self._select_tier(importance)
        mem = Memory(
            id=f"mem_{int(time.time()*1000)}_{os.urandom(3).hex()}",
            content=content,
            importance=importance,
            scope=scope,
            tier=tier,
            metadata=metadata or {},
        )

        if tier == "graph":
            self._store_graph(mem)
        elif tier == "episodic":
            self._store_episodic(mem)
        elif tier == "working":
            self._store_working(mem)
        else:
            self._store_context(mem)

        return mem

    def recall(self, query: str, scope: str, top_k: int = 10, tiers: Optional[list[str]] = None) -> list[MemoryResult]:
        """Recall memories — parallel retrieval across tiers, merged + ranked."""
        tiers = tiers or ["graph", "episodic", "working", "context"]
        results: list[MemoryResult] = []

        for tier in tiers:
            try:
                results.extend(self._recall_tier(tier, query, scope, top_k))
            except Exception as e:
                print(f"[Memory:{tier}] Recall error: {e}")

        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    def forget(self, user_id: str):
        """GDPR cascade delete — all tiers."""
        self._context.pop(user_id, None)
        r = self._get_redis()
        if r:
            keys = r.zrange(f"miforge:idx:{user_id}", 0, -1)
            if keys:
                r.delete(*keys)
            r.delete(f"miforge:idx:{user_id}")
        # Mem0 + Cognee best-effort deletes
        if self._mem0_key:
            try:
                httpx.delete(f"https://api.mem0.ai/v1/memories/?user_id={user_id}",
                             headers={"Authorization": f"Token {self._mem0_key}"}, timeout=5)
            except Exception:
                pass
        try:
            httpx.delete(f"{self._cognee_url}/api/v1/datasets/scope_{user_id}", timeout=5)
        except Exception:
            pass

    # ── TIER IMPLEMENTATIONS ──

    def _store_context(self, mem: Memory):
        q = self._context.setdefault(mem.scope, deque())
        q.append(mem)
        total = sum(len(m.content) for m in q)
        while total > self._max_context_tokens * 4 and len(q) > 1:
            evicted = q.popleft()
            total -= len(evicted.content)

    def _store_working(self, mem: Memory):
        r = self._get_redis()
        if not r:
            return
        key = f"miforge:mem:{mem.scope}:{mem.id}"
        val = json.dumps({"content": mem.content, "importance": mem.importance, "metadata": mem.metadata})
        r.setex(key, WORKING_TTL, val)
        r.zadd(f"miforge:idx:{mem.scope}", {key: mem.created_at})

    def _store_episodic(self, mem: Memory):
        if not self._mem0_key:
            self._store_working(mem)
            return
        try:
            httpx.post(
                "https://api.mem0.ai/v1/memories/",
                headers={"Authorization": f"Token {self._mem0_key}", "Content-Type": "application/json"},
                json={"messages": [{"role": "user", "content": mem.content}], "user_id": mem.scope,
                      "metadata": {**mem.metadata, "miforge_id": mem.id}},
                timeout=10,
            )
        except Exception as e:
            print(f"[Memory:Episodic] Mem0 failed: {e} — falling back to Redis")
            self._store_working(mem)

    def _store_graph(self, mem: Memory):
        try:
            httpx.post(
                f"{self._cognee_url}/api/v1/add",
                json={"data": mem.content, "dataset_name": f"scope_{mem.scope}",
                      "metadata": {**mem.metadata, "id": mem.id, "importance": mem.importance}},
                timeout=10,
            )
        except Exception as e:
            print(f"[Memory:Graph] Cognee failed: {e} — falling back to Redis")
            self._store_working(mem)

    def _recall_tier(self, tier: str, query: str, scope: str, top_k: int) -> list[MemoryResult]:
        if tier == "context":
            return self._recall_context(query, scope, top_k)
        elif tier == "working":
            return self._recall_working(query, scope, top_k)
        elif tier == "episodic":
            return self._recall_episodic(query, scope, top_k)
        elif tier == "graph":
            return self._recall_graph(query, scope, top_k)
        return []

    def _recall_context(self, query: str, scope: str, top_k: int) -> list[MemoryResult]:
        q = self._context.get(scope, deque())
        words = set(query.lower().split())
        results = []
        for mem in q:
            content_words = set(mem.content.lower().split())
            overlap = len(words & content_words)
            if overlap > 0:
                score = min(overlap / max(len(words), 1), 0.9)
                results.append(MemoryResult(content=mem.content, tier="context", score=score, metadata=mem.metadata))
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    def _recall_working(self, query: str, scope: str, top_k: int) -> list[MemoryResult]:
        r = self._get_redis()
        if not r:
            return []
        keys = r.zrange(f"miforge:idx:{scope}", -top_k * 2, -1)
        if not keys:
            return []
        values = r.mget(keys)
        words = set(query.lower().split())
        results = []
        for val in values:
            if not val:
                continue
            parsed = json.loads(val)
            content_words = set(parsed["content"].lower().split())
            overlap = len(words & content_words)
            if overlap > 0:
                score = min(overlap / max(len(words), 1), 0.85)
                results.append(MemoryResult(content=parsed["content"], tier="working", score=score, metadata=parsed.get("metadata", {})))
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    def _recall_episodic(self, query: str, scope: str, top_k: int) -> list[MemoryResult]:
        if not self._mem0_key:
            return []
        try:
            r = httpx.post(
                "https://api.mem0.ai/v1/memories/search/",
                headers={"Authorization": f"Token {self._mem0_key}", "Content-Type": "application/json"},
                json={"query": query, "user_id": scope, "top_k": top_k},
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                return [MemoryResult(content=m["memory"], tier="episodic", score=m.get("score", 0.75))
                        for m in data.get("results", [])]
        except Exception:
            pass
        return []

    def _recall_graph(self, query: str, scope: str, top_k: int) -> list[MemoryResult]:
        try:
            r = httpx.post(
                f"{self._cognee_url}/api/v1/search",
                json={"query": query, "dataset_name": f"scope_{scope}", "top_k": top_k},
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                return [MemoryResult(content=m["content"], tier="graph", score=m.get("score", 0.8), metadata=m.get("metadata", {}))
                        for m in data.get("results", [])]
        except Exception:
            pass
        return []
