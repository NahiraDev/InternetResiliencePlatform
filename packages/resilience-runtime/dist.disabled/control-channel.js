/**
 * Shared local control channel client and path resolution.
 *
 * The daemon serves the channel (apps/daemon); the CLI and other local tools consume it here so
 * both sides resolve the same socket path and speak the same protocol.
 */
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
/**
 * Where durable state lives. Returns `undefined` when persistence is intentionally off, which is
 * only the case for hermetic test runs that did not name a directory.
 */
export const resolveStateDirectory = (env, options = {}) => {
    if (env.IRP_STATE_DIR)
        return env.IRP_STATE_DIR;
    if (env.VITEST)
        return undefined;
    const uid = options.uid ?? (typeof process.getuid === 'function' ? process.getuid() : undefined);
    if (uid === 0)
        return '/var/lib/irp';
    if (env.XDG_STATE_HOME)
        return join(env.XDG_STATE_HOME, 'irp');
    const home = options.home ?? env.HOME;
    if (home)
        return join(home, '.local', 'state', 'irp');
    return undefined;
};
/** Unix socket for the local control channel; owner-only, never a network listener. */
export const resolveControlSocketPath = (env, options = {}) => {
    if (env.IRP_CONTROL_SOCKET)
        return env.IRP_CONTROL_SOCKET === 'disabled' ? undefined : env.IRP_CONTROL_SOCKET;
    if (env.VITEST)
        return undefined;
    const uid = options.uid ?? (typeof process.getuid === 'function' ? process.getuid() : undefined);
    if (uid === 0)
        return '/run/irp/irp.sock';
    if (env.XDG_RUNTIME_DIR)
        return join(env.XDG_RUNTIME_DIR, 'irp', 'irp.sock');
    const state = resolveStateDirectory(env, options);
    return state ? join(state, 'irp.sock') : undefined;
};
/** Thin client used by the CLI. */
export class ControlClientError extends Error {
    code;
    status;
    constructor(code, message, status) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'ControlClientError';
    }
}
export const controlRequest = (socketPath, method, path, body, timeoutMs = 30_000) => new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = httpRequest({ socketPath, method, path, timeout: timeoutMs, headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {} }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
            let parsed;
            try {
                parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            }
            catch {
                parsed = undefined;
            }
            if ((res.statusCode ?? 500) >= 400)
                reject(new ControlClientError('http', parsed?.error ?? `daemon returned ${res.statusCode}`, res.statusCode));
            else
                resolve(parsed);
        });
    });
    req.on('timeout', () => { req.destroy(); reject(new ControlClientError('unreachable', `daemon did not answer within ${timeoutMs}ms`)); });
    req.on('error', (e) => reject(new ControlClientError('unreachable', e.code === 'ENOENT' || e.code === 'ECONNREFUSED' ? `no daemon is listening on ${socketPath}` : e.message)));
    if (payload)
        req.write(payload);
    req.end();
});
//# sourceMappingURL=control-channel.js.map