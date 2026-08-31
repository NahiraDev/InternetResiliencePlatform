import { describe, expect, it } from 'vitest';
import { WindowsSystem } from './index.js';

describe('WindowsSystem', () => {
  it('does not execute Windows commands on non-Windows hosts', async () => {
    if (process.platform === 'win32') return;
    const snapshot = await new WindowsSystem().snapshot();
    expect(snapshot.platform).toBe('unsupported');
    expect(snapshot.interfaces).toContain('Windows platform required');
  });

  it('returns an isolated policy snapshot', async () => {
    const system = new WindowsSystem();
    await system.setAutonomousMode(true);
    const policy = system.getPolicy();
    expect(policy.autonomousMode).toBe(true);
  });
});
