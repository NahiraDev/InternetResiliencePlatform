import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { renderMacOSDashboard } from './local-dashboard.js';
import { guardRequest, guardStateChange, issueControlToken, parseAutonomyRequest, readBoundedBody, } from './http-guard.js';
const execFileAsync = promisify(execFile);
async function command(file, args, timeout = 5_000) {
    try {
        const result = await execFileAsync(file, args, { timeout, maxBuffer: 512 * 1024 });
        return result.stdout.trim();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `unavailable: ${message}`;
    }
}
export class MacOSSystem {
    policy = { autonomousMode: false };
    async snapshot() {
        if (process.platform !== 'darwin') {
            return {
                interfaces: 'unavailable: macOS platform required',
                routes: 'unavailable: macOS platform required',
                dns: 'unavailable: macOS platform required',
                networkServices: 'unavailable: macOS platform required',
                vpnServices: 'unavailable: macOS platform required',
                capturedAt: new Date().toISOString(),
                platform: 'unsupported',
            };
        }
        const [interfaces, routes, dns, networkServices, vpnServices] = await Promise.all([
            command('ifconfig', []),
            command('route', ['-n', 'get', 'default']),
            command('scutil', ['--dns']),
            command('networksetup', ['-listallnetworkservices']),
            command('scutil', ['--nc', 'list']),
        ]);
        return {
            interfaces,
            routes,
            dns,
            networkServices,
            vpnServices,
            capturedAt: new Date().toISOString(),
            platform: 'darwin',
        };
    }
    async setAutonomousMode(enabled) {
        this.policy = { ...this.policy, autonomousMode: enabled };
    }
    getPolicy() {
        return { ...this.policy };
    }
}
export class MacOSClientServer {
    system;
    controlToken;
    server = createServer((request, response) => void this.handle(request, response));
    port = 0;
    /** Without `controlToken`, `POST /policy` is disabled (fail-closed). */
    constructor(system, controlToken) {
        this.system = system;
        this.controlToken = controlToken;
    }
    async start(port = 17862, host = '127.0.0.1') {
        await new Promise((resolve, reject) => {
            const onError = (error) => {
                this.server.off('listening', onListening);
                reject(error);
            };
            const onListening = () => {
                this.server.off('error', onError);
                resolve();
            };
            this.server.once('error', onError);
            this.server.once('listening', onListening);
            this.server.listen(port, host);
        });
        this.port = this.server.address().port;
    }
    address() {
        return this.server.address();
    }
    async stop() {
        await new Promise((resolve, reject) => this.server.close((error) => (error ? reject(error) : resolve())));
    }
    refuse(response, verdict) {
        response.statusCode = verdict.status;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: verdict.reason }));
    }
    async handle(request, response) {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
        const verdict = guardRequest(request, this.port);
        if (!verdict.ok)
            return this.refuse(response, verdict);
        if (request.method === 'GET' && request.url === '/') {
            response.end(renderMacOSDashboard(await this.system.snapshot(), this.system.getPolicy()));
            return;
        }
        if (request.method === 'GET' && request.url === '/health') {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ status: 'ok', platform: process.platform }));
            return;
        }
        if (request.method === 'GET' && request.url === '/policy') {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(this.system.getPolicy()));
            return;
        }
        if (request.method === 'POST' && request.url === '/policy') {
            const gate = guardStateChange(request, this.controlToken);
            if (!gate.ok)
                return this.refuse(response, gate);
            const body = await readBoundedBody(request);
            if (typeof body !== 'string')
                return this.refuse(response, body);
            const parsed = parseAutonomyRequest(body);
            if ('ok' in parsed)
                return this.refuse(response, parsed);
            await this.system.setAutonomousMode(parsed.enabled);
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ autonomousMode: parsed.enabled }));
            return;
        }
        response.statusCode = 404;
        response.end('Not Found');
    }
}
export async function runMacOSClient() {
    const stateDirectory = process.env.IRP_STATE_DIR;
    const token = stateDirectory ? issueControlToken(join(stateDirectory, 'macos-client.token')) : undefined;
    const server = new MacOSClientServer(new MacOSSystem(), token);
    await server.start();
    return server;
}
if (import.meta.url === `file://${process.argv[1]}`) {
    await runMacOSClient();
}
