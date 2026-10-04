import { describe, expect, it } from 'vitest';
import { PolicyRegistry } from '../src/policy/index.js';
import { RuntimePolicyArbitrator } from '../src/policy/policy.js';
import { createPolicySnapshot, defaultPolicy } from '../src/context/context.js';

describe('Phase 4: Policy Composition & Versioning', () => {

  it('creates default registry with safe policy', () => {
    const registry = new PolicyRegistry();
    expect(registry.getCurrentVersion()).toBe('0.1.0');
    const snapshot = registry.getCurrent();
    expect(snapshot.policy).toEqual(defaultPolicy('safe'));
  });

  it('proposes new versions with semantic versioning', () => {
    const registry = new PolicyRegistry();
    registry.propose(
      { ...defaultPolicy('simulation'), allowedActions: ['dns_switch', 'noop'] },
      'test-user',
      'Add dns_switch to allowed actions',
      'minor',
    );
    expect(registry.getCurrentVersion()).toBe('0.2.0');

    registry.propose(
      {
        ...defaultPolicy('simulation'),
        allowedActions: ['dns_switch', 'connectivity_failover', 'noop'],
      },
      'test-user',
      'Add connectivity_failover',
      'patch',
    );
    expect(registry.getCurrentVersion()).toBe('0.2.1');

    registry.propose(
      { ...defaultPolicy('simulation'), actionBudget: 100 },
      'test-user',
      'Increase action budget',
      'major',
    );
    expect(registry.getCurrentVersion()).toBe('1.0.0');
  });

  it('rolls back to previous version', () => {
    const registry = new PolicyRegistry();
    registry.propose(
      { ...defaultPolicy('simulation'), allowedActions: ['dns_switch'] },
      'u1',
      'v1',
    );
    registry.propose(
      { ...defaultPolicy('simulation'), allowedActions: ['dns_switch', 'noop'] },
      'u1',
      'v2',
    );
    expect(registry.getCurrentVersion()).toBe('0.3.0');

    const rolledBack = registry.rollback('0.1.0', 'admin');
    expect(rolledBack).toBe(true);
    expect(registry.getCurrentVersion()).toBe('0.1.0');
    expect(registry.getCurrent().policy.allowedActions).toEqual(
      defaultPolicy('safe').allowedActions,
    );
  });

  it('rejects rollback to non-existent version', () => {
    const registry = new PolicyRegistry();
    expect(registry.rollback('99.99.99', 'admin')).toBe(false);
    expect(registry.getCurrentVersion()).toBe('0.1.0');
  });

  it('lists all versions in chronological order', () => {
    const registry = new PolicyRegistry();
    registry.propose(
      { ...defaultPolicy('simulation'), allowedActions: ['dns_switch'] },
      'u1',
      'v1',
    );
    registry.propose(
      { ...defaultPolicy('simulation'), allowedActions: ['dns_switch', 'noop'] },
      'u1',
      'v2',
    );

    const versions = registry.listVersions();
    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBe('0.1.0');
    expect(versions[1].version).toBe('0.2.0');
    expect(versions[2].version).toBe('0.3.0');
  });

  it('resolves policy conflicts with domain-specific strategies', () => {
    const registry = new PolicyRegistry();
    const policyA = {
      ...defaultPolicy('simulation'),
      allowedActions: ['dns_switch', 'noop'],
      deniedActions: [],
      confidenceThreshold: 0.5,
    };
    const policyB = {
      ...defaultPolicy('simulation'),
      allowedActions: ['connectivity_failover', 'noop'],
      deniedActions: ['dns_switch'],
      confidenceThreshold: 0.7,
    };

    // Security domain: intersection (stricter)
    const secResult = registry.resolveConflict(policyA, policyB, 'security');
    expect(secResult.merged.allowedActions).toEqual(['noop']); // intersection
    expect(secResult.conflicts).toContain('allowedActions differ');
    expect(secResult.conflicts).toContain('deniedActions differ');
    expect(secResult.merged.confidenceThreshold).toBe(0.7); // intersection -> max

    // DNS domain: union (more permissive)
    const dnsResult = registry.resolveConflict(policyA, policyB, 'dns');
    expect(dnsResult.merged.allowedActions).toEqual(
      expect.arrayContaining(['dns_switch', 'connectivity_failover', 'noop']),
    );
    expect(dnsResult.merged.confidenceThreshold).toBe(0.5); // union -> min

    // Global domain: hierarchical (first wins)
    const globalResult = registry.resolveConflict(policyA, policyB, 'global');
    expect(globalResult.merged.allowedActions).toEqual(policyA.allowedActions);
    expect(globalResult.merged.confidenceThreshold).toBe(0.5); // first wins
  });

  it('supports custom domain resolutions', () => {
    const registry = new PolicyRegistry({
      domainResolutions: {
        dns: { domain: 'dns', strategy: 'intersection' },
      },
    });

    const policyA = { ...defaultPolicy('simulation'), allowedActions: ['dns_switch', 'noop'] };
    const policyB = {
      ...defaultPolicy('simulation'),
      allowedActions: ['connectivity_failover', 'noop'],
    };

    const result = registry.resolveConflict(policyA, policyB, 'dns');
    expect(result.merged.allowedActions).toEqual(['noop']); // intersection due to custom config
  });

  it('exposes domain resolutions', () => {
    const registry = new PolicyRegistry();
    expect(registry.getDomainResolution('security').strategy).toBe('security-strict');
    expect(registry.getDomainResolution('dns').strategy).toBe('union');
    expect(registry.getDomainResolution('routing').strategy).toBe('hierarchical');
  });

  it('delegates snapshot conflict resolution to the canonical registry', () => {
    const first = createPolicySnapshot({
      ...defaultPolicy('simulation'),
      actionBudget: 1,
      confidenceThreshold: 0.4,
      failClosed: false,
    });
    const second = createPolicySnapshot({
      ...defaultPolicy('simulation'),
      allowedActions: ['dns_switch'],
      actionBudget: 5,
      confidenceThreshold: 0.8,
      failClosed: true,
    });
    const result = new RuntimePolicyArbitrator().resolvePolicyConflicts(
      first,
      second,
      'intersection',
    );

    expect(result.merged.policy.actionBudget).toBe(5);
    expect(result.merged.policy.confidenceThreshold).toBe(0.8);
    expect(result.merged.policy.failClosed).toBe(false);
    expect(result.conflicts.map((conflict) => conflict.reason)).toEqual(['allowedActions differ']);
  });

  it('uses independently constructed registries instead of shared global state', () => {
    const first = new PolicyRegistry();
    const second = new PolicyRegistry();
    expect(first).not.toBe(second);
    expect(first.getCurrentVersion()).toBe(second.getCurrentVersion());
  });
});
