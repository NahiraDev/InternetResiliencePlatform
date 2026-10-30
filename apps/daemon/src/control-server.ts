/**
 * Local control channel for the running daemon.
 *
 * The CLI used to build its own throwaway runtime, so `irp status` described a process that was
 * not the daemon. This server exposes the *running* daemon over a Unix domain socket instead.
 *
 * Security model:
 * - Unix socket only; the daemon never opens a TCP port for control.
 * - The parent directory is 0700 and the socket 0600, so only the daemon's user (root for the
 *   system service) can connect. There is no token because filesystem permissions are the
 *   authentication boundary; a stale socket from a dead process is replaced, a live one is not.
 * - Requests cannot request live mutation. `cycle` accepts only `simulation` or `safe`; the mode
 *   the daemon mutates in is fixed by its own configuration. Every cycle still runs through
 *   `ResilienceRuntime`, which stays the sole mutation authority.
 * - Bodies are size-limited and JSON-only.
 */

import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { dirname } from 'node:path';

export { ControlClientError, controlRequest } from '@irp/resilience-runtime';

export interface ControlPort {
  health(): Promise<unknown>;
  snapshot(): Promise<unknown>;
  decisions(): Promise<unknown>;
  incidents(): Promise<unknown>;
  capabilities(): unknown;
  cycle(mode: 'simulation' | 'safe'): Promise<unknown>;
  reload(): Promise<unknown>;
}

/** Thrown by a ControlPort when the request is valid but conflicts with current runtime state. */
export class ControlConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ControlConflictError';
  }
}

const MAX_BODY_BYTES = 4 * 1024;

const send = (response: ServerResponse, status: number, body: unknown): void => {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store' });
  response.end(text);
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request body too large'), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('request body is not valid JSON'), { status: 400 });
  }
};

/** True when something is accepting connections on the socket path. */
const isLive = (path: string): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = connect(path);
    probe.once('connect', () => { probe.destroy(); resolve(true); });
    probe.once('error', () => resolve(false));
  });

export class ControlServer {
  private server: Server | undefined;

  constructor(private readonly socketPath: string, private readonly port: ControlPort) {}

  async start(): Promise<void> {
    mkdirSync(dirname(this.socketPath), { recursive: true, mode: 0o700 });
    if (existsSync(this.socketPath)) {
      if (await isLive(this.socketPath)) throw new Error(`another daemon is already listening on ${this.socketPath}`);
      unlinkSync(this.socketPath); // stale socket from a crashed process
    }
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.socketPath, () => resolve());
    });
    chmodSync(this.socketPath, 0o600);
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (existsSync(this.socketPath)) unlinkSync(this.socketPath);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const route = `${req.method} ${req.url?.split('?')[0]}`;
      switch (route) {
        case 'GET /v1/health': return send(res, 200, await this.port.health());
        case 'GET /v1/snapshot': return send(res, 200, await this.port.snapshot());
        case 'GET /v1/decisions': return send(res, 200, await this.port.decisions());
        case 'GET /v1/incidents': return send(res, 200, await this.port.incidents());
        case 'GET /v1/capabilities': return send(res, 200, this.port.capabilities());
        case 'POST /v1/reload': return send(res, 200, await this.port.reload());
        case 'POST /v1/cycle': {
          const body = (await readJson(req)) as { mode?: unknown };
          const mode = body.mode ?? 'safe';
          if (mode !== 'simulation' && mode !== 'safe')
            return send(res, 400, { error: 'mode must be simulation or safe; live execution is configured on the daemon, not requested over the socket' });
          return send(res, 200, await this.port.cycle(mode));
        }
        default: return send(res, 404, { error: 'not found' });
      }
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      send(res, status, { error: error instanceof Error ? error.message : 'internal error' });
    }
  }
}
