import { createHash } from 'node:crypto';
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
import {
  createIntentRepository,
  IntentRepositoryConflictError,
  type DatabaseClient,
  type IntentRecordRow,
} from '@irp/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const primitive = z.union([z.string(), z.number().finite(), z.boolean()]);
const specSchema = z
  .object({
    outcome: z.string().trim().min(1).max(2000),
    constraints: z.record(z.string(), primitive).optional(),
    target: z.record(z.string(), z.string().max(512)).optional(),
  })
  .strict();

const createSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
    spec: specSchema,
    effectiveFrom: timestamp.optional(),
    expiresAt: timestamp.optional(),
    provenance: z.string().trim().min(1).max(512).optional(),
    confidence: z.number().min(0).max(1).optional(),
    autonomy: z
      .enum([
        'OBSERVE_ONLY',
        'ADVISORY',
        'SAFE_AUTOMATION',
        'AUTONOMOUS',
        'HIGH_RISK_REQUIRES_APPROVAL',
      ])
      .optional(),
    metadata: z.record(z.string(), z.string().max(512)).optional(),
  })
  .strict();

const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('activate'), at: timestamp.optional() }).strict(),
  z.object({ type: z.literal('complete'), at: timestamp.optional() }).strict(),
  z
    .object({
      type: z.literal('supersede'),
      at: timestamp.optional(),
      replacementId: z.string().trim().min(1).max(128),
    })
    .strict(),
  z.object({ type: z.literal('cancel'), at: timestamp.optional() }).strict(),
  z.object({ type: z.literal('expire'), at: timestamp.optional() }).strict(),
]);

const idParams = z.object({ id: z.string().trim().min(1).max(128) }).strict();
const listQuery = z
  .object({
    status: z
      .enum(['draft', 'active', 'completed', 'superseded', 'cancelled', 'expired'])
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

const conflictListQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    since: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export interface IntentOwnership {
  readonly principalId: string;
  readonly organizationId?: string;
}

export interface IntentApiStore {
  get(id: string, ownership: IntentOwnership): Promise<NetworkIntent | undefined>;
  list(
    status: NetworkIntent['status'] | undefined,
    ownership: IntentOwnership,
    limit: number,
  ): Promise<readonly NetworkIntent[]>;
  put(
    intent: NetworkIntent,
    ownership: IntentOwnership,
    options?: {
      idempotencyKey?: string;
      idempotencyFingerprint?: string;
      expectedVersion?: number;
    },
  ): Promise<void>;
  findByIdempotency(
    ownership: IntentOwnership,
    key: string,
  ): Promise<{ intent: NetworkIntent; fingerprint: string } | undefined>;
}

export interface ArbitrationConflict {
  readonly intentA: {
    intentId: string;
    desiredOutcome: string;
    priority: NetworkIntent['priority'];
    version: number;
  };
  readonly intentB: {
    intentId: string;
    desiredOutcome: string;
    priority: NetworkIntent['priority'];
    version: number;
  };
  readonly reason: string;
  readonly resolution: 'supersede-a' | 'supersede-b' | 'queue-b' | 'merge';
  readonly timestamp: string; // ISO timestamp when conflict was recorded
}

export interface ConflictApiStore {
  listConflicts(
    ownership: IntentOwnership,
    limit: number,
    since?: Date,
  ): Promise<readonly ArbitrationConflict[]>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const ownershipKey = (ownership: IntentOwnership): string =>
  ownership.organizationId
    ? `org:${ownership.organizationId}`
    : `principal:${ownership.principalId}`;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
};

const idempotencyFingerprint = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');

export class InMemoryIntentStore implements IntentApiStore, ConflictApiStore {
  private readonly intents = new Map<
    string,
    {
      intent: NetworkIntent;
      ownership: IntentOwnership;
      idempotencyKey?: string;
      idempotencyFingerprint?: string;
    }
  >();
  private readonly conflicts: ArbitrationConflict[] = [];

  recordConflict(_conflict: ArbitrationConflict): void {
    this.conflicts.push(_conflict);
  }

  async listConflicts(
    ownership: IntentOwnership,
    limit: number,
    since?: Date,
  ): Promise<readonly ArbitrationConflict[]> {
    let conflicts = this.conflicts;
    if (since) {
      conflicts = conflicts.filter((c) => new Date(c.timestamp) > since);
    }
    return Object.freeze(conflicts.slice(-limit));
  }

  async get(id: string, ownership: IntentOwnership): Promise<NetworkIntent | undefined> {
    const row = this.intents.get(id);
    if (!row || ownershipKey(row.ownership) !== ownershipKey(ownership)) return undefined;
    return clone(row.intent);
  }

  async list(
    status: NetworkIntent['status'] | undefined,
    ownership: IntentOwnership,
    limit: number,
  ): Promise<readonly NetworkIntent[]> {
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
    options: {
      idempotencyKey?: string;
      idempotencyFingerprint?: string;
      expectedVersion?: number;
    } = {},
  ): Promise<void> {
    const existing = this.intents.get(intent.id);
    if (existing && ownershipKey(existing.ownership) !== ownershipKey(ownership))
      throw new ConflictAppError(
        'Intent id is already owned by another principal or organization.',
      );
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
      ...(options.idempotencyFingerprint
        ? { idempotencyFingerprint: options.idempotencyFingerprint }
        : {}),
    });
  }

  async findByIdempotency(ownership: IntentOwnership, key: string) {
    for (const row of this.intents.values()) {
      if (ownershipKey(row.ownership) === ownershipKey(ownership) && row.idempotencyKey === key)
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
    ...(row.metadata ? { metadata: row.metadata as Readonly<Record<string, string>> } : {}),
    ...(row.provenance ? { provenance: row.provenance } : {}),
    ...(row.confidence !== null && row.confidence !== undefined
      ? { confidence: row.confidence }
      : {}),
    ...(row.autonomy ? { autonomy: row.autonomy as NonNullable<NetworkIntent['autonomy']> } : {}),
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
  ownerScopeKey: ownershipKey(ownership),
});

export class DatabaseIntentStore implements IntentApiStore, ConflictApiStore {
  private readonly repository: ReturnType<typeof createIntentRepository>;
  private readonly conflicts: ArbitrationConflict[] = [];

  constructor(client: Pick<DatabaseClient, '$queryRaw'>) {
    this.repository = createIntentRepository(client);
  }

  recordConflict(_conflict: ArbitrationConflict): void {
    // In a real implementation, this would persist to the database
    // For now, we'll log a warning
    console.warn('DatabaseIntentStore.recordConflict not implemented for database');
  }

  async listConflicts(
    _ownership: IntentOwnership,
    _limit: number,
    _since?: Date,
  ): Promise<readonly ArbitrationConflict[]> {
    // In a real implementation, this would query the database
    return Object.freeze([]);
  }

  async get(id: string, ownership: IntentOwnership) {
    const row = await this.repository.get(id, ownershipKey(ownership));
    return row ? fromRow(row) : undefined;
  }

  async list(
    status: NetworkIntent['status'] | undefined,
    ownership: IntentOwnership,
    limit: number,
  ) {
    const rows = await this.repository.list(status, ownershipKey(ownership), limit);
    return rows.map(fromRow);
  }

  async put(
    intent: NetworkIntent,
    ownership: IntentOwnership,
    options: {
      idempotencyKey?: string;
      idempotencyFingerprint?: string;
      expectedVersion?: number;
    } = {},
  ) {
    await this.repository.put(toRow(intent, ownership, options), options.expectedVersion);
  }

  async findByIdempotency(ownership: IntentOwnership, key: string) {
    const row = await this.repository.findByIdempotency(ownershipKey(ownership), key);
    if (!row) return undefined;
    return row.idempotencyFingerprint
      ? { intent: fromRow(row), fingerprint: row.idempotencyFingerprint }
      : undefined;
  }
}

export interface IntentApiOptions {
  store?: IntentApiStore & ConflictApiStore;
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
  if (value.length > 128)
    throw new ValidationAppError('Idempotency-Key must be at most 128 characters');
  return value.trim();
};

const ownership = (principal: Principal): IntentOwnership => ({
  principalId: principal.id,
  ...(principal.organizationId ? { organizationId: principal.organizationId } : {}),
});

export const registerIntentRoutes = (app: FastifyInstance, options: IntentApiOptions = {}) => {
  const store =
    options.store ??
    (options.database ? new DatabaseIntentStore(options.database) : new InMemoryIntentStore());
  const authorize = options.requirePermission ?? defaultAuthorization;

  app.post('/api/v1/intents', async (request, reply) => {
    const principal = await authorize(request, 'runtime.execute');
    const owner = ownership(principal);
    const key = idempotencyKey(request);
    const input = createSchema.parse(request.body ?? {});
    const fingerprint = idempotencyFingerprint(input);
    const previous = await store.findByIdempotency(owner, key);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        return reply.code(409).send({
          success: false,
          error: {
            code: 'IDEMPOTENCY_KEY_REUSE',
            message: 'Idempotency-Key was already used with a different request.',
          },
        });
      return reply
        .code(200)
        .send({ success: true, data: previous.intent, meta: { idempotentReplay: true } });
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
    try {
      await store.put(intent, owner, {
        idempotencyKey: key,
        idempotencyFingerprint: fingerprint,
      });
    } catch (error) {
      if (!(error instanceof IntentRepositoryConflictError)) throw error;
      const raced = await store.findByIdempotency(owner, key);
      if (raced) {
        if (raced.fingerprint !== fingerprint)
          return reply.code(409).send({
            success: false,
            error: {
              code: 'IDEMPOTENCY_KEY_REUSE',
              message: 'Idempotency-Key was already used with a different request.',
            },
          });
        return reply
          .code(200)
          .send({ success: true, data: raced.intent, meta: { idempotentReplay: true } });
      }
      throw new ConflictAppError('Intent id or idempotency key is already in use.');
    }
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
      await store.put(updated, owner, { expectedVersion: intent.version });
      if (updated.status === 'active') await options.onActivated?.(updated);
      return { success: true, data: updated };
    } catch (error) {
      if (error instanceof ConflictAppError) throw error;
      throw new ConflictAppError(
        error instanceof Error ? error.message : 'Invalid intent transition',
      );
    }
  });

  // Conflict arbitration endpoints
  app.get('/api/v1/intents/conflicts', async (request) => {
    const principal = await authorize(request, 'runtime.inspect');
    const query = conflictListQuery.parse(request.query ?? {});
    const owner = ownership(principal);
    const conflicts = await store.listConflicts(
      owner,
      query.limit,
      query.since ? new Date(query.since) : undefined,
    );
    return {
      success: true,
      data: conflicts,
      meta: { count: conflicts.length, limit: query.limit },
    };
  });

  app.get('/api/v1/intents/conflicts/:id', async (request) => {
    await authorize(request, 'runtime.inspect');
    idParams.parse(request.params ?? {});
    // In a real implementation, this would look up a specific conflict by ID
    // For now, return not found as conflicts don't have individual IDs in this impl
    throw new NotFoundAppError('conflict');
  });

  return { store };
};
