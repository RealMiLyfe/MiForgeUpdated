/**
 * MiForge Platform Tests — MCP AutoConfig
 */

import { describe, it, expect } from 'vitest';
import { MCP_CATALOG, scanProject } from '../mcp/index.js';
import { join } from 'path';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';

describe('MCP_CATALOG', () => {
  it('should have at least 15 servers defined', () => {
    expect(MCP_CATALOG.length).toBeGreaterThanOrEqual(15);
  });

  it('every server should be free', () => {
    for (const server of MCP_CATALOG) {
      expect(server.free).toBe(true);
    }
  });

  it('should include ALWAYS-on servers', () => {
    const alwaysServers = MCP_CATALOG.filter(s => s.trigger === 'ALWAYS');
    expect(alwaysServers.length).toBeGreaterThanOrEqual(3);
    const names = alwaysServers.map(s => s.name);
    expect(names).toContain('fetch');
    expect(names).toContain('memory');
    expect(names).toContain('filesystem');
    expect(names).toContain('sandbox');
  });

  it('should have unique server names', () => {
    const names = MCP_CATALOG.map(s => s.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe('scanProject', () => {
  it('should always include ALWAYS servers for any project', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'miforge-test-'));
    const servers = scanProject(tmpDir);
    const names = servers.map(s => s.name);
    expect(names).toContain('fetch');
    expect(names).toContain('memory');
    expect(names).toContain('sandbox');
    expect(names).toContain('filesystem');
  });

  it('should detect git projects', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'miforge-test-'));
    mkdirSync(join(tmpDir, '.git'));
    const servers = scanProject(tmpDir);
    const names = servers.map(s => s.name);
    expect(names).toContain('git');
  });

  it('should detect GitHub projects', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'miforge-test-'));
    mkdirSync(join(tmpDir, '.github'));
    const servers = scanProject(tmpDir);
    const names = servers.map(s => s.name);
    expect(names).toContain('github');
  });

  it('should detect Docker projects', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'miforge-test-'));
    writeFileSync(join(tmpDir, 'Dockerfile'), 'FROM node:20');
    const servers = scanProject(tmpDir);
    const names = servers.map(s => s.name);
    expect(names).toContain('docker');
  });

  it('should detect SQL projects', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'miforge-test-'));
    writeFileSync(join(tmpDir, 'schema.sql'), 'CREATE TABLE users;');
    const servers = scanProject(tmpDir);
    const names = servers.map(s => s.name);
    expect(names).toContain('postgres');
  });
});
