import { describe, expect, it } from 'vitest';
import {
  channels,
  redactSecrets,
  registeredDesktopChannels,
  validateRequest,
} from '../src/shared/ipc-contracts.js';
describe('Phase 20 desktop IPC security', () => {
  it('keeps an explicit allowlist without shell-like channels', () => {
    expect(registeredDesktopChannels()).toEqual(Object.values(channels));
    expect(registeredDesktopChannels().join(' ')).not.toMatch(
      /execute|command|shell|invoke-anything/,
    );
  });
  it('validates empty and demo scenario payloads', () => {
    expect(validateRequest(channels.networkGetStatus, {})).toBeNull();
    expect(validateRequest(channels.networkGetStatus, { unexpected: true })?.code).toBe(
      'IPC_VALIDATION',
    );
    expect(validateRequest(channels.demoSetScenario, { scenario: 'dns-leak' })).toBeNull();
    expect(validateRequest(channels.demoSetScenario, { scenario: '../etc/passwd' })?.code).toBe(
      'IPC_VALIDATION',
    );
  });
  it('redacts diagnostic secrets', () => {
    expect(redactSecrets({ token: 'abc', nested: { privateKey: 'def', safe: 'ok' } })).toEqual({
      token: '[REDACTED]',
      nested: { privateKey: '[REDACTED]', safe: 'ok' },
    });
  });
});
