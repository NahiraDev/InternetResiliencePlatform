import { describe, expect, it } from 'vitest';
import {
  CapabilityDirectory, ChannelError, ControlApi, DeprecationPolicy, EventChannel, MigrationChain, PluginGovernanceError, PluginGovernor, WebhookVerifier,
  buildSdkContract, checkVersionBump, deliverWebhook, diffSchemas, satisfies, signManifest, signWebhook, validateAgainstSchema,
  type ApiActor, type PluginManifest, type WebhookSender,
} from '../src/index.js';

const actor: ApiActor = { id: 'op1', capabilities: ['read', 'write'] };
const mkApi = () => {
  const api = new ControlApi({ supportedVersions: ['1.0', '2.0'], nowMs: () => 0 });
  let n = 0;
  api.register({ method: 'GET', path: '/items/:id', since: '1.0', capability: 'read', schema: { verbose: { type: 'string' } }, handler: (c) => ({ id: c.params.id }) });
  api.register({ method: 'POST', path: '/items', since: '1.0', until: '2.0', capability: 'write', mutating: true, schema: { name: { type: 'string', required: true, maxLength: 5 } }, handler: () => ({ v: 1, n: ++n }) });
  api.register({ method: 'POST', path: '/items', since: '2.0', capability: 'write', mutating: true, schema: { name: { type: 'string', required: true, maxLength: 5 } }, handler: () => ({ v: 2, n: ++n }) });
  api.register({ method: 'GET', path: '/boom', since: '1.0', capability: 'read', schema: {}, handler: () => { throw new Error('secret detail'); } });
  return api;
};
const req = (o: object) => ({ method: 'GET', path: '/items/7', version: '1.0', actor, requestId: 'r1', ...o }) as never;

describe('Phase 135 API', () => {
  it('authenticates, authorizes, validates and versions', async () => {
    const api = mkApi();
    expect((await api.dispatch(req({ actor: undefined }))).status).toBe(401);
    expect((await api.dispatch(req({ actor: { id: 'x', capabilities: [] } }))).status).toBe(403);
    expect((await api.dispatch(req({ version: '9.9' }))).error?.code).toBe('unsupported-version');
    expect((await api.dispatch(req({ query: { bad: 'x' } }))).status).toBe(400);
    expect((await api.dispatch(req({}))).data).toEqual({ id: '7' });
    expect((await api.dispatch(req({ method: 'POST', path: '/items', body: { name: 'a' } }))).data).toMatchObject({ v: 1 });
    expect((await api.dispatch(req({ method: 'POST', path: '/items', version: '2.0', body: { name: 'a' } }))).data).toMatchObject({ v: 2 });
    expect((await api.dispatch(req({ method: 'POST', path: '/items', body: { name: 'toolong' } }))).status).toBe(400);
    const boom = await api.dispatch(req({ path: '/boom' }));
    expect(boom.status).toBe(500); expect(JSON.stringify(boom)).not.toContain('secret');
  });
  it('replays idempotent requests and detects key reuse', async () => {
    const api = mkApi();
    const post = (name: string, key: string) => api.dispatch(req({ method: 'POST', path: '/items', body: { name }, idempotencyKey: key }));
    const a = await post('a', 'k'); const b = await post('a', 'k');
    expect(b.replayed).toBe(true); expect(b.data).toEqual(a.data);
    expect((await post('b', 'k')).status).toBe(409);
    expect(validateAgainstSchema({ x: 1 }, {}).ok).toBe(false);
  });
});

describe('Phase 136 event channel', () => {
  const mk = () => { const c = new EventChannel(); c.declare({ type: 'path.down', version: '1', schema: { path: { type: 'string', required: true } } }); return c; };
  const ev = (id: string, payload: object = { path: 'wan1' }) => ({ id, type: 'path.down', version: '1', atMs: 0, payload });
  it('validates, dedupes, retries and dead-letters', () => {
    const c = mk(); c.subscribe({ id: 's1', types: ['path.down'], maxAttempts: 2, maxQueue: 2 });
    expect(c.publish(ev('e1'))).toBe(1); expect(c.publish(ev('e1'))).toBe(0);
    expect(() => c.publish(ev('e2', { nope: 1 }))).toThrow(ChannelError);
    const [d] = c.poll('s1');
    expect(c.nack('s1', d!)).toBe('requeued');
    const [d2] = c.poll('s1');
    expect(d2!.attempt).toBe(2);
    expect(c.nack('s1', d2!)).toBe('dead-lettered');
    c.publish(ev('e3')); c.publish(ev('e4')); c.publish(ev('e5'));
    expect(c.deadLetters.map((x) => x.reason)).toEqual(['max-attempts', 'queue-full']);
    expect(() => c.subscribe({ id: 'z', types: ['nope'] })).toThrow(ChannelError);
  });
});

describe('Phase 137 plugin governance', () => {
  const key = 'pub-key';
  const base = { id: 'p1', version: '1.2.0', publisher: 'acme', capabilities: ['probe'], requiresRuntime: '^1.0.0' };
  const gov = () => new PluginGovernor({ publisherKeys: { acme: key }, allowedCapabilities: ['probe'], runtimeVersion: '1.4.0', failureThreshold: 2 });
  const manifest = (o: Partial<PluginManifest> = {}): PluginManifest => { const m = { ...base, ...o }; return { ...m, signature: signManifest(m, key) }; };
  it('verifies signatures, enforces lifecycle and quarantines', () => {
    const g = gov(); g.register(manifest(), 0);
    expect(() => g.activate('p1', 1)).toThrow(PluginGovernanceError);
    g.verify('p1', 1); g.activate('p1', 2);
    expect(g.effectiveCapabilities('p1')).toEqual(['probe']);
    g.reportHealth('p1', false, 3); expect(g.get('p1')?.state).toBe('active');
    g.reportHealth('p1', false, 4); expect(g.get('p1')?.state).toBe('quarantined');
    expect(g.effectiveCapabilities('p1')).toEqual([]);
    expect(() => g.activate('p1', 5)).toThrow();
  });
  it('rejects tampering, forbidden capabilities, incompatibility and downgrade', () => {
    const g = gov();
    g.register({ ...manifest(), capabilities: ['probe', 'admin'] }, 0);
    expect(() => g.verify('p1', 1)).toThrow(/bad-signature/);
    g.register(manifest({ capabilities: ['admin'] }), 0); expect(() => g.verify('p1', 1)).toThrow(/capability-not-allowed/);
    g.register(manifest({ requiresRuntime: '^2.0.0' }), 0); expect(() => g.verify('p1', 1)).toThrow(/runtime-incompatible/);
    expect(() => g.register(manifest({ version: '1.0.0' }), 0)).toThrow(/downgrade/);
    g.register(manifest({ publisher: 'evil' }), 0); expect(() => g.verify('p1', 1)).toThrow(/untrusted/);
  });
});

describe('Phase 138 capability directory', () => {
  it('resolves live providers by version, region and priority', () => {
    const d = new CapabilityDirectory();
    d.announce({ id: 'a', capabilities: [{ name: 'dns', version: '1.0.0' }], priority: 1, heartbeatTtlMs: 100, region: 'eu' }, 0);
    d.announce({ id: 'b', capabilities: [{ name: 'dns', version: '1.2.0' }], priority: 1, heartbeatTtlMs: 100, region: 'us' }, 0);
    d.announce({ id: 'c', capabilities: [{ name: 'dns', version: '2.0.0' }], priority: 9, heartbeatTtlMs: 100 }, 0);
    expect(d.resolve({ capability: 'dns', range: '^1.0.0' }, 10)?.providerId).toBe('b');
    expect(d.resolve({ capability: 'dns', range: '^1.0.0', region: 'eu' }, 10)?.providerId).toBe('a');
    expect(d.resolve({ capability: 'dns' }, 10)?.providerId).toBe('c');
    expect(d.resolve({ capability: 'dns' }, 500)).toBeUndefined();
    expect(d.gaps(['dns', 'ntp'], 10)).toEqual(['ntp']);
    d.heartbeat('a', 450); expect(d.sweep(500)).toEqual(['b', 'c']);
    expect(satisfies('1.2.3', '~1.2.0')).toBe(true);
  });
});

describe('Phase 139 integrations', () => {
  it('signs, verifies, rejects replay/stale, retries and builds contract', async () => {
    const v = new WebhookVerifier('s'); const h = signWebhook('s', 1000, 'body');
    expect(v.verify(h, 'body', 1001).ok).toBe(true);
    expect(v.verify(h, 'body', 1002)).toEqual({ ok: false, reason: 'replayed' });
    expect(v.verify(signWebhook('s', 1000, 'x'), 'body', 1001)).toEqual({ ok: false, reason: 'bad-signature' });
    expect(v.verify(signWebhook('s', 1, 'b'), 'b', 5000)).toEqual({ ok: false, reason: 'stale' });
    expect(v.verify('junk', 'b', 1)).toEqual({ ok: false, reason: 'malformed' });
    const statuses = [503, 500, 200]; const waits: number[] = [];
    const sender: WebhookSender = { post: async () => ({ status: statuses.shift() as number }) };
    const out = await deliverWebhook({ id: 't', url: 'https://x.test/h', secret: 's' }, 'b', sender, { nowSec: () => 1, sleep: async (ms) => { waits.push(ms); } });
    expect(out).toMatchObject({ delivered: true, attempts: 3 }); expect(waits).toEqual([500, 1000]);
    expect((await deliverWebhook({ id: 't', url: 'http://x', secret: 's' }, 'b', sender, { nowSec: () => 1, sleep: async () => {} })).error).toBe('https-required');
    const c = buildSdkContract(mkApi());
    expect(c.operations.length).toBe(4); expect(c.digest).toHaveLength(64);
  });
});

describe('Phase 140 compatibility', () => {
  it('classifies changes, enforces bumps and deprecation, and migrates', () => {
    const before = { a: { type: 'string', required: true }, b: { type: 'number', max: 10 } } as const;
    const after = { a: { type: 'number', required: true }, b: { type: 'number', max: 5 }, c: { type: 'string', required: true } } as const;
    const ch = diffSchemas(before, after);
    expect(ch.filter((c) => c.breaking).map((c) => c.field).sort()).toEqual(['a', 'b', 'c']);
    expect(checkVersionBump('1.0.0', '1.1.0', ch).ok).toBe(false);
    expect(checkVersionBump('1.0.0', '2.0.0', ch).ok).toBe(true);
    expect(checkVersionBump('1.0.0', '1.0.0', []).reason).toBe('version-must-increase');
    const p = new DeprecationPolicy(1000);
    expect(() => p.announce({ target: '/old', announcedAtMs: 0, sunsetAtMs: 10 })).toThrow();
    p.announce({ target: '/old', announcedAtMs: 0, sunsetAtMs: 5000, replacement: '/new' });
    expect(p.status('/old', 100)).toBe('deprecated'); expect(p.status('/old', 6000)).toBe('sunset');
    expect(p.headers('/old', 100).link).toContain('successor-version');
    const m = new MigrationChain();
    m.add({ from: '1', to: '2', up: (x) => ({ ...x, full: x.name }), down: (x) => { const { full, ...r } = x; void full; return r; } });
    m.add({ from: '2', to: '3', up: (x) => ({ ...x, v: 3 }) });
    expect(m.migrate({ name: 'n' }, '1', '3')).toEqual({ name: 'n', full: 'n', v: 3 });
    expect(() => m.migrate({}, '3', '4')).toThrow(/no migration path/);
    expect(m.verifyRoundTrip([{ name: 'n' }])).toEqual([]);
  });
});
