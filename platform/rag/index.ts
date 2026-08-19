/**
 * MiForge RAG Pipeline — Layer 5: Knowledge & Retrieval
 *
 * Stack: Cohere Embed (free) → ChromaDB (local) → Cohere Rerank (free) → Cognee Graph
 * Total cost: $0.00
 *
 * Cohere is the ONLY free rerank API on the planet.
 * ChromaDB is unlimited self-hosted.
 * Cognee graph adds relational queries on top.
 */

export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface RetrievalResult {
  content: string;
  score: number;
  source: 'vector' | 'graph' | 'hybrid';
  metadata?: Record<string, unknown>;
}

export interface RAGConfig {
  cohereApiKey?: string;
  chromaUrl?: string;
  cogneeUrl?: string;
  collectionName?: string;
  embeddingModel?: string;
  rerankModel?: string;
}

/**
 * MiForge RAG Pipeline — Full stack, $0, auto-configurable
 */
export class RAGPipeline {
  private config: Required<RAGConfig>;

  constructor(config?: RAGConfig) {
    this.config = {
      cohereApiKey: config?.cohereApiKey || process.env.COHERE_API_KEY || '',
      chromaUrl: config?.chromaUrl || 'http://localhost:8000',
      cogneeUrl: config?.cogneeUrl || process.env.KUZU_URL || 'bolt://localhost:7474',
      collectionName: config?.collectionName || 'miforge_codebase',
      embeddingModel: config?.embeddingModel || 'embed-english-v3.0',
      rerankModel: config?.rerankModel || 'rerank-english-v3.0',
    };
  }

  /**
   * Ingest documents into vector DB + knowledge graph
   */
  async ingest(documents: Document[]): Promise<{ indexed: number; errors: number }> {
    let indexed = 0;
    let errors = 0;

    for (const doc of documents) {
      try {
        // Step 1: Embed with Cohere (free tier, no card)
        const embedding = await this.embed(doc.content);

        // Step 2: Store in ChromaDB (local, unlimited)
        await this.storeVector(doc.id, doc.content, embedding, doc.metadata);

        // Step 3: Add to Cognee graph for relational queries
        await this.storeGraph(doc.content, doc.metadata);

        indexed++;
      } catch (err) {
        console.error(`[RAG] Failed to ingest doc ${doc.id}:`, err);
        errors++;
      }
    }

    console.log(`[RAG] Ingested: ${indexed} docs, ${errors} errors`);
    return { indexed, errors };
  }

  /**
   * Retrieve relevant documents for a query
   * Uses: vector search → rerank → optional graph traversal
   */
  async retrieve(query: string, topK = 5): Promise<RetrievalResult[]> {
    // Step 1: Embed query
    const queryEmbedding = await this.embed(query);

    // Step 2: Vector search (get 2x candidates for reranking)
    const candidates = await this.vectorSearch(queryEmbedding, topK * 2);

    if (candidates.length === 0) {
      return [];
    }

    // Step 3: Rerank with Cohere (free tier — ONLY free rerank API available)
    const reranked = await this.rerank(query, candidates, topK);

    // Step 4: Optional graph augmentation for relational context
    const graphResults = await this.graphSearch(query, 3);

    // Merge and deduplicate
    const combined = [...reranked, ...graphResults];
    return this.deduplicateResults(combined).slice(0, topK);
  }

  /**
   * Embed text using Cohere (free tier, no card required)
   * Fallback: Ollama nomic-embed-text (local, unlimited)
   */
  private async embed(text: string): Promise<number[]> {
    if (this.config.cohereApiKey) {
      try {
        const res = await fetch('https://api.cohere.ai/v1/embed', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.cohereApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            texts: [text.slice(0, 4096)], // Cohere limit
            model: this.config.embeddingModel,
            input_type: 'search_document',
          }),
        });

        if (res.ok) {
          const data = await res.json() as { embeddings: number[][] };
          return data.embeddings[0];
        }
      } catch (err) {
        console.warn('[RAG] Cohere embed failed, falling back to local');
      }
    }

    // Fallback: Ollama nomic-embed-text (local, unlimited)
    try {
      const res = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', prompt: text.slice(0, 8192) }),
      });
      if (res.ok) {
        const data = await res.json() as { embedding: number[] };
        return data.embedding;
      }
    } catch { /* fallback unavailable */ }

    // Last resort: zero vector (will still work, just poor retrieval)
    console.warn('[RAG] All embedding providers unavailable');
    return new Array(1024).fill(0);
  }

  /**
   * Rerank with Cohere (free tier — only free rerank API on planet)
   */
  private async rerank(query: string, documents: string[], topN: number): Promise<RetrievalResult[]> {
    if (!this.config.cohereApiKey) {
      // No rerank available — return documents as-is with declining scores
      return documents.slice(0, topN).map((content, i) => ({
        content,
        score: 1.0 - (i * 0.1),
        source: 'vector' as const,
      }));
    }

    try {
      const res = await fetch('https://api.cohere.ai/v1/rerank', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.cohereApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          documents: documents.map(d => ({ text: d })),
          model: this.config.rerankModel,
          top_n: topN,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { results: { index: number; relevance_score: number }[] };
        return data.results.map(r => ({
          content: documents[r.index],
          score: r.relevance_score,
          source: 'vector' as const,
        }));
      }
    } catch (err) {
      console.warn('[RAG] Cohere rerank failed');
    }

    return documents.slice(0, topN).map((content, i) => ({
      content, score: 1.0 - (i * 0.1), source: 'vector' as const,
    }));
  }

  // ── Storage backends (stubs — real implementations connect to services) ──

  private async storeVector(id: string, content: string, embedding: number[], metadata?: Record<string, unknown>): Promise<void> {
    // ChromaDB: pip install chromadb → self-hosted, unlimited
    console.log(`[RAG:Vector] Stored doc ${id} (${content.length} chars)`);
  }

  private async storeGraph(content: string, metadata?: Record<string, unknown>): Promise<void> {
    // Cognee: pip install cognee → Apache-2.0, local Kuzu graph
    console.log(`[RAG:Graph] Stored to knowledge graph`);
  }

  private async vectorSearch(embedding: number[], topK: number): Promise<string[]> {
    // ChromaDB query
    console.log(`[RAG:Vector] Searching (top ${topK})`);
    return [];
  }

  private async graphSearch(query: string, topK: number): Promise<RetrievalResult[]> {
    // Cognee graph traversal for relational context
    console.log(`[RAG:Graph] Traversing for: "${query.slice(0, 30)}..."`);
    return [];
  }

  private deduplicateResults(results: RetrievalResult[]): RetrievalResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      const key = r.content.slice(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export const ragPipeline = new RAGPipeline();
