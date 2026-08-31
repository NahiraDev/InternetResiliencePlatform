import { describe, expect, it } from 'vitest';
import { MacOSSystem } from '../src/index.js';

describe('MacOSSystem', () => {
  it('initializes with autonomous mode disabled', () => {
    const system = new MacOSSystem();
    expect(system.getPolicy()).toEqual({ autonomousMode: false });
  });

  it('updates policy without exposing mutable internal state', async () => {
    const system = new MacOSSystem();
    await system.setAutonomousMode(true);
    const first = system.getPolicy();
    first.autonomousMode = false;
    expect(system.getPolicy()).toEqual({ autonomousMode: true });
  });

  it('reports unsupported platform deterministically outside macOS', async () => {
    const system = new MacOSSystem();
    const snapshot = await system.snapshot();
    if (process.platform !== 'darwin') {
      expect(snapshot.platform).toBe('unsupported');
      expect(snapshot.interfaces).toContain('macOS platform required');
      expect(snapshot.routes).toContain('macOS platform required');
      expect(snapshot.dns).toContain('macOS platform required');
    } else {
      expect(snapshot.platform).toBe('darwin');
    }
  });
});
