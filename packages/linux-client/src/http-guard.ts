/**
 * Request guard for the Linux client's local HTTP surface.
 *
 * Threats handled:
 * - Remote clients: only loopback peers are served.
 * - DNS rebinding: the Host header must be a loopback name on this server's port.
 * - Cross-site requests (CSRF): a browser-supplied Origin must be this server's own origin, and
 *   state changes require `application/json` plus an `Authorization` header, neither of which a
 *   cross-site HTML form can send.
 * - Unauthorized local processes: state changes require a random bearer token that lives in a
 *   0600 file, so filesystem permissions decide who may use it.
 *
 * Nothing here can enable live mode or grant capabilities: the only accepted state change is the
 * autonomous-cycle switch, and trust is fixed by the process owner's environment at startup.
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IncomingMessage } from 'node:http';

export const MAX_CONTROL_BODY_BYTES = 1024;

export interface GuardVerdict {
  readonly ok: boolean;
  readonly status: number;
  readonly reason: string;
}

const allow: GuardVerdict = { ok: true, status: 200, reason: 'ok' };
const deny = (status: number, reason: string): GuardVerdict => ({ ok: false, status, reason });

const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const isLoopbackPeer = (address: string | undefined): boolean =>
  address !== undefined && LOOPBACK_PEERS.has(address);

/** `host` must be `<loopback name>:<port>` (or the bare name when the port is the scheme default). */
export const isAllowedHost = (host: string | undefined, port: number): boolean => {
  if (!host) return false;
  const match = /^(\[::1\]|[a-z0-9.-]+)(?::(\d+))?$/i.exec(host);
  if (!match) return false;
  const name = (match[1] ?? '').toLowerCase();
  const hostPort = match[2] === undefined ? 80 : Number(match[2]);
  return LOOPBACK_NAMES.has(name) && hostPort === port;
};

/** Checks that apply to every request, reads included. */
export const guardRequest = (request: IncomingMessage, port: number): GuardVerdict => {
  if (!isLoopbackPeer(request.socket.remoteAddress)) return deny(403, 'only loopback clients are served');
  if (!isAllowedHost(request.headers.host, port)) return deny(403, 'unexpected Host header');
  const origin = request.headers.origin;
  if (origin !== undefined) {
    // `Origin: null` (sandboxed frames, file://) and foreign origins are never same-origin.
    if (origin !== `http://${request.headers.host}`) return deny(403, 'cross-origin request refused');
  }
  return allow;
};

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

export const tokenMatches = (presented: string | undefined, expected: string): boolean =>
  presented !== undefined && timingSafeEqual(digest(presented), digest(expected));

/** Checks specific to state-changing requests. */
export const guardStateChange = (request: IncomingMessage, token: string | undefined): GuardVerdict => {
  if (token === undefined) return deny(403, 'control is disabled: no control token is configured');
  const type = (request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') return deny(415, 'content-type must be application/json');
  const auth = request.headers.authorization;
  const presented = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : undefined;
  if (!tokenMatches(presented, token)) return deny(401, 'missing or invalid control token');
  return allow;
};

export const readBoundedBody = async (request: IncomingMessage): Promise<string | GuardVerdict> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_CONTROL_BODY_BYTES) return deny(413, 'request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
};

/** Accepts exactly `{"autonomousMode": boolean}`. */
export const parseAutonomyRequest = (body: string): { enabled: boolean } | GuardVerdict => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return deny(400, 'body is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return deny(400, 'body must be a JSON object');
  const keys = Object.keys(parsed);
  const value = (parsed as Record<string, unknown>).autonomousMode;
  if (keys.length !== 1 || keys[0] !== 'autonomousMode' || typeof value !== 'boolean')
    return deny(400, 'body must be exactly {"autonomousMode": true|false}');
  return { enabled: value };
};

/** Creates a fresh token and writes it (atomically, 0600) so only the file's owner can read it. */
export const issueControlToken = (path: string): string => {
  const token = randomBytes(32).toString('hex');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, `${token}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
  return token;
};
