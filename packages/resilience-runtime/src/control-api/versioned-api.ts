/**
 * Phase 135 — Versioned Control-Plane API.
 *
 * A transport-independent request dispatcher: versioned routes, closed-schema
 * input validation, capability-based authorization against a verified actor,
 * idempotency keys, and a uniform response envelope. Handlers receive an
 * authorized context and return data; mutating handlers must go through the
 * privileged mutation boundary themselves — the API itself holds no authority.
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';
export interface FieldSpec { readonly type: FieldType; readonly required?: boolean; readonly maxLength?: number; readonly min?: number; readonly max?: number; readonly pattern?: RegExp; readonly oneOf?: readonly (string | number)[] }
export type ObjectSchema = Readonly<Record<string, FieldSpec>>;

export interface ApiActor { readonly id: string; readonly capabilities: readonly string[]; readonly tenant?: string }
export interface ApiRequest { readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE'; readonly path: string; readonly version: string; readonly actor?: ApiActor; readonly body?: unknown; readonly query?: Readonly<Record<string, string>>; readonly idempotencyKey?: string; readonly requestId: string }
export interface ApiContext<TInput> { readonly actor: ApiActor; readonly input: TInput; readonly requestId: string; readonly params: Readonly<Record<string, string>> }

export interface ApiRoute<TInput = Record<string, unknown>, TOutput = unknown> {
  readonly method: ApiRequest['method'];
  readonly path: string; // supports :param segments
  readonly since: string;
  readonly until?: string; // first version in which the route no longer exists
  readonly capability: string;
  readonly schema: ObjectSchema;
  readonly mutating?: boolean;
  handler(ctx: ApiContext<TInput>): Promise<TOutput> | TOutput;
}

export type ApiErrorCode = 'unauthenticated' | 'forbidden' | 'not-found' | 'invalid-request' | 'unsupported-version' | 'idempotency-conflict' | 'internal';
export interface ApiResponse<T = unknown> { readonly status: number; readonly requestId: string; readonly version: string; readonly data?: T; readonly error?: { readonly code: ApiErrorCode; readonly message: string; readonly details?: readonly string[] }; readonly replayed?: boolean }

const STATUS: Readonly<Record<ApiErrorCode, number>> = { unauthenticated: 401, forbidden: 403, 'not-found': 404, 'invalid-request': 400, 'unsupported-version': 400, 'idempotency-conflict': 409, internal: 500 };

export const validateAgainstSchema = (value: unknown, schema: ObjectSchema): { readonly ok: boolean; readonly errors: readonly string[]; readonly value: Record<string, unknown> } => {
  const errors: string[] = [];
  if (value === undefined || value === null) value = {};
  if (typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['body must be an object'], value: {} };
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!(key in schema)) errors.push(`unknown field ${key}`);
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(schema)) {
    const v = input[key];
    if (v === undefined) { if (spec.required) errors.push(`${key} is required`); continue; }
    const actual = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    if (actual !== spec.type) { errors.push(`${key} must be ${spec.type}`); continue; }
    if (spec.type === 'string') {
      const s = v as string;
      if (spec.maxLength !== undefined && s.length > spec.maxLength) errors.push(`${key} exceeds ${spec.maxLength} characters`);
      if (spec.pattern && !spec.pattern.test(s)) errors.push(`${key} has invalid format`);
    }
    if (spec.type === 'number') {
      const n = v as number;
      if (!Number.isFinite(n)) errors.push(`${key} must be finite`);
      if (spec.min !== undefined && n < spec.min) errors.push(`${key} below minimum ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) errors.push(`${key} above maximum ${spec.max}`);
    }
    if (spec.oneOf && !spec.oneOf.includes(v as string | number)) errors.push(`${key} must be one of ${spec.oneOf.join(', ')}`);
    out[key] = v;
  }
  return { ok: errors.length === 0, errors, value: out };
};

const matchPath = (pattern: string, path: string): Record<string, string> | undefined => {
  const a = pattern.split('/').filter(Boolean); const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i] as string; const s = b[i] as string;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(s); else if (p !== s) return undefined;
  }
  return params;
};

const verParts = (v: string): number[] => v.split('.').map(Number);
const verCmp = (a: string, b: string): number => { const x = verParts(a); const y = verParts(b); for (let i = 0; i < 3; i += 1) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; } return 0; };

export interface ControlApiOptions { readonly supportedVersions: readonly string[]; readonly idempotencyTtlMs?: number; readonly idempotencyCapacity?: number; readonly nowMs?: () => number }

export class ControlApi {
  private readonly routes: ApiRoute<any, any>[] = [];
  private readonly idem = new Map<string, { readonly fingerprint: string; readonly response: ApiResponse; readonly at: number }>();
  private readonly now: () => number;
  constructor(private readonly options: ControlApiOptions) { this.now = options.nowMs ?? (() => Date.now()); }

  register<TIn, TOut>(route: ApiRoute<TIn, TOut>): void {
    parseVersionOrThrow(route.since);
    if (route.until) { parseVersionOrThrow(route.until); if (verCmp(route.until, route.since) <= 0) throw new Error('route until must be after since'); }
    if (this.routes.some((r) => r.method === route.method && r.path === route.path && verCmp(r.since, route.since) === 0)) throw new Error(`duplicate route ${route.method} ${route.path}@${route.since}`);
    this.routes.push(route as ApiRoute<any, any>);
  }

  describe(): readonly { method: string; path: string; since: string; until?: string; capability: string; mutating: boolean }[] {
    return this.routes.map((r) => ({ method: r.method, path: r.path, since: r.since, ...(r.until ? { until: r.until } : {}), capability: r.capability, mutating: r.mutating === true })).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  }

  private fail(req: ApiRequest, code: ApiErrorCode, message: string, details?: readonly string[]): ApiResponse {
    return Object.freeze({ status: STATUS[code], requestId: req.requestId, version: req.version, error: Object.freeze({ code, message, ...(details ? { details } : {}) }) });
  }

  async dispatch(req: ApiRequest): Promise<ApiResponse> {
    if (!this.options.supportedVersions.includes(req.version)) return this.fail(req, 'unsupported-version', `version ${req.version} is not supported`);
    if (!req.actor) return this.fail(req, 'unauthenticated', 'authentication required');
    const candidates = this.routes.filter((r) => r.method === req.method && matchPath(r.path, req.path) && verCmp(r.since, req.version) <= 0 && (!r.until || verCmp(req.version, r.until) < 0));
    const route = candidates.sort((a, b) => verCmp(b.since, a.since))[0];
    if (!route) return this.fail(req, 'not-found', 'no such route in this version');
    if (!req.actor.capabilities.includes(route.capability) && !req.actor.capabilities.includes('*')) return this.fail(req, 'forbidden', `capability ${route.capability} required`);
    const source = req.method === 'GET' ? req.query ?? {} : req.body;
    const checked = validateAgainstSchema(source, route.schema);
    if (!checked.ok) return this.fail(req, 'invalid-request', 'request validation failed', checked.errors);
    const params = matchPath(route.path, req.path) as Record<string, string>;
    const fingerprint = JSON.stringify([req.method, req.path, req.version, checked.value]);
    const idemKey = route.mutating && req.idempotencyKey ? `${req.actor.id}|${req.idempotencyKey}` : undefined;
    if (idemKey) {
      this.evict();
      const hit = this.idem.get(idemKey);
      if (hit) return hit.fingerprint === fingerprint ? Object.freeze({ ...hit.response, requestId: req.requestId, replayed: true }) : this.fail(req, 'idempotency-conflict', 'idempotency key reused with a different request');
    }
    let response: ApiResponse;
    try {
      const data = await route.handler({ actor: req.actor, input: checked.value, requestId: req.requestId, params });
      response = Object.freeze({ status: 200, requestId: req.requestId, version: req.version, data });
    } catch (error) {
      // Internal details are never leaked to callers.
      response = this.fail(req, 'internal', 'internal error');
      void error;
    }
    if (idemKey && response.status === 200) this.idem.set(idemKey, { fingerprint, response, at: this.now() });
    return response;
  }

  private evict(): void {
    const ttl = this.options.idempotencyTtlMs ?? 24 * 3_600_000; const cap = this.options.idempotencyCapacity ?? 10_000; const t = this.now();
    for (const [k, v] of this.idem) if (t - v.at > ttl) this.idem.delete(k);
    while (this.idem.size >= cap) { const first = this.idem.keys().next().value as string; this.idem.delete(first); }
  }
}

function parseVersionOrThrow(v: string): void { if (!/^\d+\.\d+(\.\d+)?$/.test(v)) throw new Error(`invalid API version ${v}`); }
