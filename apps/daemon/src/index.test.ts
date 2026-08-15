import { describe, expect, it } from 'vitest';
import { createDaemon } from './index.js';

describe('daemon factory', () => {
  it('creates an application without starting host services', () => {
    const daemon = createDaemon();
    expect(daemon.state).toBe('created');
    expect(daemon.providers.length).toBeGreaterThan(0);
  });
});
