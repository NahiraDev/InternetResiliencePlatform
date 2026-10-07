import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ValidationAppError, ConflictAppError, NotFoundAppError } from '@irp/core';
import {
  DatabaseIntentStore,
  InMemoryIntentStore,
  registerIntentRoutes,
  type ArbitrationConflict,
} from './intent-api.js';

describe('intent API', () => {
  const build = async () => {
    const app = Fastify();
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof ValidationAppError) return reply.code(400).send({ success: false });
      if (error instanceof ConflictAppError) return reply.code(409).send({ success: false });
      if (error instanceof NotFoundAppError) return reply.code(404).send({ success: false });
      if (error instanceof Error && error.name === 'ZodError')
        return reply.code(400).send({ success: false });
      return reply.code(500).send({ success: false });
    });
    registerIntentRoutes(app, {
      store: new InMemoryIntentStore(),
      requirePermission: async () => ({ id: 'test-principal', roles: ['admin'], scopes: ['*'] }),
    });
    return app;
  };

  it('creates a draft intent with an idempotency key', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intents',
      headers: { 'idempotency-key': 'create-1' },
      payload: {
        id: 'intent-1',
        priority: 'high',
        spec: { outcome: 'maintain connectivity', constraints: { latencyMs: 100 } },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ id: 'intent-1', version: 1, status: 'draft' });
    await app.close();
  });

  it('replays the same idempotent request without creating a second intent', async () => {
    const app = await build();
    const payload = { id: 'intent-1', spec: { outcome: 'maintain connectivity' } };
    const headers = { 'idempotency-key': 'create-1' };
    const first = await app.inject({ method: 'POST', url: '/api/v1/intents', headers, payload });
    const second = await app.inject({ method: 'POST', url: '/api/v1/intents', headers, payload });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().meta.idempotentReplay).toBe(true);
    expect(second.json().data.id).toBe('intent-1');
    await app.close();
  });

  it('rejects idempotency-key reuse with a different request', async () => {
    const app = await build();
    const headers = { 'idempotency-key': 'create-1' };
    await app.inject({
      method: 'POST',
      url: '/api/v1/intents',
      headers,
      payload: { id: 'intent-1', spec: { outcome: 'one' } },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intents',
      headers,
      payload: { id: 'intent-2', spec: { outcome: 'two' } },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().success).toBe(false);
    await app.close();
  });

  it('requires an idempotency key and rejects unknown fields', async () => {
    const app = await build();
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/intents',
      payload: { id: 'intent-1', spec: { outcome: 'one' } },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/intents',
      headers: { 'idempotency-key': 'create-2' },
      payload: { id: 'intent-2', spec: { outcome: 'two' }, unexpected: true },
    });
    expect(missing.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(400);
    await app.close();
  });

  it('reads, lists, and transitions intents through the lifecycle boundary', async () => {
    const app = await build();
    await app.inject({
      method: 'POST',
      url: '/api/v1/intents',
      headers: { 'idempotency-key': 'create-1' },
      payload: { id: 'intent-1', spec: { outcome: 'maintain connectivity' } },
    });
    const activate = await app.inject({
      method: 'POST',
      url: '/api/v1/intents/intent-1/commands',
      payload: { type: 'activate' },
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().data).toMatchObject({ id: 'intent-1', version: 2, status: 'active' });
    const list = await app.inject({ method: 'GET', url: '/api/v1/intents?status=active&limit=10' });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);
    const get = await app.inject({ method: 'GET', url: '/api/v1/intents/intent-1' });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.status).toBe('active');
    await app.close();
  });

  it('hands activated intents to the canonical runtime callback', async () => {
    const activated: string[] = [];
    const app = Fastify();
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof Error) return reply.code(500).send({ success: false });
      return reply.code(500).send({ success: false });
    });
    registerIntentRoutes(app, {
      requirePermission: async () => ({ id: 'test-principal', roles: ['admin'], scopes: ['*'] }),
      onActivated: (intent) => activated.push(`${intent.id}@${intent.version}`),
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/intents',
      headers: { 'idempotency-key': 'create-runtime-1' },
      payload: { id: 'intent-runtime', spec: { outcome: 'maintain access' } },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intents/intent-runtime/commands',
      payload: { type: 'activate' },
    });
    expect(response.statusCode).toBe(200);
    expect(activated).toEqual(['intent-runtime@2']);
    await app.close();
  });

  it('returns not found for an unknown intent', async () => {
    const app = await build();
    const response = await app.inject({ method: 'GET', url: '/api/v1/intents/missing' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns not found for an unknown conflict id', async () => {
    const app = await build();
    const response = await app.inject({ method: 'GET', url: '/api/v1/intents/conflicts/nope' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('database conflict journal', () => {
  const conflict = (timestamp = new Date().toISOString()): ArbitrationConflict => ({
    intentA: { intentId: 'a', desiredOutcome: 'primary', priority: 'high', version: 1 },
    intentB: { intentId: 'b', desiredOutcome: 'secondary', priority: 'high', version: 1 },
    reason: 'overlap',
    resolution: 'supersede-a' as const,
    timestamp,
  });
  const owner = { principalId: 'test-principal' };

  it('persists recorded conflicts to the database', async () => {
    const queries: unknown[][] = [];
    const client = {
      async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
        queries.push([strings.join('?'), values]);
        return [];
      },
      async $disconnect() {},
    };
    const store = new DatabaseIntentStore(client);
    await store.recordConflict(conflict(), owner);
    expect(queries.some(([sql]) => String(sql).includes('IntentConflictRecord'))).toBe(true);
  });

  it('serves the local mirror when the database is unavailable', async () => {
    const failing = {
      async $queryRaw(): Promise<unknown> {
        throw new Error('db-down');
      },
      async $disconnect() {},
    };
    const store = new DatabaseIntentStore(failing);
    await store.recordConflict(conflict(), owner);
    const listed = await store.listConflicts(owner, 10);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.reason).toBe('overlap');
  });

  it('drains buffered conflicts once the database recovers', async () => {
    let down = true;
    const queries: unknown[][] = [];
    const flapping = {
      async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
        if (down) throw new Error('db-down');
        queries.push([strings.join('?'), values]);
        return [];
      },
      async $disconnect() {},
    };
    const store = new DatabaseIntentStore(flapping);
    await store.recordConflict(conflict(), owner);
    expect(await store.listConflicts(owner, 10)).toHaveLength(1);
    down = false;
    await store.listConflicts(owner, 10);
    expect(queries.some(([sql]) => String(sql).includes('IntentConflictRecord'))).toBe(true);
  });
});
