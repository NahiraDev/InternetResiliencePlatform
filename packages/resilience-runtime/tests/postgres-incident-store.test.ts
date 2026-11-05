import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PostgresIncidentStore } from '../src/persistence/postgres-incident-store.js';
import type { Incident } from '../src/domain/types.js';

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

describe('PostgresIncidentStore', () => {
  let store: PostgresIncidentStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new PostgresIncidentStore({
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
      expect.stringContaining('CREATE TABLE IF NOT EXISTS incidents'),
    );
  });

  it('validates config and fails closed on missing fields', () => {
    expect(() => {
      new PostgresIncidentStore({
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
      new PostgresIncidentStore({
        host: 'localhost',
        port: 99999,
        database: 'test',
        user: 'test',
        password: 'test',
      }).assertValidConfig();
    }).toThrow(/valid port/);
  });

  it('puts an incident', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    await store.put(baseIncident);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO incidents'),
      expect.arrayContaining([
        'incident-1',
        1,
        '2026-01-01T00:00:00.000Z',
        'corr-1',
        'resilience-runtime',
        '{}',
        'gateway unreachable',
        '["gateway-1","tunnel-1"]',
        0.9,
        '["probe timeout"]',
        'all paths through gateway-1 failed',
        'network_failure',
      ]),
    );
  });

  it('lists all incidents', async () => {
    // pg returns snake_case column names for SQL columns
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'incident-1',
        schema_version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        correlation_id: 'corr-1',
        source: 'resilience-runtime',
        metadata: {},
        root_cause: 'gateway unreachable',
        affected_components: ['gateway-1'],
        confidence: 0.9,
        evidence: ['probe'],
        correlation_reason: 'all paths through gateway-1 failed',
        classification: 'network_failure',
      }],
    });
    const results = await store.list();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('incident-1');
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'));
  });

  it('closes the pool', async () => {
    await store.close();
    expect(mockPool.end).toHaveBeenCalled();
  });
});
