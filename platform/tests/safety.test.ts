/**
 * MiForge Platform Tests — Safety Gateway & 7 Sacred Human Gates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SafetyGateway, Gate, safeExecute } from '../safety/index.js';

describe('SafetyGateway', () => {
  let gateway: SafetyGateway;

  beforeEach(() => {
    gateway = new SafetyGateway();
  });

  describe('Gate 1: Irreversible Actions', () => {
    it('should block "delete" actions', async () => {
      const check = await gateway.checkAction('delete all user data');
      expect(check.safe).toBe(false);
      expect(check.gate).toBe(Gate.IRREVERSIBLE_ACTION);
    });

    it('should block "deploy" actions', async () => {
      const check = await gateway.checkAction('deploy to production');
      expect(check.safe).toBe(false);
      expect(check.gate).toBe(Gate.IRREVERSIBLE_ACTION);
    });

    it('should block "rm -rf" commands', async () => {
      const check = await gateway.checkAction('rm -rf /var/data');
      expect(check.safe).toBe(false);
      expect(check.gate).toBe(Gate.IRREVERSIBLE_ACTION);
    });

    it('should block "git push" actions', async () => {
      const check = await gateway.checkAction('git push origin main --force');
      expect(check.safe).toBe(false);
      expect(check.gate).toBe(Gate.IRREVERSIBLE_ACTION);
    });

    it('should block "publish" actions', async () => {
      const check = await gateway.checkAction('publish npm package');
      expect(check.safe).toBe(false);
      expect(check.gate).toBe(Gate.IRREVERSIBLE_ACTION);
    });
  });

  describe('Gate 5: PII Detection', () => {
    it('should detect SSN patterns', async () => {
      const check = await gateway.checkAction('Process user 123-45-6789');
      expect(check.safe).toBe(false);
      expect(check.gate).toBe(Gate.LEGAL_COMPLIANCE);
    });

    it('should detect credit card numbers (Visa)', async () => {
      const check = await gateway.checkAction('Charge card 4111111111111111');
      expect(check.safe).toBe(false);
      // Could be Gate 1 (charge) or Gate 5 (card number)
      expect(check.gate).toBeDefined();
    });
  });

  describe('Gate 6: Quality Threshold', () => {
    it('should block low-confidence actions', async () => {
      const check = await gateway.checkAction('generate report', { confidence: 0.45 });
      expect(check.safe).toBe(false);
      expect(check.gate).toBe(Gate.QUALITY_THRESHOLD);
    });

    it('should pass high-confidence actions', async () => {
      const check = await gateway.checkAction('generate report', { confidence: 0.95 });
      expect(check.safe).toBe(true);
    });
  });

  describe('Gate 7: Self-Modification', () => {
    it('should block routing modifications', async () => {
      const check = await gateway.checkAction('modify_routing table');
      expect(check.safe).toBe(false);
      expect(check.gate).toBe(Gate.SELF_MODIFICATION);
    });

    it('should block memory rule changes', async () => {
      const check = await gateway.checkAction('change_memory_rules');
      expect(check.safe).toBe(false);
      expect(check.gate).toBe(Gate.SELF_MODIFICATION);
    });
  });

  describe('Safe actions (should pass all gates)', () => {
    it('should allow reading files', async () => {
      const check = await gateway.checkAction('read file config.yaml');
      expect(check.safe).toBe(true);
    });

    it('should allow writing to scratch files', async () => {
      const check = await gateway.checkAction('write output to /tmp/result.json');
      expect(check.safe).toBe(true);
    });

    it('should allow running tests', async () => {
      const check = await gateway.checkAction('run test suite npm test');
      expect(check.safe).toBe(true);
    });

    it('should allow AI completions', async () => {
      const check = await gateway.checkAction('call LLM with prompt: explain recursion');
      expect(check.safe).toBe(true);
    });
  });

  describe('Audit log', () => {
    it('should start with empty audit log', () => {
      expect(gateway.getAuditLog()).toHaveLength(0);
    });

    it('should log decisions after approval requests', async () => {
      await gateway.requestApproval(Gate.IRREVERSIBLE_ACTION, 'test', 'test action');
      expect(gateway.getAuditLog()).toHaveLength(1);
      expect(gateway.getAuditLog()[0].gate).toBe(Gate.IRREVERSIBLE_ACTION);
      expect(gateway.getAuditLog()[0].approved).toBe(false); // default deny
    });
  });
});

describe('safeExecute', () => {
  it('should execute safe functions normally', async () => {
    const result = await safeExecute('read config file', async () => 42);
    expect(result.result).toBe(42);
    expect(result.blocked).toBeUndefined();
  });

  it('should block unsafe functions', async () => {
    const result = await safeExecute('delete database', async () => 'should not run');
    expect(result.blocked).toBe(true);
    expect(result.gate).toBe(Gate.IRREVERSIBLE_ACTION);
    expect(result.result).toBeUndefined();
  });
});
