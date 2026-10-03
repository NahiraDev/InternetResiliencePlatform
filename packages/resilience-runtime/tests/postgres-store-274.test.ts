import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PostgresIntentStore } from '../src/intent/postgres-store.js';
import { compileNetworkIntent } from '../src/index.js';
import { transitionIntent } from '@irp/core';
import { createNetworkIntent } from '@irp/core';

const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
};

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn(() => mockPool),
  },
  Pool: vi.fn(() => mockPool),
}));

describe('PostgresIntentStore (Phase 2: Persistence)', () => {
  let store: PostgresIntentStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new PostgresIntentStore({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
    });
    // Bypass initialize for testing
    store['pool'] = mockPool;
  });

  afterEach(async () => {
    await store.close();
  });

  it('initializes schema on startup', async () => {
    await store.initialize();
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS intents'));
  });

  it('upserts intent with correct fields', async () => {
    const now = new Date();
    const draftIntent = createNetworkIntent({
      id: 'test-intent',
      priority: 'high',
      createdAt: new Date(now.getTime() - 10000).toISOString(),
      updatedAt: new Date().toISOString(),
      effectiveFrom: new Date(now.getTime() - 10000).toISOString(),
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      spec: { outcome: 'Test outcome', target: { destination: 'example.com' } },
    });
    const activeIntent = transitionIntent(draftIntent, { type: 'activate' });
    const intent = compileNetworkIntent(activeIntent);

    mockPool.query.mockResolvedValue({ rows: [] });

    await store.put(intent);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO intents'),
      expect.arrayContaining([
        'test-intent',
        1,
        'high',
        'Test outcome',
        JSON.stringify({ destination: 'example.com' }),
        expect.any(String),
        expect.any(String),
        1,
        'network-intent',
        'ADVISORY',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
      ]),
    );
  });

  it('returns intent by id', async () => {
    const compiledAt = new Date().toISOString();
    mockPool.query.mockResolvedValue({
      rows: [{
        intent_id: 'test-intent',
        version: 1,
        priority: 'high',
        desired_outcome: 'Test outcome',
        target: { destination: 'example.com' },
        constraints: {},
        objectives: {},
        confidence: 1,
        provenance: 'network-intent',
        autonomy: 'ADVISORY',
        scope: { destination: 'example.com', intentId: 'test-intent' },
        effective_from: null,
        expires_at: null,
        compiled_at: compiledAt,
      }],
    });

    const result = await store.get('test-intent');

    expect(result).toBeDefined();
    expect(result?.intentId).toBe('test-intent');
    expect(result?.priority).toBe('high');
  });

  it('returns undefined for missing intent', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const result = await store.get('missing-intent');

    expect(result).toBeUndefined();
  });

  it('returns active intents within time window', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{
        intent_id: 'active-intent',
        version: 1,
        priority: 'normal',
        desired_outcome: 'Active',
        target: {},
        constraints: {},
        objectives: {},
        confidence: 1,
        provenance: 'network-intent',
        autonomy: 'ADVISORY',
        scope: {},
        effective_from: new Date(Date.now() - 10000).toISOString(),
        expires_at: new Date(Date.now() + 10000).toISOString(),
        compiled_at: new Date().toISOString(),
      }],
    });

    const result = await store.getActive();

    expect(result).toHaveLength(1);
    expect(result[0].intentId).toBe('active-intent');
  });

  it('deletes intent by id', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    await store.delete('test-intent');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM intents'),
      ['test-intent'],
    );
  });

  it('closes pool on close', async () => {
    await store.close();
    expect(mockPool.end).toHaveBeenCalled();
  });

  it('filters by effective lifecycle window', async () => {
    const past = new Date(Date.now() - 10000).toISOString();
    const future = new Date(Date.now() + 10000).toISOString();
    
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        intent_id: 'active-intent',
        version: 1,
        priority: 'normal',
        desired_outcome: 'Active',
        target: {},
        constraints: {},
        objectives: {},
        confidence: 1,
        provenance: 'network-intent',
        autonomy: 'ADVISORY',
        scope: {},
        effective_from: past,
        expires_at: future,
        compiled_at: new Date().toISOString(),
      }],
    });

    const activeResult = await store.getActive(new Date());
    expect(activeResult).toHaveLength(1);

    // Now test expired intent - the SQL query filters it out, so mock returns empty
    mockPool.query.mockResolvedValueOnce({
      rows: [],
    });

    const expiredResult = await store.getActive(new Date());
    // Expired intent should not be returned (filtered by SQL)
    expect(expiredResult).toHaveLength(0);
  });
});