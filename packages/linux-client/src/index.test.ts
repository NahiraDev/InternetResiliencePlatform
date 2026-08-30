import { describe, expect, it } from 'vitest';
import { LinuxSystem } from './index.js';

describe('LinuxSystem', () => {
  it('starts with autonomous mode disabled', () => {
    expect(new LinuxSystem().getPolicy()).toEqual({ autonomousMode: false });
  });

  it('changes autonomous mode deterministically', async () => {
    const system = new LinuxSystem();
    await system.setAutonomousMode(true);
    expect(system.getPolicy()).toEqual({ autonomousMode: true });
    await system.setAutonomousMode(false);
    expect(system.getPolicy()).toEqual({ autonomousMode: false });
  });

  it('returns a defensive policy copy', async () => {
    const system = new LinuxSystem();
    await system.setAutonomousMode(true);
    const policy = system.getPolicy();
    policy.autonomousMode = false;
    expect(system.getPolicy().autonomousMode).toBe(true);
  });
});
