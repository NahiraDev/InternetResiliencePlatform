/**
 * Phase 135 — Versioned Control-Plane API.
 *
 * A transport-independent request dispatcher: versioned routes, closed-schema
 * input validation, capability-based authorization against a verified actor,
 * idempotency keys, and a uniform response envelope. Handlers receive an
 * authorized context and return data; mutating handlers must go through the
 * privileged mutation boundary themselves — the API itself holds no authority.
 */
const STATUS = { unauthenticated: 401, forbidden: 403, 'not-found': 404, 'invalid-request': 400, 'unsupported-version': 400, 'idempotency-conflict': 409, internal: 500 };
export const validateAgainstSchema = (value, schema) => {
    const errors = [];
    if (value === undefined || value === null)
        value = {};
    if (typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errors: ['body must be an object'], value: {} };
    const input = value;
    for (const key of Object.keys(input))
        if (!(key in schema))
            errors.push(`unknown field ${key}`);
    const out = {};
    for (const [key, spec] of Object.entries(schema)) {
        const v = input[key];
        if (v === undefined) {
            if (spec.required)
                errors.push(`${key} is required`);
            continue;
        }
        const actual = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
        if (actual !== spec.type) {
            errors.push(`${key} must be ${spec.type}`);
            continue;
        }
        if (spec.type === 'string') {
            const s = v;
            if (spec.maxLength !== undefined && s.length > spec.maxLength)
                errors.push(`${key} exceeds ${spec.maxLength} characters`);
            if (spec.pattern && !spec.pattern.test(s))
                errors.push(`${key} has invalid format`);
        }
        if (spec.type === 'number') {
            const n = v;
            if (!Number.isFinite(n))
                errors.push(`${key} must be finite`);
            if (spec.min !== undefined && n < spec.min)
                errors.push(`${key} below minimum ${spec.min}`);
            if (spec.max !== undefined && n > spec.max)
                errors.push(`${key} above maximum ${spec.max}`);
        }
        if (spec.oneOf && !spec.oneOf.includes(v))
            errors.push(`${key} must be one of ${spec.oneOf.join(', ')}`);
        out[key] = v;
    }
    return { ok: errors.length === 0, errors, value: out };
};
const matchPath = (pattern, path) => {
    const a = pattern.split('/').filter(Boolean);
    const b = path.split('/').filter(Boolean);
    if (a.length !== b.length)
        return undefined;
    const params = {};
    for (let i = 0; i < a.length; i += 1) {
        const p = a[i];
        const s = b[i];
        if (p.startsWith(':'))
            params[p.slice(1)] = decodeURIComponent(s);
        else if (p !== s)
            return undefined;
    }
    return params;
};
const verParts = (v) => v.split('.').map(Number);
const verCmp = (a, b) => { const x = verParts(a); const y = verParts(b); for (let i = 0; i < 3; i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d)
        return d;
} return 0; };
export class ControlApi {
    options;
    routes = [];
    idem = new Map();
    now;
    constructor(options) {
        this.options = options;
        this.now = options.nowMs ?? (() => Date.now());
    }
    register(route) {
        parseVersionOrThrow(route.since);
        if (route.until) {
            parseVersionOrThrow(route.until);
            if (verCmp(route.until, route.since) <= 0)
                throw new Error('route until must be after since');
        }
        if (this.routes.some((r) => r.method === route.method && r.path === route.path && verCmp(r.since, route.since) === 0))
            throw new Error(`duplicate route ${route.method} ${route.path}@${route.since}`);
        this.routes.push(route);
    }
    describe() {
        return this.routes.map((r) => ({ method: r.method, path: r.path, since: r.since, ...(r.until ? { until: r.until } : {}), capability: r.capability, mutating: r.mutating === true })).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    }
    fail(req, code, message, details) {
        return Object.freeze({ status: STATUS[code], requestId: req.requestId, version: req.version, error: Object.freeze({ code, message, ...(details ? { details } : {}) }) });
    }
    async dispatch(req) {
        if (!this.options.supportedVersions.includes(req.version))
            return this.fail(req, 'unsupported-version', `version ${req.version} is not supported`);
        if (!req.actor)
            return this.fail(req, 'unauthenticated', 'authentication required');
        const candidates = this.routes.filter((r) => r.method === req.method && matchPath(r.path, req.path) && verCmp(r.since, req.version) <= 0 && (!r.until || verCmp(req.version, r.until) < 0));
        const route = candidates.sort((a, b) => verCmp(b.since, a.since))[0];
        if (!route)
            return this.fail(req, 'not-found', 'no such route in this version');
        if (!req.actor.capabilities.includes(route.capability) && !req.actor.capabilities.includes('*'))
            return this.fail(req, 'forbidden', `capability ${route.capability} required`);
        const source = req.method === 'GET' ? req.query ?? {} : req.body;
        const checked = validateAgainstSchema(source, route.schema);
        if (!checked.ok)
            return this.fail(req, 'invalid-request', 'request validation failed', checked.errors);
        const params = matchPath(route.path, req.path);
        const fingerprint = JSON.stringify([req.method, req.path, req.version, checked.value]);
        const idemKey = route.mutating && req.idempotencyKey ? `${req.actor.id}|${req.idempotencyKey}` : undefined;
        if (idemKey) {
            this.evict();
            const hit = this.idem.get(idemKey);
            if (hit)
                return hit.fingerprint === fingerprint ? Object.freeze({ ...hit.response, requestId: req.requestId, replayed: true }) : this.fail(req, 'idempotency-conflict', 'idempotency key reused with a different request');
        }
        let response;
        try {
            const data = await route.handler({ actor: req.actor, input: checked.value, requestId: req.requestId, params });
            response = Object.freeze({ status: 200, requestId: req.requestId, version: req.version, data });
        }
        catch (error) {
            // Internal details are never leaked to callers.
            response = this.fail(req, 'internal', 'internal error');
            void error;
        }
        if (idemKey && response.status === 200)
            this.idem.set(idemKey, { fingerprint, response, at: this.now() });
        return response;
    }
    evict() {
        const ttl = this.options.idempotencyTtlMs ?? 24 * 3_600_000;
        const cap = this.options.idempotencyCapacity ?? 10_000;
        const t = this.now();
        for (const [k, v] of this.idem)
            if (t - v.at > ttl)
                this.idem.delete(k);
        while (this.idem.size >= cap) {
            const first = this.idem.keys().next().value;
            this.idem.delete(first);
        }
    }
}
function parseVersionOrThrow(v) { if (!/^\d+\.\d+(\.\d+)?$/.test(v))
    throw new Error(`invalid API version ${v}`); }
//# sourceMappingURL=versioned-api.js.map