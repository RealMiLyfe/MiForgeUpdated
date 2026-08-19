/**
 * MiForge RAG: Firecrawl Web Scraper
 *
 * Scrapes web pages into clean Markdown/text for RAG ingestion.
 * Self-hosted: free, unlimited, MIT license.
 *
 * Modes:
 *   - scrape: Single URL → clean content
 *   - crawl: Entire site → multiple pages
 *   - map: Site structure discovery
 *
 * Self-hosted: docker run -p 3002:3002 mendableai/firecrawl
 * Cloud: firecrawl.dev (500 credits free, no card)
 */

export interface ScrapeResult {
  url: string;
  title: string;
  content: string;          // Clean markdown/text
  contentLength: number;
  metadata: {
    description?: string;
    language?: string;
    statusCode: number;
    scrapedAt: string;
  };
}

export interface CrawlResult {
  startUrl: string;
  pages: ScrapeResult[];
  totalPages: number;
  durationMs: number;
}

export interface FirecrawlConfig {
  /** Firecrawl API URL (self-hosted or cloud) */
  apiUrl?: string;
  /** API key (only needed for cloud — self-hosted is free) */
  apiKey?: string;
  /** Output format */
  format?: 'markdown' | 'text' | 'html';
  /** Max pages for crawl (default: 50) */
  maxPages?: number;
  /** Timeout per page in ms */
  timeoutMs?: number;
}

export class FirecrawlScraper {
  private apiUrl: string;
  private apiKey: string;
  private format: string;
  private maxPages: number;
  private timeoutMs: number;

  constructor(config?: FirecrawlConfig) {
    this.apiUrl = config?.apiUrl || process.env.FIRECRAWL_URL || 'http://localhost:3002';
    this.apiKey = config?.apiKey || process.env.FIRECRAWL_API_KEY || '';
    this.format = config?.format || 'markdown';
    this.maxPages = config?.maxPages || 50;
    this.timeoutMs = config?.timeoutMs || 30_000;
  }

  /**
   * Scrape a single URL → clean content
   */
  async scrape(url: string): Promise<ScrapeResult> {
    // Try Firecrawl API
    try {
      return await this.scrapeViaAPI(url);
    } catch (err: any) {
      console.warn(`[Firecrawl] API failed: ${err.message} — falling back to basic fetch`);
    }

    // Fallback: basic fetch + HTML strip
    return this.scrapeBasic(url);
  }

  /**
   * Crawl an entire site → multiple pages
   */
  async crawl(startUrl: string, options?: { maxPages?: number; allowedPaths?: string[] }): Promise<CrawlResult> {
    const start = Date.now();
    const max = options?.maxPages || this.maxPages;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

      const res = await fetch(`${this.apiUrl}/v1/crawl`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url: startUrl,
          limit: max,
          scrapeOptions: { formats: [this.format] },
          ...(options?.allowedPaths ? { includePaths: options.allowedPaths } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs * 2),
      });

      if (res.ok) {
        const data = await res.json() as any;

        // Crawl might be async — poll for results
        if (data.id) {
          return await this.pollCrawlResults(data.id, start);
        }

        // Immediate results
        const pages = (data.data || []).map((page: any) => ({
          url: page.metadata?.sourceURL || startUrl,
          title: page.metadata?.title || '',
          content: page.markdown || page.text || '',
          contentLength: (page.markdown || page.text || '').length,
          metadata: {
            description: page.metadata?.description,
            language: page.metadata?.language,
            statusCode: page.metadata?.statusCode || 200,
            scrapedAt: new Date().toISOString(),
          },
        }));

        return { startUrl, pages, totalPages: pages.length, durationMs: Date.now() - start };
      }
    } catch (err: any) {
      console.warn(`[Firecrawl] Crawl failed: ${err.message}`);
    }

    // Fallback: scrape just the start URL
    const singlePage = await this.scrape(startUrl);
    return { startUrl, pages: [singlePage], totalPages: 1, durationMs: Date.now() - start };
  }

  /**
   * Scrape multiple URLs in parallel
   */
  async scrapeMany(urls: string[], concurrency = 3): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(batch.map(url => this.scrape(url)));
      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }
    return results;
  }

  // ── Private ──

  private async scrapeViaAPI(url: string): Promise<ScrapeResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.apiUrl}/v1/scrape`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, formats: [this.format] }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) throw new Error(`Firecrawl returned ${res.status}`);

    const data = await res.json() as any;
    const page = data.data || data;

    return {
      url,
      title: page.metadata?.title || '',
      content: page.markdown || page.text || page.content || '',
      contentLength: (page.markdown || page.text || '').length,
      metadata: {
        description: page.metadata?.description,
        language: page.metadata?.language,
        statusCode: page.metadata?.statusCode || 200,
        scrapedAt: new Date().toISOString(),
      },
    };
  }

  private async scrapeBasic(url: string): Promise<ScrapeResult> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MiForge/1.0 (RAG Scraper)' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        return { url, title: '', content: '', contentLength: 0, metadata: { statusCode: res.status, scrapedAt: new Date().toISOString() } };
      }

      const html = await res.text();

      // Basic HTML → text stripping
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);

      return {
        url,
        title: titleMatch?.[1] || '',
        content: text.slice(0, 50_000), // Cap at 50KB
        contentLength: text.length,
        metadata: { statusCode: res.status, scrapedAt: new Date().toISOString() },
      };
    } catch (err: any) {
      return { url, title: '', content: `Error: ${err.message}`, contentLength: 0, metadata: { statusCode: 0, scrapedAt: new Date().toISOString() } };
    }
  }

  private async pollCrawlResults(crawlId: string, startTime: number): Promise<CrawlResult> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    // Poll for up to 2 minutes
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5_000));

      try {
        const res = await fetch(`${this.apiUrl}/v1/crawl/${crawlId}`, { headers });
        if (!res.ok) continue;

        const data = await res.json() as any;
        if (data.status === 'completed') {
          const pages = (data.data || []).map((page: any) => ({
            url: page.metadata?.sourceURL || '',
            title: page.metadata?.title || '',
            content: page.markdown || page.text || '',
            contentLength: (page.markdown || page.text || '').length,
            metadata: { statusCode: 200, scrapedAt: new Date().toISOString() },
          }));
          return { startUrl: '', pages, totalPages: pages.length, durationMs: Date.now() - startTime };
        }
      } catch { /* continue polling */ }
    }

    return { startUrl: '', pages: [], totalPages: 0, durationMs: Date.now() - startTime };
  }
}

export const firecrawlScraper = new FirecrawlScraper();
