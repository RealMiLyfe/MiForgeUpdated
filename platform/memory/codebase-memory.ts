/**
 * MiForge CodebaseMemory — NEW TECH P3
 *
 * Cognee knowledge graph of your entire codebase.
 * Auto-indexes on boot, queryable via MCP or direct API.
 *
 * What it does:
 *   - Parses all source files → extracts functions, classes, imports, deps
 *   - Builds a graph: File → exports → imports → depends_on relationships
 *   - Stores in Cognee (Apache-2.0, local Kuzu backend)
 *   - Queryable: "what calls this function?", "show me the auth flow"
 *
 * This is the missing link between "agent reads files" and "agent UNDERSTANDS codebase."
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface CodeEntity {
  type: 'file' | 'function' | 'class' | 'interface' | 'import' | 'export' | 'variable';
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  language: string;
  content: string;         // The actual code snippet
  signature?: string;      // Function/class signature
  dependencies: string[];  // What this entity depends on
}

export interface CodeRelation {
  from: string;   // entity ID
  to: string;     // entity ID
  type: 'imports' | 'exports' | 'calls' | 'extends' | 'implements' | 'depends_on';
}

export interface CodebaseIndex {
  rootPath: string;
  files: number;
  entities: number;
  relations: number;
  languages: Record<string, number>;
  indexedAt: number;
}

export interface CodeQuery {
  query: string;
  type?: 'semantic' | 'structural' | 'dependency';
  language?: string;
  maxResults?: number;
}

export interface CodeSearchResult {
  entity: CodeEntity;
  score: number;
  relatedEntities: string[];
}

// ═══════════════════════════════════════════════════════════════
// CODEBASE MEMORY
// ═══════════════════════════════════════════════════════════════

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts',
  '.py', '.pyx',
  '.go',
  '.rs',
  '.java', '.kt',
  '.rb',
  '.php',
  '.c', '.cpp', '.h', '.hpp',
  '.cs',
  '.swift',
  '.vue', '.svelte',
  '.sql',
  '.sh', '.bash',
  '.yaml', '.yml', '.toml', '.json',
  '.md', '.mdx',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', '.nuxt', 'vendor', 'target', '.venv', 'venv',
  'coverage', '.cache', '.turbo',
]);

export class CodebaseMemory {
  private cogneeApiUrl: string;
  private datasetName: string;
  private entities: Map<string, CodeEntity> = new Map();
  private relations: CodeRelation[] = [];

  constructor(config?: { cogneeApiUrl?: string; datasetName?: string }) {
    this.cogneeApiUrl = config?.cogneeApiUrl || process.env.COGNEE_API_URL || 'http://localhost:8000';
    this.datasetName = config?.datasetName || 'codebase';
  }

  /**
   * Index an entire codebase — builds the knowledge graph
   */
  async index(rootPath: string): Promise<CodebaseIndex> {
    console.log(`[CodebaseMemory] Indexing: ${rootPath}`);
    const startTime = Date.now();

    this.entities.clear();
    this.relations = [];

    const files = this.walkDirectory(rootPath);
    const languages: Record<string, number> = {};

    for (const filePath of files) {
      const ext = extname(filePath);
      const lang = this.extToLanguage(ext);
      languages[lang] = (languages[lang] || 0) + 1;

      try {
        const content = readFileSync(filePath, 'utf-8');
        const relativePath = relative(rootPath, filePath);
        const entities = this.parseFile(relativePath, content, lang);

        for (const entity of entities) {
          const id = `${entity.filePath}:${entity.type}:${entity.name}:${entity.lineStart}`;
          this.entities.set(id, entity);
        }
      } catch { /* skip unreadable files */ }
    }

    // Build relations from imports/exports
    this.buildRelations();

    // Store in Cognee graph
    await this.storeInGraph();

    const index: CodebaseIndex = {
      rootPath,
      files: files.length,
      entities: this.entities.size,
      relations: this.relations.length,
      languages,
      indexedAt: Date.now(),
    };

    console.log(`[CodebaseMemory] Indexed ${files.length} files, ${this.entities.size} entities, ${this.relations.length} relations in ${Date.now() - startTime}ms`);
    return index;
  }

  /**
   * Query the codebase graph
   */
  async query(q: CodeQuery): Promise<CodeSearchResult[]> {
    const maxResults = q.maxResults || 10;

    // Try Cognee graph search first
    try {
      const res = await fetch(`${this.cogneeApiUrl}/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q.query,
          dataset_name: this.datasetName,
          top_k: maxResults,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { results: { content: string; score: number; metadata?: any }[] };
        return (data.results || []).map(r => ({
          entity: JSON.parse(r.content) as CodeEntity,
          score: r.score,
          relatedEntities: [],
        }));
      }
    } catch { /* Cognee unavailable — fall back to local search */ }

    // Fallback: local keyword search over entities
    return this.localSearch(q.query, q.language, maxResults);
  }

  /**
   * Get dependency graph for a specific file or entity
   */
  getDependencies(filePath: string): { imports: string[]; importedBy: string[]; depth: number } {
    const imports: string[] = [];
    const importedBy: string[] = [];

    for (const rel of this.relations) {
      if (rel.from.includes(filePath) && (rel.type === 'imports' || rel.type === 'depends_on')) {
        imports.push(rel.to);
      }
      if (rel.to.includes(filePath) && (rel.type === 'imports' || rel.type === 'depends_on')) {
        importedBy.push(rel.from);
      }
    }

    return { imports, importedBy, depth: this.calculateDepth(filePath) };
  }

  /**
   * Get stats
   */
  getStats(): { entities: number; relations: number; files: number } {
    const files = new Set(Array.from(this.entities.values()).map(e => e.filePath));
    return { entities: this.entities.size, relations: this.relations.length, files: files.size };
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: File walking
  // ═══════════════════════════════════════════════════════════════

  private walkDirectory(dir: string): string[] {
    const files: string[] = [];
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (IGNORE_DIRS.has(entry) || entry.startsWith('.')) continue;
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            files.push(...this.walkDirectory(fullPath));
          } else if (stat.isFile() && SUPPORTED_EXTENSIONS.has(extname(entry))) {
            if (stat.size < 500_000) { // Skip files > 500KB
              files.push(fullPath);
            }
          }
        } catch { /* permission error — skip */ }
      }
    } catch { /* dir unreadable */ }
    return files;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Parsing (lightweight regex-based, no AST)
  // ═══════════════════════════════════════════════════════════════

  private parseFile(filePath: string, content: string, language: string): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const lines = content.split('\n');

    // File-level entity
    entities.push({
      type: 'file',
      name: filePath,
      filePath,
      lineStart: 1,
      lineEnd: lines.length,
      language,
      content: content.slice(0, 500), // First 500 chars as summary
      dependencies: [],
    });

    // Extract based on language
    if (['typescript', 'javascript'].includes(language)) {
      entities.push(...this.parseTS(filePath, lines, language));
    } else if (language === 'python') {
      entities.push(...this.parsePython(filePath, lines));
    } else {
      entities.push(...this.parseGeneric(filePath, lines, language));
    }

    return entities;
  }

  private parseTS(filePath: string, lines: string[], language: string): CodeEntity[] {
    const entities: CodeEntity[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Functions
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        entities.push({ type: 'function', name: funcMatch[1], filePath, lineStart: i + 1, lineEnd: this.findBlockEnd(lines, i), language, content: this.extractBlock(lines, i, 20), signature: line.trim(), dependencies: [] });
      }

      // Arrow functions / const
      const arrowMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
      if (arrowMatch) {
        entities.push({ type: 'function', name: arrowMatch[1], filePath, lineStart: i + 1, lineEnd: this.findBlockEnd(lines, i), language, content: this.extractBlock(lines, i, 15), signature: line.trim(), dependencies: [] });
      }

      // Classes
      const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
      if (classMatch) {
        entities.push({ type: 'class', name: classMatch[1], filePath, lineStart: i + 1, lineEnd: this.findBlockEnd(lines, i), language, content: this.extractBlock(lines, i, 30), signature: line.trim(), dependencies: [] });
      }

      // Interfaces
      const ifaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
      if (ifaceMatch) {
        entities.push({ type: 'interface', name: ifaceMatch[1], filePath, lineStart: i + 1, lineEnd: this.findBlockEnd(lines, i), language, content: this.extractBlock(lines, i, 20), signature: line.trim(), dependencies: [] });
      }

      // Imports
      const importMatch = line.match(/import\s+.*from\s+['"](.+?)['"]/);
      if (importMatch) {
        entities.push({ type: 'import', name: importMatch[1], filePath, lineStart: i + 1, lineEnd: i + 1, language, content: line.trim(), dependencies: [importMatch[1]] });
      }
    }

    return entities;
  }

  private parsePython(filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
      if (funcMatch) {
        entities.push({ type: 'function', name: funcMatch[1], filePath, lineStart: i + 1, lineEnd: this.findPythonBlockEnd(lines, i), language: 'python', content: this.extractBlock(lines, i, 15), signature: line.trim(), dependencies: [] });
      }

      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch) {
        entities.push({ type: 'class', name: classMatch[1], filePath, lineStart: i + 1, lineEnd: this.findPythonBlockEnd(lines, i), language: 'python', content: this.extractBlock(lines, i, 20), signature: line.trim(), dependencies: [] });
      }

      const importMatch = line.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
      if (importMatch) {
        const module = importMatch[1] || importMatch[2].split(',')[0].trim();
        entities.push({ type: 'import', name: module, filePath, lineStart: i + 1, lineEnd: i + 1, language: 'python', content: line.trim(), dependencies: [module] });
      }
    }

    return entities;
  }

  private parseGeneric(filePath: string, lines: string[], language: string): CodeEntity[] {
    // For other languages: just extract import-like patterns
    const entities: CodeEntity[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(import|#include|require|use|using)\b/.test(line)) {
        entities.push({ type: 'import', name: line.trim(), filePath, lineStart: i + 1, lineEnd: i + 1, language, content: line.trim(), dependencies: [line.trim()] });
      }
    }
    return entities;
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE: Helpers
  // ═══════════════════════════════════════════════════════════════

  private findBlockEnd(lines: string[], start: number): number {
    let braces = 0;
    for (let i = start; i < Math.min(start + 200, lines.length); i++) {
      braces += (lines[i].match(/{/g) || []).length;
      braces -= (lines[i].match(/}/g) || []).length;
      if (braces <= 0 && i > start) return i + 1;
    }
    return Math.min(start + 50, lines.length);
  }

  private findPythonBlockEnd(lines: string[], start: number): number {
    const indent = lines[start].match(/^(\s*)/)?.[1].length || 0;
    for (let i = start + 1; i < Math.min(start + 200, lines.length); i++) {
      const lineIndent = lines[i].match(/^(\s*)/)?.[1].length || 0;
      if (lines[i].trim() && lineIndent <= indent) return i;
    }
    return Math.min(start + 50, lines.length);
  }

  private extractBlock(lines: string[], start: number, maxLines: number): string {
    return lines.slice(start, start + maxLines).join('\n');
  }

  private buildRelations(): void {
    const exportMap = new Map<string, string>(); // name → entity ID
    for (const [id, entity] of this.entities) {
      if (entity.type === 'function' || entity.type === 'class' || entity.type === 'interface') {
        exportMap.set(entity.name, id);
      }
    }

    for (const [id, entity] of this.entities) {
      if (entity.type === 'import') {
        // Find what this imports
        for (const dep of entity.dependencies) {
          const target = exportMap.get(dep) || `external:${dep}`;
          this.relations.push({ from: id, to: target, type: 'imports' });
        }
      }
    }
  }

  private async storeInGraph(): Promise<void> {
    try {
      for (const [, entity] of this.entities) {
        await fetch(`${this.cogneeApiUrl}/api/v1/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: JSON.stringify(entity),
            dataset_name: this.datasetName,
            metadata: { type: entity.type, name: entity.name, file: entity.filePath, language: entity.language },
          }),
        }).catch(() => {}); // Best effort
      }
    } catch { /* Cognee unavailable — local index still works */ }
  }

  private localSearch(query: string, language: string | undefined, maxResults: number): CodeSearchResult[] {
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);
    const results: CodeSearchResult[] = [];

    for (const [, entity] of this.entities) {
      if (language && entity.language !== language) continue;

      const text = `${entity.name} ${entity.content} ${entity.signature || ''}`.toLowerCase();
      const matchCount = words.filter(w => text.includes(w)).length;
      if (matchCount > 0) {
        const score = matchCount / words.length;
        results.push({ entity, score, relatedEntities: [] });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  private calculateDepth(filePath: string): number {
    const visited = new Set<string>();
    let depth = 0;
    const queue = [filePath];
    while (queue.length > 0 && depth < 10) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const deps = this.relations
        .filter(r => r.from.includes(current) && r.type === 'imports')
        .map(r => r.to);
      queue.push(...deps);
      if (deps.length > 0) depth++;
    }
    return depth;
  }

  private extToLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
      '.py': 'python', '.pyx': 'python',
      '.go': 'go', '.rs': 'rust',
      '.java': 'java', '.kt': 'kotlin',
      '.rb': 'ruby', '.php': 'php',
      '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
      '.cs': 'csharp', '.swift': 'swift',
      '.vue': 'vue', '.svelte': 'svelte',
      '.sql': 'sql', '.sh': 'bash', '.bash': 'bash',
      '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.json': 'json',
      '.md': 'markdown', '.mdx': 'markdown',
    };
    return map[ext] || 'unknown';
  }
}

export const codebaseMemory = new CodebaseMemory();
