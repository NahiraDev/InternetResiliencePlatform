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
import type { Principal } from '@irp/auth';
import { createIntentRepository, type DatabaseClient, type IntentRecordRow } from '@irp/database';

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
  provenance: z.string().trim().min(1).max(512).optional(),
  confidence: z.number().min(0).max(1).optional(),
  autonomy: z.enum([
    'OBSERVE_ONLY',
    'ADVISORY',
    'SAFE_AUTOMATION',
    'AUTONOMOUS',
    'HIGH_RISK_REQUIRES_APPROVAL',
  ]).optional(),
  metadata: z.record(z.string(), z.string().max(512)).optional(),
}).strict();

const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('activate'), at: timestamp.optional() }).strict(),
  z.object({ type: z.literal('complete'), at: timestamp.optional() }).strict(),
  z.object({
    type: z.literal('supersede'),
    at: timestamp.optional(),
    replacementId: z.string().trim().min(1).max(128),
  }).strict(),
  z.object({ type: z.literal('cancel'), at: timestamp.optional() }).strict(),
  z.object({ type: z.literal('expire'), at: timestamp.optional() }).strict(),
]);

const idParams = z.object({ id: z.string().trim().min(1).max(128) }).strict();
const listQuery = z.object({
  status: z.enum(['draft', 'active', 'completed', 'superseded', 'cancelled', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export interface IntentOwnership {
  readonly principalId: string;
  readonly organizationId?: string;
}

export interface IntentApiStore {
  get(id: string, ownership: IntentOwnership): Promise<NetworkIntent | undefined>;
  list(status: NetworkIntent['status'] | undefined, ownership: IntentOwnership, limit: number): Promise<readonly NetworkIntent[]>;
  put(
    intent: NetworkIntent,
    ownership: IntentOwnership,
    options?: { idempotencyKey?: string; idempotencyFingerprint?: string; expectedVersion?: number },
  ): Promise<void>;
  findByIdempotency(
    ownership: IntentOwnership,
    key: string,
  ): Promise<{ intent: NetworkIntent; fingerprint: string } | undefined>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const ownershipKey = (ownership: IntentOwnership): string =>
  ownership.organizationId ? `org:${ownership.organizationId}` : `principal:${ownership.principalId}`;

export class InMemoryIntentStore implements IntentApiStore {
  private readonly intents = new Map<string, { intent: NetworkIntent; ownership: IntentOwnership; idempotencyKey?: string; idempotencyFingerprint?: string }>();

  async get(id: string, ownership: IntentOwnership): Promise<NetworkIntent | undefined> {
    const row = this.intents.get(id);
    if (!row || ownershipKey(row.ownership) !== ownershipKey(ownership)) return undefined;
    return clone(row.intent);
  }

  async list(status: NetworkIntent['status'] | undefined, ownership: IntentOwnership, limit: number): Promise<readonly NetworkIntent[]> {
    return [...this.intents.values()]
      .filter((row) => ownershipKey(row.ownership) === ownershipKey(ownership))
      .filter((row) => status === undefined || row.intent.status === status)
      .sort((a, b) => b.intent.updatedAt.localeCompare(a.intent.updatedAt))
      .slice(0, limit)
      .map((row) => clone(row.intent));
  }

  async put(
    intent: NetworkIntent,
    ownership: IntentOwnership,
    options: { idempotencyKey?: string; idempotencyFingerprint?: string; expectedVersion?: number } = {},
  ): Promise<void> {
    const existing = this.intents.get(intent.id);
    if (existing && ownershipKey(existing.ownership) !== ownershipKey(ownership))
      throw new ConflictAppError('Intent id is already owned by another principal or organization.');
    if (options.expectedVersion !== undefined) {
      if (!existing || existing.intent.version !== options.expectedVersion)
        throw new ConflictAppError('Intent version conflict; refresh the intent before retrying.');
    } else if (existing) {
      throw new ConflictAppError('Intent already exists.');
    }
    this.intents.set(intent.id, {
      intent: clone(intent),
      ownership: { ...ownership },
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      ...(options.idempotencyFingerprint ? { idempotencyFingerprint: options.idempotencyFingerprint } : {}),
    });
  }

  async findByIdempotency(ownership: IntentOwnership, key: string) {
    for (const row of this.intents.values()) {
      if (
        ownershipKey(row.ownership) === ownershipKey(ownership) &&
        row.idempotencyKey === key
      )
        return row.idempotencyFingerprint
          ? { intent: clone(row.intent), fingerprint: row.idempotencyFingerprint }
          : undefined;
    }
    return undefined;
  }
}

const fromRow = (row: IntentRecordRow): NetworkIntent =>
  Object.freeze({
    id: row.id,
    version: row.version,
    status: row.status as NetworkIntent['status'],
    priority: row.priority as NetworkIntent['priority'],
    spec: row.spec as NetworkIntent['spec'],
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    ...(row.effectiveFrom ? { effectiveFrom: new Date(row.effectiveFrom).toISOString() } : {}),
    ...(row.expiresAt ? { expiresAt: new Date(row.expiresAt).toISOString() } : {}),
    ...(row.supersedes ? { supersedes: row.supersedes } : {}),
    ...(row.metadata ? { metadata: row.metadata as NetworkIntent['metadata'] } : {}),
    ...(row.provenance ? { provenance: row.provenance } : {}),
    ...(row.confidence !== null && row.confidence !== undefined ? { confidence: row.confidence } : {}),
    ...(row.autonomy ? { autonomy: row.autonomy as NetworkIntent['autonomy'] } : {}),
  });

const toRow = (
  intent: NetworkIntent,
  ownership: IntentOwnership,
  options: { idempotencyKey?: string; idempotencyFingerprint?: string },
): IntentRecordRow => ({
  id: intent.id,
  version: intent.version,
  status: intent.status,
  priority: intent.priority,
  spec: intent.spec,
  createdAt: intent.createdAt,
  updatedAt: intent.updatedAt,
  effectiveFrom: intent.effectiveFrom ?? null,
  expiresAt: intent.expiresAt ?? null,
  supersedes: intent.supersedes ?? null,
  metadata: intent.metadata ?? {},
  provenance: intent.provenance ?? null,
  confidence: intent.confidence ?? null,
  autonomy: intent.autonomy ?? null,
  ownerPrincipalId: ownership.principalId,
  organizationId: ownership.organizationId ?? null,
  idempotencyKey: options.idempotencyKey ?? null,
  idempotencyFingerprint: options.idempotencyFingerprint ?? null,
});

export class DatabaseIntentStore implements IntentApiStore {
  private readonly repository: ReturnType<typeof createIntentRepository>;
  constructor(client: Pick<DatabaseClient, '$queryRaw'>) {
    this.repository = createIntentRepository(client);
  }

  async get(id: string, ownership: IntentOwnership) {
    const row = await this.repository.get(id, ownership.principalId, ownership.organizationId);
    return row ? fromRow(row) : undefined;
  }

  async list(status: NetworkIntent['status'] | undefined, ownership: IntentOwnership, limit: number) {
    const rows = await this.repository.list(status, ownership.principalId, ownership.organizationId, limit);
    return rows.map(fromRow);
  }

  async put(
    intent: NetworkIntent,
    ownership: IntentOwnership,
    options: { idempotencyKey?: string; idempotencyFingerprint?: string; expectedVersion?: number } = {},
  ) {
    await this.repository.put(toRow(intent, ownership, options), options.expectedVersion);
  }

  async findByIdempotency(ownership: IntentOwnership, key: string) {
    const row = await this.repository.findByIdempotency(ownership.principalId, key);
    if (!row) return undefined;
    return row.idempotencyFingerprint
      ? { intent: fromRow(row), fingerprint: row.idempotencyFingerprint }
      : undefined;
  }
}

export interface IntentApiOptions {
  store?: IntentApiStore;
  database?: Pick<DatabaseClient, '$queryRaw'>;
  onActivated?: (intent: NetworkIntent) => Promise<unknown> | unknown;
  requirePermission?: (
    request: FastifyRequest,
    permission: 'runtime.inspect' | 'runtime.execute',
  ) => Promise<Principal>;
}

const defaultAuthorization = async (
  request: FastifyRequest,
  permission: 'runtime.inspect' | 'runtime.execute',
): Promise<Principal> => {
  const principal = await request.jwtAuth.authenticate({ headers: request.headers });
  if (!principal) throw new UnauthorizedAppError();
  const allowed = await request.rbac.authorize({
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

const ownership = (principal: Principal): IntentOwnership => ({
  principalId: principal.id,
  ...(principal.organizationId ? { organizationId: principal.organizationId } : {}),
});

export const registerIntentRoutes = (app: FastifyInstance, options: IntentApiOptions = {}) => {
  const store = options.store ?? (options.database ? new DatabaseIntentStore(options.database) : new InMemoryIntentStore());
  const authorize = options.requirePermission ?? defaultAuthorization;

  app.post('/api/v1/intents', async (request, reply) => {
    const principal = await authorize(request, 'runtime.execute');
    const owner = ownership(principal);
    const key = idempotencyKey(request);
    const input = createSchema.parse(request.body ?? {});
    const fingerprint = JSON.stringify(input);
    const previous = await store.findByIdempotency(owner, key);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        return reply.code(409).send({
          success: false,
          error: { code: 'IDEMPOTENCY_KEY_REUSE', message: 'Idempotency-Key was already used with a different request.' },
        });
      return reply.code(200).send({ success: true, data: previous.intent, meta: { idempotentReplay: true } });
    }

    const spec = {
      outcome: input.spec.outcome,
      ...(input.spec.constraints !== undefined ? { constraints: input.spec.constraints } : {}),
      ...(input.spec.target !== undefined ? { target: input.spec.target } : {}),
    };
    const intentInput = {
      id: input.id,
      priority: input.priority,
      spec,
      ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.autonomy !== undefined ? { autonomy: input.autonomy } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    } satisfies Parameters<typeof createNetworkIntent>[0];

    const intent = createNetworkIntent(intentInput);
    await store.put(intent, owner, { idempotencyKey: key, idempotencyFingerprint: fingerprint });
    return reply.code(201).send({ success: true, data: intent });
  });

  app.get('/api/v1/intents', async (request) => {
    const principal = await authorize(request, 'runtime.inspect');
    const query = listQuery.parse(request.query ?? {});
    const intents = await store.list(query.status, ownership(principal), query.limit);
    return { success: true, data: intents, meta: { count: intents.length, limit: query.limit } };
  });

  app.get('/api/v1/intents/:id', async (request) => {
    const principal = await authorize(request, 'runtime.inspect');
    const { id } = idParams.parse(request.params ?? {});
    const intent = await store.get(id, ownership(principal));
    if (!intent) throw new NotFoundAppError('intent');
    return { success: true, data: intent };
  });

  app.post('/api/v1/intents/:id/commands', async (request) => {
    const principal = await authorize(request, 'runtime.execute');
    const owner = ownership(principal);
    const { id } = idParams.parse(request.params ?? {});
    const intent = await store.get(id, owner);
    if (!intent) throw new NotFoundAppError('intent');
    const command = commandSchema.parse(request.body ?? {}) as IntentCommand;
    try {
      const updated = transitionIntent(intent, command);
      if (updated.status === 'active') await options.onActivated?.(updated);
      await store.put(updated, owner, { expectedVersion: intent.version });
      return { success: true, data: updated };
    } catch (error) {
      if (error instanceof ConflictAppError) throw error;
      throw new ConflictAppError(error instanceof Error ? error.message : 'Invalid intent transition');
    }
  });

  return { store };
};
