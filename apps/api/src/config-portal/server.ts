/**
 * Local-only configuration portal. A standalone Fastify instance that is never registered on the
 * public API: it binds 127.0.0.1, has request logging and telemetry off, and has no route that
 * returns a saved value.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { verifyPassword } from '@irp/auth';
import {
  CONFIG_FIELDS,
  SecureConfigError,
  findField,
  findProblems,
  type SecureConfigStore,
  type SecureDocument,
} from '@irp/config/secure';
import { InMemoryRateLimiter } from '../security/rate-limit.js';
import { portalCss, portalHtml, portalScript } from './ui.js';

export const PORTAL_HOST = '127.0.0.1';
const COOKIE = 'irp_portal_session';
const IDLE_MS = 10 * 60_000;
const ABSOLUTE_MS = 60 * 60_000;
const MAX_LOGIN_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;

export interface PortalOptions {
  store: Pick<SecureConfigStore, 'read' | 'update' | 'storageDescription'>;
  port: number;
  now?: () => number;
}

interface Session {
  csrf: string;
  createdAt: number;
  seenAt: number;
}

const token = () => randomBytes(32).toString('base64url');
const equal = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const fail = (reply: FastifyReply, status: number, message: string) =>
  reply.code(status).send({ success: false, message });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sessionCookie = (request: FastifyRequest): string | undefined =>
  request.headers.cookie
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === COOKIE)?.[1];

const describeFields = (document: SecureDocument) => {
  const problems = findProblems(document.values);
  const fields = CONFIG_FIELDS.map(({ check: _check, ...meta }) => {
    const saved = document.values[meta.name] !== undefined;
    const problem = problems[meta.name];
    return {
      ...meta,
      status: !saved ? 'missing' : problem ? 'invalid' : 'configured',
      ...(problem ? { problem } : {}),
    };
  });
  const blocking = fields
    .filter((f) => f.status === 'invalid' || (f.required && f.status === 'missing'))
    .map((f) => f.name);
  return { fields, complete: blocking.length === 0, blocking };
};

export const buildPortalServer = (options: PortalOptions): FastifyInstance => {
  const { store, port } = options;
  const now = options.now ?? Date.now;
  const allowedHost = `${PORTAL_HOST}:${port}`;
  const allowedOrigin = `http://${allowedHost}`;
  const sessions = new Map<string, Session>();
  const requests = new InMemoryRateLimiter({ max: 120, windowMs: 60_000 });
  let failures = 0;
  let lockedUntil = 0;

  const app = Fastify({ logger: false, trustProxy: false, bodyLimit: 64 * 1024 });

  app.addHook('onRequest', async (request, reply) => {
    reply.headers({
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; " +
        "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    });
    const peer = request.socket.remoteAddress;
    if (peer !== PORTAL_HOST && peer !== `::ffff:${PORTAL_HOST}`)
      return fail(reply, 403, 'Local connections only.');
    // Exact Host match defeats DNS rebinding.
    if (request.headers.host !== allowedHost) return fail(reply, 403, 'Unexpected Host header.');
    const origin = request.headers.origin;
    const safe = request.method === 'GET' || request.method === 'HEAD';
    if (origin !== undefined ? origin !== allowedOrigin : !safe)
      return fail(reply, 403, 'Unexpected Origin.');
    const site = request.headers['sec-fetch-site'];
    if (
      request.routeOptions.url?.startsWith('/api/') &&
      site !== undefined &&
      site !== 'same-origin'
    )
      return fail(reply, 403, 'Cross-site request refused.');
    // Only exact-Origin writes are counted, so another website cannot exhaust the budget.
    if (!safe && !requests.check('local').allowed) return fail(reply, 429, 'Too many requests.');
    if (!safe && request.headers['content-type']?.split(';')[0] !== 'application/json')
      return fail(reply, 415, 'JSON requests only.');
  });

  // Parser and runtime errors can quote the request body, so they are never echoed or logged.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof SecureConfigError) return fail(reply, 503, error.message);
    const status = (error as { statusCode?: number }).statusCode;
    return status && status >= 400 && status < 500
      ? fail(reply, status, 'The request was rejected.')
      : fail(reply, 500, 'The request failed.');
  });
  app.setNotFoundHandler((_request, reply) => fail(reply, 404, 'Not found.'));

  app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(portalHtml));
  app.get('/portal.css', async (_request, reply) =>
    reply.type('text/css; charset=utf-8').send(portalCss),
  );
  app.get('/portal.js', async (_request, reply) =>
    reply.type('text/javascript; charset=utf-8').send(portalScript),
  );

  app.post('/api/login', async (request, reply) => {
    const body = request.body;
    const password = isRecord(body) && typeof body.password === 'string' ? body.password : '';
    if (now() < lockedUntil) return fail(reply, 429, 'Too many failed sign-ins. Try again later.');
    if (lockedUntil) {
      lockedUntil = 0;
      failures = 0;
    }
    // Count the attempt before any await so parallel guesses cannot slip past the limit.
    if (++failures >= MAX_LOGIN_FAILURES) lockedUntil = now() + LOCKOUT_MS;
    const hash = (await store.read())?.adminPasswordHash;
    if (!hash || !password || password.length > 256 || !verifyPassword(password, hash))
      return fail(reply, 401, 'Sign-in failed.');
    failures = 0;
    lockedUntil = 0;
    sessions.clear(); // one administrator session at a time
    const id = token();
    const session = { csrf: token(), createdAt: now(), seenAt: now() };
    sessions.set(id, session);
    reply.header(
      'set-cookie',
      `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ABSOLUTE_MS / 1000}`,
    );
    return { success: true, csrfToken: session.csrf };
  });

  /**
   * Both the HttpOnly cookie and the in-memory CSRF token are required, for reads too: cookies are not
   * isolated by port, so another local server that receives the cookie still cannot use it.
   */
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const id = sessionCookie(request);
    const session = id ? sessions.get(id) : undefined;
    if (!id || !session) return fail(reply, 401, 'Sign in required.');
    if (now() - session.seenAt > IDLE_MS || now() - session.createdAt > ABSOLUTE_MS) {
      sessions.delete(id);
      return fail(reply, 401, 'The session expired. Sign in again.');
    }
    const csrf = request.headers['x-csrf-token'];
    if (typeof csrf !== 'string' || !equal(csrf, session.csrf))
      return fail(reply, 403, 'Missing or invalid CSRF token.');
    session.seenAt = now();
  };
  const guarded = { preHandler: requireAdmin };

  app.post('/api/logout', guarded, async (request, reply) => {
    sessions.delete(sessionCookie(request) ?? '');
    reply.header('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return { success: true };
  });

  app.get('/api/config', guarded, async () => ({
    success: true,
    storage: store.storageDescription,
    ...describeFields((await store.read()) ?? { values: {} }),
  }));

  app.put('/api/config', guarded, async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const values = body.values ?? {};
    const remove = body.remove ?? [];
    if (
      !isRecord(values) ||
      !Array.isArray(remove) ||
      Object.entries(values).some(([name, v]) => !findField(name) || typeof v !== 'string') ||
      remove.some((name) => typeof name !== 'string' || !findField(name))
    )
      // Unknown keys are not echoed: a mistyped key could itself be a pasted secret.
      return fail(reply, 400, 'The request contains unknown settings or non-text values.');
    const updates = values as Record<string, string>;
    const removals = remove as string[];
    if (!Object.keys(updates).length && !removals.length)
      return fail(reply, 400, 'Nothing to save.');

    let errors: Record<string, string> = {};
    const unchanged = new Error('unchanged');
    try {
      const saved = await store.update((current) => {
        const next = { ...current.values, ...updates };
        for (const name of removals) delete next[name];
        const problems = findProblems(next);
        errors = Object.fromEntries(
          Object.entries(problems).filter(([name]) => Object.hasOwn(updates, name)),
        );
        // All or nothing: one rejected field leaves the stored configuration untouched.
        if (Object.keys(errors).length) throw unchanged;
        return { ...current, values: next };
      });
      return { success: true, ...describeFields(saved) };
    } catch (error) {
      if (error !== unchanged) throw error;
      return reply.code(422).send({ success: false, message: 'Nothing was saved.', errors });
    }
  });

  return app;
};
