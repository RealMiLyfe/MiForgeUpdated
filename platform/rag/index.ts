/**
 * MiForge RAG Pipeline — Layer 5: Knowledge & Retrieval
 *
 * Real backends wired:
 *   Embed:   Cohere embed-english-v3.0 (free, no card) → fallback: Ollama nomic-embed-text
 *   Vector:  ChromaDB REST API (self-hosted via docker-compose, unlimited)
 *   Rerank:  Cohere rerank-english-v3.0 (free — ONLY free rerank API on planet)
 *   Graph:   Cognee REST API (Apache-2.0, local Kuzu backend)
 *
 * Install: docker compose up chromadb
 * Total cost: $0.00
 */

export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievalResult {
  content: string;
  score: number;
  source: 'vector' | 'graph' | 'hybrid';
  id?: string;
  metadata?: Record<string, unknown>;
}

export interface RAGConfig {
  cohereApiKey?: string;
  chromaUrl?: string;
  chromaCollection?: string;
  cogneeApiUrl?: string;
  ollamaUrl?: string;
  embeddingModel?: string;
  rerankModel?: string;
}

/**
 * MiForge RAG Pipeline — Full stack, real backends, $0
 */
export class RAGPipeline {
  private cohereApiKey: string;
  private chromaUrl: string;
  private chromaCollection: string;
  private cogneeApiUrl: string;
  private ollamaUrl: string;
  private embeddingModel: string;
  private rerankModel: string;
  private collectionInitialized = false;

  constructor(config?: RAGConfig) {
    this.cohereApiKey = config?.cohereApiKey || process.env.COHERE_API_KEY || '';
    this.chromaUrl = config?.chromaUrl || process.env.CHROMA_URL || 'http://localhost:8000';
    this.chromaCollection = config?.chromaCollection || 'miforge_knowledge';
    this.cogneeApiUrl = config?.cogneeApiUrl || process.env.COGNEE_API_URL || 'http://localhost:8001';
    this.ollamaUrl = config?.ollamaUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.embeddingModel = config?.embeddingModel || 'embed-english-v3.0';
    this.rerankModel = config?.rerankModel || 'rerank-english-v3.0';
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  /**
   * Ingest documents into vector DB + knowledge graph
   */
  async ingest(documents: Document[]): Promise<{ indexed: number; errors: number }> {
    await this.ensureCollection();
    let indexed = 0;
    let errors = 0;

    // Batch embed all documents at once (Cohere supports batch)
    const texts = documents.map(d => d.content.slice(0, 4096));
    let embeddings: number[][];

    try {
      embeddings = await this.embedBatch(texts, 'search_document');
    } catch (err: any) {
      console.error(`[RAG] Batch embedding failed: ${err.message}`);
      return { indexed: 0, errors: documents.length };
    }

    // Store in ChromaDB
    try {
      const res = await fetch(`${this.chromaUrl}/api/v1/collections/${this.chromaCollection}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: documents.map(d => d.id),
          documents: texts,
          embeddings,
          metadatas: documents.map(d => d.metadata || {}),
        }),
      });

      if (res.ok) {
        indexed = documents.length;
      } else {
        const errBody = await res.text().catch(() => '');
        console.error(`[RAG:Chroma] Add failed (${res.status}): ${errBody.slice(0, 200)}`);
        errors = documents.length;
      }
    } catch (err: any) {
      console.error(`[RAG:Chroma] ${err.message}`);
      errors = documents.length;
    }

    // Also add to Cognee graph (best-effort, non-blocking)
    this.ingestToGraph(documents).catch(err =>
      console.warn(`[RAG:Graph] Cognee ingest failed: ${err.message}`)
    );

    return { indexed, errors };
  }

  /**
   * Retrieve relevant documents for a query
   * Pipeline: embed query → vector search → rerank → graph augment → merge
   */
  async retrieve(query: string, topK = 5): Promise<RetrievalResult[]> {
    await this.ensureCollection();

    // Step 1: Embed query
    const queryEmbedding = await this.embed(query, 'search_query');

    // Step 2: Vector search in ChromaDB (get 3x candidates for reranking)
    const candidates = await this.chromaQuery(queryEmbedding, topK * 3);

    // Step 3: Rerank with Cohere (only free rerank API available)
    let reranked: RetrievalResult[];
    if (candidates.length > 0 && this.cohereApiKey) {
      reranked = await this.rerank(query, candidates, topK);
    } else {
      reranked = candidates.slice(0, topK);
    }

    // Step 4: Graph augmentation (parallel, non-blocking)
    const graphResults = await this.graphSearch(query, Math.min(3, topK));

    // Merge, deduplicate, return top K
    const combined = [...reranked, ...graphResults];
    return this.dedup(combined).slice(0, topK);
  }

  /**
   * Delete documents by ID
   */
  async delete(ids: string[]): Promise<void> {
    try {
      await fetch(`${this.chromaUrl}/api/v1/collections/${this.chromaCollection}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch (err: any) {
      console.warn(`[RAG:Chroma] Delete failed: ${err.message}`);
    }
  }

  /**
   * Get collection stats
   */
  async stats(): Promise<{ count: number; chromaHealthy: boolean; cohereHealthy: boolean }> {
    let count = 0;
    let chromaHealthy = false;
    let cohereHealthy = false;

    try {
      const res = await fetch(`${this.chromaUrl}/api/v1/collections/${this.chromaCollection}/count`);
      if (res.ok) {
        count = (await res.json()) as number;
        chromaHealthy = true;
      }
    } catch { /* unavailable */ }

    if (this.cohereApiKey) {
      try {
        const res = await fetch('https://api.cohere.ai/v1/models', {
          headers: { 'Authorization': `Bearer ${this.cohereApiKey}` },
        });
        cohereHealthy = res.ok;
      } catch { /* unavailable */ }
    }

    return { count, chromaHealthy, cohereHealthy };
  }

  // ═══════════════════════════════════════════════════════════════
  // EMBEDDING: Cohere (free) → fallback Ollama (local)
  // ═══════════════════════════════════════════════════════════════

  private async embed(text: string, inputType: string): Promise<number[]> {
    const results = await this.embedBatch([text], inputType);
    return results[0];
  }

  private async embedBatch(texts: string[], inputType: string): Promise<number[][]> {
    // Primary: Cohere (free tier, no card, best quality)
    if (this.cohereApiKey) {
      try {
        const res = await fetch('https://api.cohere.ai/v1/embed', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.cohereApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            texts: texts.slice(0, 96), // Cohere batch limit
            model: this.embeddingModel,
            input_type: inputType,
            truncate: 'END',
          }),
        });

        if (res.ok) {
          const data = await res.json() as { embeddings: number[][] };
          return data.embeddings;
        }

        const errText = await res.text().catch(() => '');
        console.warn(`[RAG:Embed] Cohere ${res.status}: ${errText.slice(0, 100)}`);
      } catch (err: any) {
        console.warn(`[RAG:Embed] Cohere failed: ${err.message}`);
      }
    }

    // Fallback: Ollama nomic-embed-text (local, unlimited, no key)
    try {
      const embeddings: number[][] = [];
      for (const text of texts) {
        const res = await fetch(`${this.ollamaUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'nomic-embed-text', prompt: text.slice(0, 8192) }),
        });
        if (res.ok) {
          const data = await res.json() as { embedding: number[] };
          embeddings.push(data.embedding);
        } else {
          throw new Error(`Ollama embed returned ${res.status}`);
        }
      }
      return embeddings;
    } catch (err: any) {
      console.warn(`[RAG:Embed] Ollama fallback failed: ${err.message}`);
    }

    // Last resort: throw — can't do RAG without embeddings
    throw new Error('[RAG] All embedding providers unavailable (Cohere + Ollama)');
  }

  // ═══════════════════════════════════════════════════════════════
  // VECTOR SEARCH: ChromaDB REST API (self-hosted, unlimited)
  // ═══════════════════════════════════════════════════════════════

  private async chromaQuery(embedding: number[], topK: number): Promise<RetrievalResult[]> {
    try {
      const res = await fetch(`${this.chromaUrl}/api/v1/collections/${this.chromaCollection}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_embeddings: [embedding],
          n_results: topK,
          include: ['documents', 'metadatas', 'distances'],
        }),
      });

      if (!res.ok) {
        console.warn(`[RAG:Chroma] Query failed: ${res.status}`);
        return [];
      }

      const data = await res.json() as {
        ids: string[][];
        documents: (string | null)[][];
        metadatas: (Record<string, unknown> | null)[][];
        distances: number[][];
      };

      const docs = data.documents?.[0] || [];
      const ids = data.ids?.[0] || [];
      const metadatas = data.metadatas?.[0] || [];
      const distances = data.distances?.[0] || [];

      return docs
        .map((doc, i) => ({
          content: doc || '',
          score: 1 - (distances[i] || 0), // ChromaDB returns L2 distance; convert to similarity
          source: 'vector' as const,
          id: ids[i],
          metadata: metadatas[i] || undefined,
        }))
        .filter(r => r.content.length > 0);
    } catch (err: any) {
      console.warn(`[RAG:Chroma] ${err.message}`);
      return [];
    }
  }

  private async ensureCollection(): Promise<void> {
    if (this.collectionInitialized) return;

    try {
      // Create collection if not exists (ChromaDB REST)
      const res = await fetch(`${this.chromaUrl}/api/v1/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.chromaCollection,
          metadata: { 'hnsw:space': 'cosine' },
          get_or_create: true,
        }),
      });

      if (res.ok || res.status === 409) {
        this.collectionInitialized = true;
      } else {
        console.warn(`[RAG:Chroma] Collection init returned ${res.status}`);
      }
    } catch (err: any) {
      console.warn(`[RAG:Chroma] Cannot reach ChromaDB at ${this.chromaUrl}: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RERANK: Cohere (free tier — only free rerank API on planet)
  // ═══════════════════════════════════════════════════════════════

  private async rerank(query: string, candidates: RetrievalResult[], topN: number): Promise<RetrievalResult[]> {
    if (!this.cohereApiKey || candidates.length === 0) {
      return candidates.slice(0, topN);
    }

    try {
      const res = await fetch('https://api.cohere.ai/v2/rerank', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.cohereApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          documents: candidates.map(c => c.content),
          model: this.rerankModel,
          top_n: topN,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { results: { index: number; relevance_score: number }[] };
        return data.results.map(r => ({
          ...candidates[r.index],
          score: r.relevance_score,
        }));
      }

      const errText = await res.text().catch(() => '');
      console.warn(`[RAG:Rerank] Cohere ${res.status}: ${errText.slice(0, 100)}`);
    } catch (err: any) {
      console.warn(`[RAG:Rerank] ${err.message}`);
    }

    // Fallback: return candidates as-is (vector scores)
    return candidates.slice(0, topN);
  }

  // ═══════════════════════════════════════════════════════════════
  // GRAPH: Cognee REST API (relational context augmentation)
  // ═══════════════════════════════════════════════════════════════

  private async ingestToGraph(documents: Document[]): Promise<void> {
    for (const doc of documents) {
      try {
        await fetch(`${this.cogneeApiUrl}/api/v1/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: doc.content,
            dataset_name: this.chromaCollection,
            metadata: { id: doc.id, ...doc.metadata },
          }),
        });
      } catch { /* best effort — graph is augmentation, not primary */ }
    }
  }

  private async graphSearch(query: string, topK: number): Promise<RetrievalResult[]> {
    try {
      const res = await fetch(`${this.cogneeApiUrl}/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          dataset_name: this.chromaCollection,
          top_k: topK,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { results: { content: string; score: number; metadata?: Record<string, unknown> }[] };
        return (data.results || []).map(r => ({
          content: r.content,
          score: r.score,
          source: 'graph' as const,
          metadata: r.metadata,
        }));
      }
    } catch { /* Cognee unavailable — not critical */ }
    return [];
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILS
  // ═══════════════════════════════════════════════════════════════

  private dedup(results: RetrievalResult[]): RetrievalResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      const key = r.content.slice(0, 150);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export const ragPipeline = new RAGPipeline();
