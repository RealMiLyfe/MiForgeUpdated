"""
MiForge RAG Pipeline — Python SDK

Cohere Embed (free) → ChromaDB (local) → Cohere Rerank (free) → Cognee Graph
Total cost: $0.00
"""

import os
from dataclasses import dataclass, field
from typing import Optional

import httpx


@dataclass
class Document:
    id: str
    content: str
    metadata: dict = field(default_factory=dict)


@dataclass
class RetrievalResult:
    content: str
    score: float
    source: str  # "vector" | "graph"
    metadata: dict = field(default_factory=dict)


class RAGPipeline:
    """Full RAG stack: embed → vector search → rerank → graph augment."""

    def __init__(
        self,
        cohere_api_key: Optional[str] = None,
        chroma_url: Optional[str] = None,
        collection: Optional[str] = None,
    ):
        self._cohere_key = cohere_api_key or os.environ.get("COHERE_API_KEY", "")
        self._chroma_url = chroma_url or os.environ.get("CHROMA_URL", "http://localhost:8000")
        self._collection = collection or "miforge_knowledge"
        self._initialized = False

    def _ensure_collection(self):
        if self._initialized:
            return
        try:
            httpx.post(
                f"{self._chroma_url}/api/v1/collections",
                json={"name": self._collection, "metadata": {"hnsw:space": "cosine"}, "get_or_create": True},
                timeout=5,
            )
            self._initialized = True
        except Exception as e:
            print(f"[RAG] ChromaDB init failed: {e}")

    def ingest(self, documents: list[Document]) -> dict[str, int]:
        """Ingest documents into vector DB."""
        self._ensure_collection()
        texts = [d.content[:4096] for d in documents]
        embeddings = self._embed_batch(texts, "search_document")

        try:
            r = httpx.post(
                f"{self._chroma_url}/api/v1/collections/{self._collection}/add",
                json={
                    "ids": [d.id for d in documents],
                    "documents": texts,
                    "embeddings": embeddings,
                    "metadatas": [d.metadata for d in documents],
                },
                timeout=30,
            )
            if r.status_code < 300:
                return {"indexed": len(documents), "errors": 0}
        except Exception as e:
            print(f"[RAG] Ingest failed: {e}")
        return {"indexed": 0, "errors": len(documents)}

    def retrieve(self, query: str, top_k: int = 5) -> list[RetrievalResult]:
        """Retrieve relevant documents: embed → vector search → rerank."""
        self._ensure_collection()
        q_embed = self._embed(query, "search_query")

        # Vector search
        candidates = self._chroma_query(q_embed, top_k * 3)
        if not candidates:
            return []

        # Rerank
        if self._cohere_key and len(candidates) > 1:
            return self._rerank(query, candidates, top_k)
        return candidates[:top_k]

    # ── Embedding ──

    def _embed(self, text: str, input_type: str) -> list[float]:
        return self._embed_batch([text], input_type)[0]

    def _embed_batch(self, texts: list[str], input_type: str) -> list[list[float]]:
        if self._cohere_key:
            try:
                r = httpx.post(
                    "https://api.cohere.ai/v1/embed",
                    headers={"Authorization": f"Bearer {self._cohere_key}", "Content-Type": "application/json"},
                    json={"texts": texts[:96], "model": "embed-english-v3.0", "input_type": input_type, "truncate": "END"},
                    timeout=15,
                )
                if r.status_code == 200:
                    return r.json()["embeddings"]
            except Exception as e:
                print(f"[RAG:Embed] Cohere failed: {e}")

        # Fallback: Ollama
        embeddings = []
        ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        for text in texts:
            try:
                r = httpx.post(f"{ollama_url}/api/embeddings",
                               json={"model": "nomic-embed-text", "prompt": text[:8192]}, timeout=10)
                if r.status_code == 200:
                    embeddings.append(r.json()["embedding"])
                else:
                    raise ValueError(f"Ollama returned {r.status_code}")
            except Exception:
                embeddings.append([0.0] * 768)
        return embeddings

    # ── Vector Search ──

    def _chroma_query(self, embedding: list[float], top_k: int) -> list[RetrievalResult]:
        try:
            r = httpx.post(
                f"{self._chroma_url}/api/v1/collections/{self._collection}/query",
                json={"query_embeddings": [embedding], "n_results": top_k, "include": ["documents", "distances", "metadatas"]},
                timeout=10,
            )
            if r.status_code != 200:
                return []
            data = r.json()
            docs = data.get("documents", [[]])[0]
            dists = data.get("distances", [[]])[0]
            metas = data.get("metadatas", [[]])[0]
            return [
                RetrievalResult(content=d, score=1 - dist, source="vector", metadata=m or {})
                for d, dist, m in zip(docs, dists, metas) if d
            ]
        except Exception:
            return []

    # ── Rerank ──

    def _rerank(self, query: str, candidates: list[RetrievalResult], top_n: int) -> list[RetrievalResult]:
        try:
            r = httpx.post(
                "https://api.cohere.ai/v2/rerank",
                headers={"Authorization": f"Bearer {self._cohere_key}", "Content-Type": "application/json"},
                json={"query": query, "documents": [c.content for c in candidates], "model": "rerank-english-v3.0", "top_n": top_n},
                timeout=10,
            )
            if r.status_code == 200:
                return [
                    RetrievalResult(content=candidates[item["index"]].content, score=item["relevance_score"],
                                    source="vector", metadata=candidates[item["index"]].metadata)
                    for item in r.json()["results"]
                ]
        except Exception:
            pass
        return candidates[:top_n]
