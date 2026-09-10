import { describe, expect, it } from 'vitest';
import {
  createNetworkIntent,
  isIntentEffective,
  isIntentTerminal,
  transitionIntent,
} from './intent.js';

describe('network intent lifecycle', () => {
  const base = () => createNetworkIntent({
    id: 'intent-1',
    priority: 'high',
    spec: { outcome: 'maintain connectivity', target: { service: 'internet' } },
    effectiveFrom: '2026-09-10T10:00:00.000Z',
    expiresAt: '2026-09-10T12:00:00.000Z',
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-10T09:00:00.000Z',
  });

  it('creates immutable draft intents at version one', () => {
    const intent = base();
    expect(intent.status).toBe('draft');
    expect(intent.version).toBe(1);
    expect(Object.isFrozen(intent)).toBe(true);
  });

  it('supports only declared lifecycle transitions', () => {
    const active = transitionIntent(base(), { type: 'activate', at: '2026-09-10T10:00:00Z' });
    const completed = transitionIntent(active, { type: 'complete', at: '2026-09-10T11:00:00Z' });
    expect(active.version).toBe(2);
    expect(completed.version).toBe(3);
    expect(completed.status).toBe('completed');
    expect(isIntentTerminal(completed)).toBe(true);
    expect(() => transitionIntent(completed, { type: 'cancel' })).toThrow();
  });

  it('rejects invalid transitions', () => {
    expect(() => transitionIntent(base(), { type: 'complete' })).toThrow(/Invalid intent transition/);
  });

  it('evaluates effective windows as half-open intervals', () => {
    const active = transitionIntent(base(), { type: 'activate', at: '2026-09-10T10:00:00Z' });
    expect(isIntentEffective(active, new Date('2026-09-10T10:00:00Z'))).toBe(true);
    expect(isIntentEffective(active, new Date('2026-09-10T11:59:59Z'))).toBe(true);
    expect(isIntentEffective(active, new Date('2026-09-10T12:00:00Z'))).toBe(false);
  });

  it('preserves the replacement identity when superseding', () => {
    const active = transitionIntent(base(), { type: 'activate' });
    const superseded = transitionIntent(active, {
      type: 'supersede',
      replacementId: 'intent-2',
    });
    expect(superseded.status).toBe('superseded');
    expect(superseded.supersedes).toBe('intent-2');
    expect(superseded.version).toBe(3);
  });

  it('fails closed on invalid timestamps and windows', () => {
    expect(() => createNetworkIntent({
      id: 'bad',
      priority: 'normal',
      spec: { outcome: 'x' },
      effectiveFrom: '2026-09-10T12:00:00Z',
      expiresAt: '2026-09-10T10:00:00Z',
    })).toThrow(/effectiveFrom/);
    expect(() => createNetworkIntent({
      id: 'bad-time',
      priority: 'normal',
      spec: { outcome: 'x' },
      createdAt: 'not-a-date',
    })).toThrow(/ISO-8601/);
  });
});
