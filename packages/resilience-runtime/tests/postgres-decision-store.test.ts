import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PostgresDecisionStore } from '../src/persistence/postgres-decision-store.js';
import type { DecisionRecord, DecisionOutcome, PolicyEvaluation, RuntimeContext } from '../src/domain/types.js';
import type { ObservationBatch, Incident } from '../src/domain/types.js';

const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
};

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn(function () {
      return mockPool;
    }),
  },
  Pool: vi.fn(function () {
    return mockPool;
  }),
}));

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

const _dbRow = {
  ...baseRecord,
  metadata: '{}',
  runtime_context: '{}',
  observations: '[]',
  incidents: '[]',
  policy_evaluation: '{}',
  candidates: '[]',
  explanation: '[]',
  selected_plan: null,
  validation: null,
  execution_result: null,
  verification_result: null,
  recovery_result: null,
};

describe('PostgresDecisionStore', () => {
  let store: PostgresDecisionStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new PostgresDecisionStore({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
    });
    // Bypass initialize for testing
    (store as { pool: unknown }).pool = mockPool;
  });

  afterEach(async () => {
    await store.close().catch(() => undefined);
  });

  it('initializes schema on startup', async () => {
    await store.initialize();
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS decisions'),
    );
  });

  it('validates config and fails closed on missing fields', () => {
    expect(() => {
      new PostgresDecisionStore({
        host: '',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test',
      }).assertValidConfig();
    }).toThrow(/host, database, and user/);
  });

  it('validates port range', () => {
    expect(() => {
      new PostgresDecisionStore({
        host: 'localhost',
        port: -1,
        database: 'test',
        user: 'test',
        password: 'test',
      }).assertValidConfig();
    }).toThrow(/valid port/);
  });

  it('puts a decision record', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    await store.put(baseRecord);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO decisions'),
      expect.arrayContaining([
        'record-1',
        'decision-1',
        1,
        '2026-01-01T00:00:00.000Z',
        'corr-1',
        'resilience-runtime',
        '{}',
        'idle',
        'observing',
      ]),
    );
  });

  it('gets a decision record by id', async () => {
    // pg returns snake_case column names for SQL columns
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'record-1',
        decision_id: 'decision-1',
        schema_version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        correlation_id: 'corr-1',
        source: 'resilience-runtime',
        metadata: {},
        runtime_state_before: 'idle',
        runtime_state_after: 'observing',
        runtime_context: baseContext,
        observations: [],
        incidents: [],
        policy_evaluation: { allowed: true, reasons: [], requiredCapabilities: [] },
        candidates: [],
        selected_plan: null,
        validation: null,
        execution_result: null,
        verification_result: null,
        recovery_result: null,
        outcome: 'success',
        confidence: 0.95,
        duration_ms: 42,
        explanation: ['test decision'],
      }],
    });
    const result = await store.get('record-1');
    expect(result).toBeDefined();
    expect(result?.decisionId).toBe('decision-1');
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM decisions WHERE id = $1'),
      ['record-1'],
    );
  });

  it('lists all decisions', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'record-1',
        decision_id: 'decision-1',
        schema_version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        correlation_id: 'corr-1',
        source: 'resilience-runtime',
        metadata: {},
        runtime_state_before: 'idle',
        runtime_state_after: 'observing',
        runtime_context: baseContext,
        observations: [],
        incidents: [],
        policy_evaluation: { allowed: true, reasons: [], requiredCapabilities: [] },
        candidates: [],
        selected_plan: null,
        validation: null,
        execution_result: null,
        verification_result: null,
        recovery_result: null,
        outcome: 'success',
        confidence: 0.95,
        duration_ms: 42,
        explanation: ['test decision'],
      }],
    });
    const results = await store.list();
    expect(results.length).toBe(1);
    expect(results[0].decisionId).toBe('decision-1');
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'));
  });

  it('closes the pool', async () => {
    await store.close();
    expect(mockPool.end).toHaveBeenCalled();
  });
});
