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

describe('MacOSClientServer /policy', () => {
  const run = async (token: string | undefined) => {
    const { MacOSClientServer } = await import('../src/index.js');
    const system = new MacOSSystem();
    const server = new MacOSClientServer(system, token);
    await server.start(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no tcp address');
    return { server, system, port: address.port };
  };

  it('rejects unauthenticated, form-encoded and cross-origin requests and changes nothing', async () => {
    const { server, system, port } = await run('t'.repeat(64));
    try {
      const url = `http://127.0.0.1:${port}/policy`;
      expect((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'autonomousMode=true' })).status).toBe(415);
      expect((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"autonomousMode":true}' })).status).toBe(401);
      expect((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${'t'.repeat(64)}`, origin: 'https://evil.example' }, body: '{"autonomousMode":true}' })).status).toBe(403);
      expect(system.getPolicy().autonomousMode).toBe(false);
    } finally {
      await server.stop();
    }
  });

  it('is disabled without a token and works with a valid one', async () => {
    const off = await run(undefined);
    try {
      const r = await fetch(`http://127.0.0.1:${off.port}/policy`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer x' }, body: '{"autonomousMode":true}' });
      expect(r.status).toBe(403);
    } finally { await off.server.stop(); }
    const on = await run('k'.repeat(64));
    try {
      const r = await fetch(`http://127.0.0.1:${on.port}/policy`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${'k'.repeat(64)}` }, body: '{"autonomousMode":true}' });
      expect(r.status).toBe(200);
      expect(on.system.getPolicy().autonomousMode).toBe(true);
    } finally { await on.server.stop(); }
  });
});
