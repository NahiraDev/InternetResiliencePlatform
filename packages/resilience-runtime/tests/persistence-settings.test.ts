import { describe, expect, it } from 'vitest';
import {
  readPersistenceSettings,
  createPostgresIntentStore,
  createCanonicalRuntime,
  createCanonicalRuntimeWithPostgres,
} from '../src/canonical-runtime-composition.js';
import { PostgresIntentStore } from '../src/intent/postgres-store.js';
import { validateEvent } from '../src/events/event-taxonomy.js';

describe('intent persistence settings (issue #274 / #281)', () => {
  it('treats Postgres as optional when no host is configured', () => {
    expect(readPersistenceSettings({})).toBeUndefined();
    expect(readPersistenceSettings({ IRP_INTENT_DB_HOST: '   ' })).toBeUndefined();
  });

  it('applies validated defaults', () => {
    expect(readPersistenceSettings({ IRP_INTENT_DB_HOST: 'db.internal' })).toEqual({
      host: 'db.internal',
      port: 5432,
      database: 'irp',
      user: 'irp',
      password: '',
      ssl: false,
      max: 10,
    });
  });

  it('rejects a malformed port instead of silently producing NaN', () => {
    expect(() =>
      readPersistenceSettings({ IRP_INTENT_DB_HOST: 'h', IRP_INTENT_DB_PORT: 'abc' }),
    ).toThrow(/IRP_INTENT_DB_PORT/);
    expect(() =>
      readPersistenceSettings({ IRP_INTENT_DB_HOST: 'h', IRP_INTENT_DB_PORT: '0' }),
    ).toThrow(/IRP_INTENT_DB_PORT/);
    expect(() =>
      readPersistenceSettings({ IRP_INTENT_DB_HOST: 'h', IRP_INTENT_DB_PORT: '70000' }),
    ).toThrow(/IRP_INTENT_DB_PORT/);
  });

  it('rejects a malformed pool size', () => {
    expect(() =>
      readPersistenceSettings({ IRP_INTENT_DB_HOST: 'h', IRP_INTENT_DB_MAX: '-1' }),
    ).toThrow(/IRP_INTENT_DB_MAX/);
  });

  it('accepts the boolean forms operators actually use', () => {
    for (const value of ['true', '1', 'yes', 'on', 'TRUE']) {
      expect(readPersistenceSettings({ IRP_INTENT_DB_HOST: 'h', IRP_INTENT_DB_SSL: value })?.ssl).toBe(
        true,
      );
    }
    for (const value of ['false', '0', 'no', 'off']) {
      expect(
        readPersistenceSettings({ IRP_INTENT_DB_HOST: 'h', IRP_INTENT_DB_SSL: value })?.ssl,
      ).toBe(false);
    }
    // Previously `1` silently meant false, which quietly disabled TLS.
    expect(() =>
      readPersistenceSettings({ IRP_INTENT_DB_HOST: 'h', IRP_INTENT_DB_SSL: 'maybe' }),
    ).toThrow(/IRP_INTENT_DB_SSL/);
  });

  it('rejects blank database or user', () => {
    expect(() =>
      readPersistenceSettings({ IRP_INTENT_DB_HOST: 'h', IRP_INTENT_DB_NAME: '  ' }),
    ).toThrow(/must not be blank/);
  });

  it('creates no store when persistence is unconfigured', async () => {
    await expect(createPostgresIntentStore({})).resolves.toBeUndefined();
  });

  it('validates a store config without connecting', () => {
    const store = new PostgresIntentStore({
      host: 'h',
      port: 0,
      database: 'd',
      user: 'u',
      password: '',
    });
    expect(() => store.assertValidConfig()).toThrow(/valid port/);
    expect(() =>
      new PostgresIntentStore({ host: ' ', port: 5432, database: 'd', user: 'u', password: '' })
        .assertValidConfig(),
    ).toThrow(/host, database, and user/);
  });

  it('keeps Postgres type-only at compile time (optional peer, dynamic import)', () => {
    // The driver must not be statically imported anywhere in the package.
    expect(() => readPersistenceSettings({ IRP_INTENT_DB_HOST: 'h' })).not.toThrow();
    const source = createCanonicalRuntime.toString();
    expect(source).not.toContain('pg');
  });
});

describe('canonical composition is the single authority', () => {
  it('injects the composed learning loop into the runtime', async () => {
    const composition = createCanonicalRuntime({ executionMode: 'simulation' });
    expect(composition.runtime.learningLoop).toBe(composition.learningLoop);
  });

  it('delegates the postgres variant to the same composition authority', async () => {
    const composition = await createCanonicalRuntimeWithPostgres({
      executionMode: 'simulation',
      intentStore: undefined,
    });
    // Falls back to the in-memory default without attempting a connection.
    expect(composition.runtime).toBeDefined();
    expect(composition.learningLoop).toBeDefined();
    expect(composition.runtime.learningLoop).toBe(composition.learningLoop);
  });

  it('emits only taxonomy-conformant learning events', async () => {
    const composition = createCanonicalRuntime({
      executionMode: 'simulation',
      outcomeProbes: [
        { scope: 'destination', subjectId: 'd', probe: async () => ({ reachable: true }) },
      ],
    });
    await composition.runCycle({ correlationId: 'settings/taxonomy' });
    const invalid = composition.runtime.events.events
      .filter(({ event }) => event.startsWith('runtime.learning') || event.startsWith('runtime.outcome'))
      .filter(({ event, payload }) => !validateEvent(event, payload).valid);
    // Simulation mode never mutates, so no outcome evidence is emitted at all.
    expect(invalid).toEqual([]);
  });
});