/**
 * MiForge RAG: Unstructured Document Parser
 *
 * Parses PDF, DOCX, HTML, Markdown, CSV, PPTX, XLSX, EML, and more
 * into clean text chunks suitable for embedding + vector storage.
 *
 * Uses the Unstructured API (self-hosted or free tier).
 * Self-hosted: docker run -p 8100:8000 quay.io/unstructured-io/unstructured-api
 *
 * License: Apache-2.0 (self-hosted is free, unlimited)
 */

import { readFileSync } from 'fs';
import { extname, basename } from 'path';

export interface ParsedDocument {
  filename: string;
  elements: DocumentElement[];
  metadata: {
    pageCount?: number;
    filetype: string;
    languages?: string[];
  };
}

export interface DocumentElement {
  type: 'Title' | 'NarrativeText' | 'ListItem' | 'Table' | 'Image' | 'Header' | 'Footer' | 'PageBreak' | 'UncategorizedText';
  text: string;
  metadata?: {
    page_number?: number;
    coordinates?: any;
    parent_id?: string;
  };
}

export interface ChunkConfig {
  /** Max characters per chunk (default: 1000) */
  maxChunkSize?: number;
  /** Overlap between chunks in characters (default: 200) */
  overlapSize?: number;
  /** Combine short elements into single chunks */
  combineUnderLength?: number;
}

const SUPPORTED_TYPES = new Set([
  '.pdf', '.docx', '.doc', '.pptx', '.xlsx', '.csv',
  '.html', '.htm', '.md', '.txt', '.rtf', '.odt',
  '.eml', '.msg', '.epub', '.xml', '.json',
]);

export class UnstructuredParser {
  private apiUrl: string;
  private apiKey: string;

  constructor(config?: { apiUrl?: string; apiKey?: string }) {
    this.apiUrl = config?.apiUrl || process.env.UNSTRUCTURED_API_URL || 'http://localhost:8100';
    this.apiKey = config?.apiKey || process.env.UNSTRUCTURED_API_KEY || '';
  }

  /**
   * Parse a file into structured elements
   */
  async parseFile(filePath: string): Promise<ParsedDocument> {
    const ext = extname(filePath).toLowerCase();
    if (!SUPPORTED_TYPES.has(ext)) {
      throw new Error(`Unsupported file type: ${ext}. Supported: ${[...SUPPORTED_TYPES].join(', ')}`);
    }

    const fileBuffer = readFileSync(filePath);
    const filename = basename(filePath);

    // Try Unstructured API
    try {
      return await this.parseViaAPI(fileBuffer, filename);
    } catch (err: any) {
      console.warn(`[Unstructured] API failed: ${err.message} — falling back to basic parsing`);
    }

    // Fallback: basic text extraction for simple formats
    return this.parseBasic(fileBuffer, filename, ext);
  }

  /**
   * Parse and chunk — ready for RAG ingestion
   */
  async parseAndChunk(filePath: string, config?: ChunkConfig): Promise<string[]> {
    const doc = await this.parseFile(filePath);
    return this.chunkElements(doc.elements, config);
  }

  /**
   * Check if a file type is supported
   */
  isSupported(filePath: string): boolean {
    return SUPPORTED_TYPES.has(extname(filePath).toLowerCase());
  }

  /**
   * Chunk elements into RAG-ready text blocks
   */
  chunkElements(elements: DocumentElement[], config?: ChunkConfig): string[] {
    const maxSize = config?.maxChunkSize || 1000;
    const overlap = config?.overlapSize || 200;
    const combineUnder = config?.combineUnderLength || 100;

    // Combine short elements
    const combined: string[] = [];
    let buffer = '';

    for (const el of elements) {
      if (!el.text.trim()) continue;

      if (buffer.length + el.text.length < combineUnder) {
        buffer += (buffer ? '\n' : '') + el.text;
      } else {
        if (buffer) combined.push(buffer);
        buffer = el.text;
      }
    }
    if (buffer) combined.push(buffer);

    // Split into fixed-size chunks with overlap
    const chunks: string[] = [];
    for (const text of combined) {
      if (text.length <= maxSize) {
        chunks.push(text);
      } else {
        let start = 0;
        while (start < text.length) {
          const end = Math.min(start + maxSize, text.length);
          chunks.push(text.slice(start, end));
          start += maxSize - overlap;
        }
      }
    }

    return chunks;
  }

  // ── Private: API call ──

  private async parseViaAPI(fileBuffer: Buffer, filename: string): Promise<ParsedDocument> {
    const formData = new FormData();
    formData.append('files', new Blob([fileBuffer]), filename);
    formData.append('strategy', 'auto');
    formData.append('languages', JSON.stringify(['eng']));

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['unstructured-api-key'] = this.apiKey;
    }

    const res = await fetch(`${this.apiUrl}/general/v0/general`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(60_000), // PDFs can take time
    });

    if (!res.ok) {
      throw new Error(`Unstructured API returned ${res.status}`);
    }

    const elements = await res.json() as any[];

    return {
      filename,
      elements: elements.map(el => ({
        type: el.type || 'UncategorizedText',
        text: el.text || '',
        metadata: el.metadata,
      })),
      metadata: {
        filetype: extname(filename).slice(1),
        pageCount: elements.filter(el => el.type === 'PageBreak').length + 1,
      },
    };
  }

  // ── Private: Basic fallback parsing ──

  private parseBasic(buffer: Buffer, filename: string, ext: string): ParsedDocument {
    let text: string;
    try {
      text = buffer.toString('utf-8');
    } catch {
      text = buffer.toString('latin1');
    }

    // Split into paragraph-level elements
    const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 10);

    return {
      filename,
      elements: paragraphs.map(p => ({
        type: 'NarrativeText' as const,
        text: p.trim(),
      })),
      metadata: { filetype: ext.slice(1) },
    };
  }
}

export const unstructuredParser = new UnstructuredParser();
