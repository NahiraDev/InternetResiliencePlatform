import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { BoundedClosedLoopController, createCanonicalRuntime, resolveStateDirectory, } from '@irp/resilience-runtime';
import { guardRequest, guardStateChange, issueControlToken, parseAutonomyRequest, readBoundedBody, } from './http-guard.js';
import { createLinuxNetworkControlPlane } from './linux-network-control-plane.js';
const execFileAsync = promisify(execFile);
async function command(file, args) {
    try {
        const result = await execFileAsync(file, args, { timeout: 5_000, maxBuffer: 512 * 1024 });
        return result.stdout.trim();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `unavailable: ${message}`;
    }
}
export class LinuxSystem {
    policy = { autonomousMode: false };
    async snapshot() {
        const [interfaces, routes, dns] = await Promise.all([
            command('ip', ['-brief', 'address']),
            command('ip', ['-brief', 'route']),
            command('resolvectl', ['status']),
        ]);
        return { interfaces, routes, dns, capturedAt: new Date().toISOString() };
    }
    async setAutonomousMode(enabled) {
        this.policy = { ...this.policy, autonomousMode: enabled };
    }
    getPolicy() {
        return { ...this.policy };
    }
}
/**
 * Converts non-mutating Linux diagnostics into canonical runtime observations.
 * The provider has no execution authority; all mutations remain behind
 * ResilienceRuntime's policy, safety, transaction and verification boundaries.
 */
export class LinuxSnapshotObservationProvider {
    system;
    id = 'linux-client-diagnostics';
    constructor(system) {
        this.system = system;
    }
    async collect(context) {
        const snapshot = await this.system.snapshot();
        const now = snapshot.capturedAt;
        const diagnosticEntries = [
            ['interfaces', snapshot.interfaces],
            ['routes', snapshot.routes],
            ['dns', snapshot.dns],
        ];
        const errors = diagnosticEntries
            .filter(([, value]) => value.startsWith('unavailable:'))
            .map(([metric, value]) => `${metric}: ${value}`);
        const observations = diagnosticEntries.map(([metric, value]) => ({
            id: `linux-${metric}-${context.correlationId}`,
            schemaVersion: 1,
            createdAt: now,
            correlationId: context.correlationId,
            source: this.id,
            metadata: { diagnostic: metric },
            category: 'network',
            metric: `linux_${metric}_available`,
            value: value.startsWith('unavailable:') ? 0 : 1,
            timestamp: now,
            freshnessMs: 0,
            confidence: value.startsWith('unavailable:') ? 0.5 : 0.95,
            severity: value.startsWith('unavailable:') ? 'warning' : 'info',
            status: value.startsWith('unavailable:') ? 'unknown' : 'healthy',
        }));
        return { providerId: this.id, observations, collectedAt: now, errors };
    }
}
/** The Linux client runtime for the canonical, safe-by-default composition. */
export class LinuxClientRuntime {
    runtime;
    started = false;
    autonomousMode = false;
    lastAutonomyCycle;
    composition;
    constructor(system, composition) {
        this.composition =
            composition ??
                createCanonicalRuntime({
                    executionMode: 'simulation',
                    observationProviders: [new LinuxSnapshotObservationProvider(system)],
                    runtimeId: 'linux-client-runtime',
                });
        this.runtime = this.composition.runtime;
    }
    async start() {
        if (this.started)
            return;
        // Simulation observes and evaluates the complete canonical runtime path
        // without mutating host networking during client startup.
        await this.composition.runCycle({
            correlationId: 'linux-client-startup',
            idempotencyKey: 'linux-client-startup',
        });
        this.started = true;
    }
    async setAutonomousMode(enabled) {
        if (enabled && !this.autonomousMode) {
            const controller = new BoundedClosedLoopController(this.runtime);
            this.lastAutonomyCycle = await controller.run({
                maxCycles: 1,
                stopWhenHealthy: true,
                correlationId: 'linux-client-autonomy',
                idempotencyKey: `linux-client-autonomy-${Date.now()}`,
            });
        }
        this.autonomousMode = enabled;
    }
    async status() {
        const capabilities = this.runtime.capabilities();
        return {
            runtime: await this.runtime.getRuntimeSnapshot(),
            autonomousMode: this.autonomousMode,
            ...(this.lastAutonomyCycle ? { lastAutonomyCycle: this.lastAutonomyCycle } : {}),
            capabilities,
            capabilityStatus: capabilities.map((descriptor) => ({
                adapterId: descriptor.adapterId,
                subsystem: descriptor.subsystem,
                status: descriptor.supportsLive ? 'live' : 'simulation-only',
                supportsSafe: descriptor.supportsSafe,
                supportsLive: descriptor.supportsLive,
                verificationSupport: descriptor.verificationSupport,
                recoverySupport: descriptor.recoverySupport,
            })),
        };
    }
}
/**
 * Production Linux client runtime.
 *
 * Unlike {@link LinuxClientRuntime} (which defaults to simulation), this
 * runtime wires a real {@link KernelRuntime} with the production routing
 * contract, a {@link RoutingEngine} with real Linux route discovery, and a
 * {@link ConnectivityManager} with configured providers (including
 * Starlink). It uses `executionMode: 'real'` and passes the
 * {@link CanonicalNetworkControlPlane} into {@link createCanonicalRuntime}
 * so the {@link CanonicalNetworkRuntimeAdapter} is registered with
 * `supportsLive: true`.
 *
 * The production runtime does NOT bypass the canonical mutation boundary.
 * All mutations still flow through the canonical runtime and its privileged
 * mutation boundary before reaching the kernel routing contract and the
 * Linux route executor.
 */
export class LinuxProductionRuntime {
    runtime;
    started = false;
    autonomousMode = false;
    lastAutonomyCycle;
    composition;
    controlPlane;
    constructor(system, options = {}) {
        this.controlPlane = createLinuxNetworkControlPlane({
            ...(options.enableLiveRouteMutation !== undefined ? { enableLiveRouteMutation: options.enableLiveRouteMutation } : {}),
            ...(options.netns ? { netns: options.netns } : {}),
            ...(options.connectivityProviders ? { connectivityProviders: options.connectivityProviders } : {}),
            ...(options.registerStarlink !== undefined ? { registerStarlink: options.registerStarlink } : {}),
            ...(options.starlinkOptions ? { starlinkOptions: options.starlinkOptions } : {}),
        });
        this.composition =
            options.composition ??
                createCanonicalRuntime({
                    executionMode: options.executionMode ?? 'real',
                    observationProviders: [new LinuxSnapshotObservationProvider(system)],
                    runtimeId: 'linux-production-runtime',
                    networkControlPlane: this.controlPlane.controlPlane,
                });
        this.runtime = this.composition.runtime;
    }
    async start() {
        if (this.started)
            return;
        await this.composition.runCycle({
            correlationId: 'linux-production-startup',
            idempotencyKey: 'linux-production-startup',
        });
        this.started = true;
    }
    async setAutonomousMode(enabled) {
        if (enabled && !this.autonomousMode) {
            const controller = new BoundedClosedLoopController(this.runtime);
            this.lastAutonomyCycle = await controller.run({
                maxCycles: 1,
                stopWhenHealthy: true,
                correlationId: 'linux-production-autonomy',
                idempotencyKey: `linux-production-autonomy-${Date.now()}`,
            });
        }
        this.autonomousMode = enabled;
    }
    async status() {
        const capabilities = this.runtime.capabilities();
        return {
            runtime: await this.runtime.getRuntimeSnapshot(),
            autonomousMode: this.autonomousMode,
            ...(this.lastAutonomyCycle ? { lastAutonomyCycle: this.lastAutonomyCycle } : {}),
            capabilities,
            capabilityStatus: capabilities.map((descriptor) => ({
                adapterId: descriptor.adapterId,
                subsystem: descriptor.subsystem,
                status: descriptor.supportsLive ? 'live' : 'simulation-only',
                supportsSafe: descriptor.supportsSafe,
                supportsLive: descriptor.supportsLive,
                verificationSupport: descriptor.verificationSupport,
                recoverySupport: descriptor.recoverySupport,
            })),
        };
    }
    /**
     * Exposes whether the production routing contract is registered and the
     * canonical network adapter supports live execution.
     */
    getRouteMutationCapability() {
        const capabilities = this.runtime.capabilities();
        const routingAdapter = capabilities.find((c) => c.subsystem === 'routing' && c.supportsLive);
        const connectivityAdapter = capabilities.find((c) => c.subsystem === 'connectivity' && c.supportsLive);
        return {
            kernelId: this.controlPlane.kernel.id,
            routingContractRegistered: true,
            liveRouteMutationEnabled: Boolean(routingAdapter?.supportsLive || connectivityAdapter?.supportsLive),
            capabilityStatus: capabilities.map((descriptor) => ({
                adapterId: descriptor.adapterId,
                subsystem: descriptor.subsystem,
                status: descriptor.supportsLive ? 'live' : 'simulation-only',
                supportsSafe: descriptor.supportsSafe,
                supportsLive: descriptor.supportsLive,
                verificationSupport: descriptor.verificationSupport,
                recoverySupport: descriptor.recoverySupport,
            })),
        };
    }
}
const html = (snapshot, policy, runtimeStatus) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IRP Linux Client</title><style>body{font:15px system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 16px}pre{white-space:pre-wrap;background:#f4f4f4;padding:16px;border-radius:8px}button{padding:8px 12px}</style></head>
<body><h1>Internet Resilience Platform</h1><p>Linux Full Client</p><p>Autonomous mode: <strong>${policy.autonomousMode ? 'enabled' : 'disabled'}</strong></p>
<p>This page is read-only. Autonomous mode is changed with an authenticated <code>POST /policy</code> (JSON body, bearer token from the control token file); the daemon's Unix control socket is the canonical control interface.</p>
<h2>Canonical runtime status</h2><pre>${escapeHtml(JSON.stringify(runtimeStatus, null, 2))}</pre>
<h2>Network diagnostics</h2><pre>${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre></body></html>`;
function escapeHtml(value) {
    return value
        .replaceAll(String.fromCharCode(38), String.fromCharCode(38) + 'amp;')
        .replaceAll(String.fromCharCode(60), String.fromCharCode(38) + 'lt;')
        .replaceAll(String.fromCharCode(62), String.fromCharCode(38) + 'gt;')
        .replaceAll(String.fromCharCode(34), String.fromCharCode(38) + 'quot;');
}
export class LinuxClientServer {
    system;
    runtime;
    controlToken;
    server = createServer((request, response) => void this.handle(request, response));
    port = 0;
    /**
     * @param controlToken Bearer token required for state changes. When undefined, `POST /policy`
     *   is disabled (fail-closed): the page stays readable but nothing can be changed over HTTP.
     */
    constructor(system, runtime = new LinuxClientRuntime(system), controlToken) {
        this.system = system;
        this.runtime = runtime;
        this.controlToken = controlToken;
    }
    async start(port = 17861, host = '127.0.0.1') {
        await this.runtime.start();
        await new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(port, host, () => resolve());
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
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
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
            response.end(html(await this.system.snapshot(), this.system.getPolicy(), await this.runtime.status()));
            return;
        }
        if (request.method === 'GET' && request.url === '/health') {
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify(await this.runtime.status()));
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
            await this.runtime.setAutonomousMode(parsed.enabled);
            await this.system.setAutonomousMode(parsed.enabled);
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ autonomousMode: parsed.enabled }));
            return;
        }
        response.statusCode = 404;
        response.end('Not Found');
    }
}
export async function runLinuxClient() {
    // Live autonomous mutation requires two explicit opt-ins. The default and
    // the UI toggle remain observe/simulate-only to prevent accidental host route
    // changes. Operators must set both variables deliberately to enable live mode.
    const liveMutationExplicitlyEnabled = process.env.IRP_EXECUTION_MODE === 'real' &&
        process.env.IRP_ENABLE_AUTONOMOUS_LIVE_MUTATION === 'true';
    const executionMode = liveMutationExplicitlyEnabled ? 'real' : 'simulation';
    const system = new LinuxSystem();
    const runtime = new LinuxProductionRuntime(system, {
        enableLiveRouteMutation: executionMode === 'real',
        executionMode,
    });
    // State changes over HTTP need a token only the service user can read. If no state directory is
    // resolvable the endpoint stays disabled rather than falling back to an open one.
    const stateDirectory = resolveStateDirectory(process.env);
    const controlToken = stateDirectory
        ? issueControlToken(join(stateDirectory, 'linux-client.token'))
        : undefined;
    const server = new LinuxClientServer(system, runtime, controlToken);
    await server.start();
    return server;
}
export * from './route-journal.js';
export * from './linux-network-control-plane.js';
export * from './linux-route-executor.js';
