import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  UnauthorizedAppError,
  ValidationAppError,
  createNetworkIntent,
  transitionIntent,
  type IntentCommand,
  type NetworkIntent,
} from '@irp/core';

const timestamp = z.string().datetime({ offset: true });
const primitive = z.union([z.string(), z.number().finite(), z.boolean()]);
const specSchema = z.object({
  outcome: z.string().trim().min(1).max(2000),
  constraints: z.record(z.string(), primitive).optional(),
  target: z.record(z.string(), z.string().max(512)).optional(),
}).strict();

const createSchema = z.object({
  id: z.string().trim().min(1).max(128),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  spec: specSchema,
  effectiveFrom: timestamp.optional(),
  expiresAt: timestamp.optional(),
  metadata: z.record(z.string(), z.string().max(512)).optional(),
}).strict();

const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('activate'), at: timestamp.optional() }).strict(),
  z.object({ type: z.literal('complete'), at: timestamp.optional() }).strict(),
  z.object({ type: z.literal('supersede'), at: timestamp.optional(), replacementId: z.string().trim().min(1).max(128) }).strict(),
  z.object({ type: z.literal('cancel'), at: timestamp.optional() }).strict(),
  z.object({ type: z.literal('expire'), at: timestamp.optional() }).strict(),
]);

const idParams = z.object({ id: z.string().trim().min(1).max(128) }).strict();
const listQuery = z.object({
  status: z.enum(['draft', 'active', 'completed', 'superseded', 'cancelled', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export interface IntentApiStore {
  get(id: string): NetworkIntent | undefined;
  list(status?: NetworkIntent['status']): readonly NetworkIntent[];
  put(intent: NetworkIntent): void;
}

export class InMemoryIntentStore implements IntentApiStore {
  private readonly intents = new Map<string, NetworkIntent>();
  get(id: string): NetworkIntent | undefined { return this.intents.get(id); }
  list(status?: NetworkIntent['status']): readonly NetworkIntent[] {
    return [...this.intents.values()].filter((intent) => status === undefined || intent.status === status);
  }
  put(intent: NetworkIntent): void { this.intents.set(intent.id, intent); }
}

export interface IntentApiOptions {
  store?: IntentApiStore;
  requirePermission?: (request: FastifyRequest, permission: 'runtime.inspect' | 'runtime.execute') => Promise<unknown>;
}

declare module 'fastify' {
  interface FastifyRequest {
    jwtAuth?: { authenticate: (input: { headers: FastifyRequest['headers'] }) => Promise<unknown> };
    rbac?: { authorize: (input: unknown) => Promise<boolean> };
  }
}

const defaultAuthorization = async (request: FastifyRequest, permission: 'runtime.inspect' | 'runtime.execute') => {
  const auth = request.jwtAuth;
  const rbac = request.rbac;
  if (!auth || !rbac) throw new UnauthorizedAppError();
  const principal = await auth.authenticate({ headers: request.headers });
  if (!principal) throw new UnauthorizedAppError();
  const allowed = await rbac.authorize({
    principal,
    resource: request.url,
    action: request.method,
    requiredPermissions: [permission],
  });
  if (!allowed) throw new ForbiddenAppError();
  return principal;
};

const idempotencyKey = (request: FastifyRequest): string => {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.trim()) throw new ValidationAppError('Idempotency-Key header is required');
  if (value.length > 128) throw new ValidationAppError('Idempotency-Key must be at most 128 characters');
  return value.trim();
};

export const registerIntentRoutes = (app: FastifyInstance, options: IntentApiOptions = {}) => {
  const store = options.store ?? new InMemoryIntentStore();
  const authorize = options.requirePermission ?? defaultAuthorization;
  const requests = new Map<string, { fingerprint: string; intent: NetworkIntent }>();

  app.post('/api/v1/intents', async (request, reply) => {
    await authorize(request, 'runtime.execute');
    const key = idempotencyKey(request);
    const input = createSchema.parse(request.body ?? {});
    const fingerprint = JSON.stringify(input);
    const previous = requests.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return reply.code(409).send({ success: false, error: { code: 'IDEMPOTENCY_KEY_REUSE', message: 'Idempotency-Key was already used with a different request.' } });
      }
      return reply.code(200).send({ success: true, data: previous.intent, meta: { idempotentReplay: true } });
    }
    const intent = createNetworkIntent(input);
    store.put(intent);
    requests.set(key, { fingerprint, intent });
    return reply.code(201).send({ success: true, data: intent });
  });

  app.get('/api/v1/intents', async (request) => {
    await authorize(request, 'runtime.inspect');
    const query = listQuery.parse(request.query ?? {});
    const intents = store.list(query.status).slice(0, query.limit);
    return { success: true, data: intents, meta: { count: intents.length, limit: query.limit } };
  });

  app.get('/api/v1/intents/:id', async (request) => {
    await authorize(request, 'runtime.inspect');
    const { id } = idParams.parse(request.params ?? {});
    const intent = store.get(id);
    if (!intent) throw new NotFoundAppError('intent');
    return { success: true, data: intent };
  });

  app.post('/api/v1/intents/:id/commands', async (request) => {
    await authorize(request, 'runtime.execute');
    const { id } = idParams.parse(request.params ?? {});
    const intent = store.get(id);
    if (!intent) throw new NotFoundAppError('intent');
    const command = commandSchema.parse(request.body ?? {}) as IntentCommand;
    try {
      const updated = transitionIntent(intent, command);
      store.put(updated);
      return { success: true, data: updated };
    } catch (error) {
      throw new ConflictAppError(error instanceof Error ? error.message : 'Invalid intent transition');
    }
  });

  return { store };
};
