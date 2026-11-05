import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PostgresDecisionStore } from '../src/persistence/postgres-decision-store.js';
import { PostgresIncidentStore } from '../src/persistence/postgres-incident-store.js';
import type { DecisionRecord, DecisionOutcome, PolicyEvaluation, RuntimeContext } from '../src/domain/types.js';
import type { ObservationBatch, Incident } from '../src/domain/types.js';

/**
 * Real-PostgreSQL integration tests. Set IRP_TEST_DATABASE_URL to a running PostgreSQL instance.
 * In CI (CI=true) a missing URL is a hard failure, never a silent skip.
 */
const adminUrl = process.env.IRP_TEST_DATABASE_URL;
if (!adminUrl && process.env.CI)
  throw new Error('IRP_TEST_DATABASE_URL is required in CI for the PostgreSQL integration tests.');
const maybe = adminUrl ? describe : describe.skip;

const DATABASE_URL =
  adminUrl ?? 'postgresql://nima@/tmp/pgtest?port=5433&dbname=irp_test';

const baseContext: RuntimeContext = {
  runtimeId: 'runtime-1',
  correlationId: 'corr-1',
  mode: 'live',
};

const baseRecord: DecisionRecord = {
  id: 'record-1',
  decisionId: 'decision-1',
  schemaVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  correlationId: 'corr-1',
  source: 'resilience-runtime',
  metadata: {},
  runtimeStateBefore: 'idle',
  runtimeStateAfter: 'observing',
  runtimeContext: baseContext,
  observations: [] as ObservationBatch['observations'],
  incidents: [] as Incident[],
  policyEvaluation: { allowed: true, reasons: [], requiredCapabilities: [] } as PolicyEvaluation,
  candidates: [],
  outcome: 'success' as DecisionOutcome,
  confidence: 0.95,
  durationMs: 42,
  explanation: ['test decision'],
};

const baseIncident: Incident = {
  id: 'incident-1',
  schemaVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  correlationId: 'corr-1',
  source: 'resilience-runtime',
  metadata: {},
  rootCause: 'gateway unreachable',
  affectedComponents: ['gateway-1', 'tunnel-1'],
  confidence: 0.9,
  evidence: ['probe timeout'],
  correlationReason: 'all paths through gateway-1 failed',
  classification: 'network_failure',
};

maybe('PostgresDecisionStore — real PostgreSQL integration', () => {
  let store: PostgresDecisionStore;

  beforeAll(async () => {
    store = new PostgresDecisionStore({
      host: '/tmp/pgtest',
      port: 5433,
      database: 'irp_test',
      user: 'nima',
      password: '',
      ssl: false,
    });
    await store.initialize();
  });

  afterAll(async () => {
    await store.close();
  });

  it('creates the decisions table on initialize', async () => {
    const result = await store.get('nonexistent-table-check');
    expect(result).toBeUndefined();
  });

  it('puts and gets a decision record', async () => {
    await store.put(baseRecord);
    const result = await store.get('record-1');
    expect(result).toBeDefined();
    expect(result?.decisionId).toBe('decision-1');
    expect(result?.outcome).toBe('success');
    expect(result?.confidence).toBe(0.95);
  });

  it('returns undefined for missing decision', async () => {
    const result = await store.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('lists all decisions', async () => {
    await store.put({ ...baseRecord, id: 'record-2', decisionId: 'decision-2' });
    const results = await store.list();
    expect(results.length).toBeGreaterThanOrEqual(2);
    const ids = results.map((r) => r.decisionId);
    expect(ids).toContain('decision-1');
    expect(ids).toContain('decision-2');
  });

  it('updates an existing decision record (upsert)', async () => {
    await store.put({ ...baseRecord, id: 'record-1', decisionId: 'decision-1', confidence: 0.5 });
    const result = await store.get('record-1');
    expect(result?.confidence).toBe(0.5);
  });

  it('supports concurrent writes', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      store.put({ ...baseRecord, id: `concurrent-${i}`, decisionId: `dec-concurrent-${i}`, confidence: i / 10 }),
    );
    await Promise.all(promises);
    const results = await store.list();
    const concurrentIds = results.filter((r) => r.decisionId?.startsWith('dec-concurrent-'));
    expect(concurrentIds.length).toBe(10);
  });

  it('survives store restart (re-initialize and re-read)', async () => {
    // Use a separate store instance so the main store stays open
    const store2 = new PostgresDecisionStore({
      host: '/tmp/pgtest',
      port: 5433,
      database: 'irp_test',
      user: 'nima',
      password: '',
      ssl: false,
    });
    await store2.initialize();
    const result = await store2.get('record-1');
    expect(result).toBeDefined();
    expect(result?.decisionId).toBe('decision-1');
    await store2.close();
  });

  it('reports persistent store status', () => {
    const status = store.status();
    expect(status.persistent).toBe(true);
    expect(status.store).toBe('postgresql');
  });
});

maybe('PostgresIncidentStore — real PostgreSQL integration', () => {
  let store: PostgresIncidentStore;

  beforeAll(async () => {
    store = new PostgresIncidentStore({
      host: '/tmp/pgtest',
      port: 5433,
      database: 'irp_test',
      user: 'nima',
      password: '',
      ssl: false,
    });
    await store.initialize();
  });

  afterAll(async () => {
    await store.close();
  });

  it('creates the incidents table on initialize', async () => {
    const result = await store.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it('puts and gets an incident', async () => {
    await store.put(baseIncident);
    const results = await store.list();
    const found = results.find((i) => i.id === 'incident-1');
    expect(found).toBeDefined();
    expect(found?.rootCause).toBe('gateway unreachable');
    expect(found?.classification).toBe('network_failure');
  });

  it('supports concurrent writes', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      store.put({ ...baseIncident, id: `incident-concurrent-${i}`, rootCause: `cause-${i}` }),
    );
    await Promise.all(promises);
    const results = await store.list();
    const concurrentIds = results.filter((i) => i.id?.startsWith('incident-concurrent-'));
    expect(concurrentIds.length).toBe(10);
  });

  it('reports persistent store status', () => {
    const status = store.status();
    expect(status.persistent).toBe(true);
    expect(status.store).toBe('postgresql');
  });
});
