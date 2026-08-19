/**
 * MiForge MCP AutoConfig — Layer 8: The Nervous System
 *
 * Scans project structure → auto-installs + configures MCP servers.
 * Zero human touch. Agent runs this on boot.
 */

import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

export interface MCPServer {
  name: string;
  package: string;
  trigger: string | 'ALWAYS';
  free: boolean;
  needsToken?: boolean;
  description: string;
}

/**
 * Complete MCP server catalog — all free, all auto-installable
 */
export const MCP_CATALOG: MCPServer[] = [
  // ── CODE & VERSION CONTROL ──
  { name: 'git', package: '@mcp/git', trigger: '.git', free: true, description: 'Git operations' },
  { name: 'github', package: '@mcp/github', trigger: '.github', free: true, needsToken: true, description: 'GitHub API' },
  { name: 'gitlab', package: '@mcp/gitlab', trigger: '.gitlab-ci.yml', free: true, needsToken: true, description: 'GitLab API' },

  // ── BROWSER & WEB ──
  { name: 'playwright', package: '@playwright/mcp', trigger: '*.html', free: true, description: 'Browser automation' },
  { name: 'fetch', package: '@mcp/fetch', trigger: 'ALWAYS', free: true, description: 'HTTP fetch' },
  { name: 'browser', package: 'agent-browser', trigger: 'package.json', free: true, description: 'AI browser control' },

  // ── DATA ──
  { name: 'postgres', package: '@mcp/postgres', trigger: '*.sql', free: true, needsToken: true, description: 'PostgreSQL' },
  { name: 'sqlite', package: '@mcp/sqlite', trigger: '*.db', free: true, description: 'SQLite' },
  { name: 'redis', package: '@mcp/redis', trigger: 'redis.conf', free: true, description: 'Redis' },

  // ── MEMORY (ALWAYS) ──
  { name: 'memory', package: '@mem0/mcp', trigger: 'ALWAYS', free: true, description: 'Agent memory (Mem0)' },

  // ── COMPUTE ──
  { name: 'docker', package: '@mcp/docker', trigger: 'Dockerfile', free: true, description: 'Docker operations' },
  { name: 'kubernetes', package: '@mcp/kubernetes', trigger: 'k8s', free: true, description: 'K8s management' },

  // ── COMMUNICATION ──
  { name: 'slack', package: '@mcp/slack', trigger: '.slack', free: true, needsToken: true, description: 'Slack integration' },
  { name: 'notion', package: '@mcp/notion', trigger: 'notion', free: true, needsToken: true, description: 'Notion API' },

  // ── FILESYSTEM ──
  { name: 'filesystem', package: '@mcp/filesystem', trigger: 'ALWAYS', free: true, description: 'File operations' },

  // ── SAFETY (ALWAYS) ──
  { name: 'sandbox', package: '@mcp/sandbox', trigger: 'ALWAYS', free: true, description: 'Sandboxed execution' },
];

/**
 * Scan a project directory and determine which MCP servers to install
 */
export function scanProject(projectRoot: string): MCPServer[] {
  const root = resolve(projectRoot);
  const selected: MCPServer[] = [];

  for (const server of MCP_CATALOG) {
    if (server.trigger === 'ALWAYS') {
      selected.push(server);
      continue;
    }

    // Check if trigger file/pattern exists
    if (matchesTrigger(root, server.trigger)) {
      selected.push(server);
    }
  }

  return selected;
}

/**
 * Generate MCP configuration file
 */
export function generateConfig(servers: MCPServer[], outputPath?: string): Record<string, unknown> {
  const mcpConfig: Record<string, { command: string; args: string[] }> = {};

  for (const server of servers) {
    mcpConfig[server.name] = {
      command: 'npx',
      args: ['-y', server.package],
    };
  }

  const config = { mcpServers: mcpConfig };

  // Write to disk if path specified
  const configPath = outputPath || join(homedir(), '.claude', 'claude_desktop_config.json');
  const configDir = join(configPath, '..');
  
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  return config;
}

/**
 * Full autoconfig — scan project → select servers → write config
 */
export function autoconfig(projectRoot: string, outputPath?: string): { servers: MCPServer[]; configPath: string } {
  const servers = scanProject(projectRoot);
  const configPath = outputPath || join(homedir(), '.claude', 'claude_desktop_config.json');
  generateConfig(servers, configPath);

  console.log(`✅ MiForge MCP AutoConfig: ${servers.length} servers configured`);
  console.log(`   Config written to: ${configPath}`);
  console.log('   Servers:');
  for (const s of servers) {
    const token = s.needsToken ? ' (needs token)' : '';
    console.log(`     • ${s.name} — ${s.description}${token}`);
  }

  return { servers, configPath };
}

// ── Helpers ──

function matchesTrigger(root: string, trigger: string): boolean {
  // Direct file/dir check
  if (existsSync(join(root, trigger))) return true;

  // Glob-style pattern (simple implementation)
  if (trigger.includes('*')) {
    const ext = trigger.replace('*', '');
    try {
      const files = readdirSync(root, { recursive: true }) as string[];
      return files.some(f => f.toString().endsWith(ext));
    } catch {
      return false;
    }
  }

  // Check if any file/dir contains the trigger string
  try {
    const entries = readdirSync(root);
    return entries.some(e => e.includes(trigger));
  } catch {
    return false;
  }
}
