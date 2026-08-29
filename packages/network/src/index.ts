import { lookup } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { networkInterfaces } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Socket } from 'node:net';
import { promisify } from 'node:util';
import { URL } from 'node:url';

const execFileAsync = promisify(execFile);
export type ProbeType = 'dns' | 'tcp' | 'http' | 'packet_loss' | 'stability' | 'throughput' | 'ip' | 'provider';
export interface NetworkInterfaceInfo { name: string; address: string; family: 'IPv4' | 'IPv6'; internal: boolean; }
export interface ProbeResult<T = Record<string, unknown>> { probeType: ProbeType; name: string; success: boolean; latencyMs: number; timestamp: string; error?: string; metadata: T; }
export interface ProbeContext { signal: AbortSignal; now(): string; }
export interface NetworkProbe<C = Record<string, unknown>, R = Record<string, unknown>> { name: string; type: ProbeType; config: C; execute(context: ProbeContext): Promise<ProbeResult<R>>; }
export interface ConnectivityStatus { online: boolean; ipv4: boolean; ipv6: boolean; captivePortal: boolean; gatewayReachable: boolean; dnsFailures: number; checkedAt: string; }
export interface NetworkMeasurement { id: string; timestamp: string; probeType: ProbeType; latency: number | null; success: boolean; error: string | null; metadata: Record<string, unknown>; }
export interface NetworkHealthScore { id: string; timestamp: string; score: number; factors: Record<string, unknown>; }
export interface NetworkNode { id: string; name: string; location?: string; endpoint: string; status: 'active' | 'degraded' | 'offline' | 'unknown'; }
export interface MonitoringSnapshot { status: 'healthy' | 'degraded' | 'unhealthy'; score: NetworkHealthScore; measurements: NetworkMeasurement[]; failures: Record<string, number>; issues: string[]; }
type Store = { measurements: NetworkMeasurement[]; healthScores: NetworkHealthScore[]; nodes: NetworkNode[] };
export const createNetworkTelemetryStore = (): Store => ({ measurements: [], healthScores: [], nodes: [] });
export const getNetworkInterfaces = (): NetworkInterfaceInfo[] => Object.entries(networkInterfaces()).flatMap(([name, infos]) => (infos ?? []).map((info) => ({ name, address: info.address, family: info.family as 'IPv4' | 'IPv6', internal: info.internal })));
export const detectIpCapabilities = (): { ipv4: boolean; ipv6: boolean } => { const interfaces = getNetworkInterfaces().filter((i) => !i.internal); return { ipv4: interfaces.some((i) => i.family === 'IPv4'), ipv6: interfaces.some((i) => i.family === 'IPv6') }; };
export const measureLatency = async (operation: () => Promise<unknown>): Promise<number> => { const start = performance.now(); await operation(); return performance.now() - start; };
const elapsed = (start: number) => Math.round(performance.now() - start);
const abortError = () => new Error('operation aborted');
const withTimeout = async <T>(timeoutMs: number, signal: AbortSignal, fn: () => Promise<T>): Promise<T> => { if (signal.aborted) throw abortError(); return new Promise<T>((resolve, reject) => { const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); reject(new Error('operation timed out')); }, timeoutMs); const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }; const onAbort = () => { cleanup(); reject(abortError()); }; signal.addEventListener('abort', onAbort, { once: true }); void fn().then((v) => { cleanup(); resolve(v); }, (e) => { cleanup(); reject(e); }); }); };
const result = <T extends Record<string, unknown>>(probeType: ProbeType, name: string, started: number, success: boolean, metadata: T, error?: string, timestamp = new Date().toISOString()): ProbeResult<T> => ({ probeType, name, success, latencyMs: elapsed(started), timestamp, metadata, ...(error ? { error } : {}) });

export class DnsLatencyProbe implements NetworkProbe<{ hostname: string; timeoutMs: number }, { addressCount: number; family?: number }> { name = 'dns-latency'; type = 'dns' as const; constructor(public config = { hostname: 'example.com', timeoutMs: 2500 }) {} async execute(context: ProbeContext) { const s = performance.now(); try { const records = await withTimeout(this.config.timeoutMs, context.signal, () => lookup(this.config.hostname, { all: true })); return result(this.type, this.name, s, records.length > 0, { addressCount: records.length, ...(records[0]?.family ? { family: records[0].family } : {}) }, undefined, context.now()); } catch (e) { return result(this.type, this.name, s, false, { addressCount: 0 }, e instanceof Error ? e.message : String(e), context.now()); } } }

export class TcpLatencyProbe implements NetworkProbe<{ host: string; port: number; timeoutMs: number }, { host: string; port: number }> { name = 'tcp-latency'; type = 'tcp' as const; constructor(public config = { host: 'example.com', port: 443, timeoutMs: 2500 }) {} async execute(context: ProbeContext) { const s = performance.now(); return new Promise<ProbeResult<{ host: string; port: number }>>((resolve) => { const socket = new Socket(); let settled = false; const done = (success: boolean, error?: string) => { if (settled) return; settled = true; context.signal.removeEventListener('abort', onAbort); socket.destroy(); resolve(result(this.type, this.name, s, success, { host: this.config.host, port: this.config.port }, error, context.now())); }; const onAbort = () => done(false, 'operation aborted'); context.signal.addEventListener('abort', onAbort, { once: true }); socket.setTimeout(this.config.timeoutMs); socket.once('connect', () => done(true)); socket.once('timeout', () => done(false, 'TCP connection timed out')); socket.once('error', (e) => done(false, e.message)); socket.connect(this.config.port, this.config.host); }); } }

export class HttpAvailabilityProbe implements NetworkProbe<{ url: string; timeoutMs: number }, { statusCode?: number; bytesRead: number }> { name = 'http-availability'; type = 'http' as const; constructor(public config = { url: 'https://example.com', timeoutMs: 4000 }) {} async execute(context: ProbeContext) { const s = performance.now(); try { const u = new URL(this.config.url); const client = u.protocol === 'http:' ? httpRequest : httpsRequest; return await new Promise<ProbeResult<{ statusCode?: number; bytesRead: number }>>((resolve) => { let settled = false; const finish = (r: ProbeResult<{ statusCode?: number; bytesRead: number }>) => { if (settled) return; settled = true; context.signal.removeEventListener('abort', abort); resolve(r); }; const req = client(u, { method: 'GET', timeout: this.config.timeoutMs }, (res) => { let bytesRead = 0; res.on('data', (chunk: Buffer) => { bytesRead += chunk.length; }); res.on('end', () => finish(result(this.type, this.name, s, Boolean(res.statusCode && res.statusCode < 500), { ...(res.statusCode ? { statusCode: res.statusCode } : {}), bytesRead }, undefined, context.now()))); }); const abort = () => { req.destroy(); finish(result(this.type, this.name, s, false, { bytesRead: 0 }, 'operation aborted', context.now())); }; context.signal.addEventListener('abort', abort, { once: true }); req.once('timeout', () => { req.destroy(); finish(result(this.type, this.name, s, false, { bytesRead: 0 }, 'HTTP request timed out', context.now())); }); req.once('error', (e) => finish(result(this.type, this.name, s, false, { bytesRead: 0 }, e.message, context.now()))); req.end(); }); } catch (e) { return result(this.type, this.name, s, false, { bytesRead: 0 }, e instanceof Error ? e.message : String(e), context.now()); } } }

export class IpCapabilityProbe implements NetworkProbe { name = 'ip-capability'; type = 'ip' as const; config = {}; async execute(context: ProbeContext) { const s = performance.now(); if (context.signal.aborted) return result(this.type, this.name, s, false, {}, 'operation aborted', context.now()); const caps = detectIpCapabilities(); return result(this.type, this.name, s, caps.ipv4 || caps.ipv6, { ...caps, interfaces: getNetworkInterfaces().filter((i) => !i.internal).length, scorable: false }, undefined, context.now()); } }
export class ProviderInfoProbe implements NetworkProbe { name = 'provider-info'; type = 'provider' as const; config = {}; async execute(context: ProbeContext) { const s = performance.now(); return result(this.type, this.name, s, false, { provider: null, source: 'not-configured', scorable: false }, 'provider discovery is not configured', context.now()); } }

export class PacketLossProbe implements NetworkProbe<{ attempts: number; timeoutMs: number; host: string }, { attempts: number; lost: number; lossRatio: number; method: string }> { name = 'packet-loss'; type = 'packet_loss' as const; constructor(public config = { attempts: 5, timeoutMs: 1500, host: '1.1.1.1' }) {} async execute(context: ProbeContext) { const s = performance.now(); let lost = 0; for (let i = 0; i < this.config.attempts; i += 1) { if (context.signal.aborted) return result(this.type, this.name, s, false, { attempts: i, lost, lossRatio: i ? lost / i : 1, method: 'ICMP echo via system ping' }, 'operation aborted', context.now()); try { await withTimeout(this.config.timeoutMs + 500, context.signal, () => execFileAsync('ping', ['-n', '-c', '1', '-W', String(Math.max(1, Math.ceil(this.config.timeoutMs / 1000))), this.config.host]).then(() => undefined)); } catch { lost += 1; } } const ratio = this.config.attempts ? lost / this.config.attempts : 1; return result(this.type, this.name, s, ratio < 1, { attempts: this.config.attempts, lost, lossRatio: ratio, method: 'ICMP echo via system ping' }, ratio === 1 ? 'all ICMP probes failed' : undefined, context.now()); } }
export class StabilityProbe implements NetworkProbe<{ attempts: number; timeoutMs: number; host: string }, { attempts: number; lost: number; lossRatio: number; method: string }> { name = 'connection-stability'; type = 'stability' as const; constructor(public config = { attempts: 5, timeoutMs: 1500, host: '1.1.1.1' }) {} async execute(context: ProbeContext) { const r = await new PacketLossProbe(this.config).execute(context); return { ...r, name: this.name, probeType: this.type }; } }

type ThroughputConfig = { downloadUrl?: string; uploadUrl?: string; bytes: number; timeoutMs: number };
type ThroughputMetadata = { downloadMbps?: number; uploadMbps?: number; bytes: number; measured: boolean };
export class ThroughputProbe implements NetworkProbe<ThroughputConfig, ThroughputMetadata> {
  name = 'throughput';
  type = 'throughput' as const;
  constructor(public config: ThroughputConfig = { bytes: 1024 * 1024, timeoutMs: 10000 }) {}
  private async transfer(context: ProbeContext, url: string, method: 'GET' | 'POST', bytes: number): Promise<{ elapsedMs: number; transferred: number }> {
    const start = performance.now();
    const u = new URL(url);
    const client = u.protocol === 'http:' ? httpRequest : httpsRequest;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, value?: { elapsedMs: number; transferred: number }) => {
        if (settled) return;
        settled = true;
        context.signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(value!);
      };
      const abort = () => { req.destroy(); finish(abortError()); };
      const req = client(u, { method, timeout: this.config.timeoutMs, headers: method === 'POST' ? { 'content-length': String(bytes), 'content-type': 'application/octet-stream' } : { range: `bytes=0-${bytes - 1}` } }, (res) => {
        let transferred = 0;
        res.on('data', (chunk: Buffer) => {
          if (transferred < bytes) transferred += Math.min(chunk.length, bytes - transferred);
        });
        res.on('end', () => finish(undefined, { elapsedMs: performance.now() - start, transferred }));
      });
      context.signal.addEventListener('abort', abort, { once: true });
      req.once('timeout', () => { req.destroy(); finish(new Error('throughput request timed out')); });
      req.once('error', (error) => finish(error));
      if (method === 'POST') {
        const chunk = Buffer.alloc(Math.min(64 * 1024, bytes));
        let remaining = bytes;
        while (remaining > 0) {
          if (context.signal.aborted) return abort();
          const n = Math.min(remaining, chunk.length);
          req.write(chunk.subarray(0, n));
          remaining -= n;
        }
        req.end();
      } else req.end();
    });
  }
  async execute(context: ProbeContext): Promise<ProbeResult<ThroughputMetadata>> {
    const s = performance.now();
    if (!this.config.downloadUrl && !this.config.uploadUrl) return result(this.type, this.name, s, false, { bytes: this.config.bytes, measured: false }, 'throughput endpoint is not configured', context.now());
    try {
      const metadata: ThroughputMetadata = { bytes: this.config.bytes, measured: true };
      if (this.config.downloadUrl) {
        const d = await this.transfer(context, this.config.downloadUrl, 'GET', this.config.bytes);
        if (d.transferred > 0 && d.elapsedMs > 0) metadata.downloadMbps = Number(((d.transferred * 8) / (d.elapsedMs / 1000) / 1_000_000).toFixed(2));
      }
      if (this.config.uploadUrl) {
        const u = await this.transfer(context, this.config.uploadUrl, 'POST', this.config.bytes);
        if (u.transferred > 0 && u.elapsedMs > 0) metadata.uploadMbps = Number(((u.transferred * 8) / (u.elapsedMs / 1000) / 1_000_000).toFixed(2));
      }
      const measured = metadata.downloadMbps !== undefined || metadata.uploadMbps !== undefined;
      metadata.measured = measured;
      return result(this.type, this.name, s, measured, metadata, measured ? undefined : 'throughput transfer produced no bytes', context.now());
    } catch (e) {
      return result(this.type, this.name, s, false, { bytes: this.config.bytes, measured: false }, e instanceof Error ? e.message : String(e), context.now());
    }
  }
}

export const defaultNetworkProbes = (): NetworkProbe[] => [new DnsLatencyProbe(), new TcpLatencyProbe(), new HttpAvailabilityProbe(), new PacketLossProbe(), new StabilityProbe(), new ThroughputProbe(), new IpCapabilityProbe(), new ProviderInfoProbe()];

export class NetworkMonitoringService {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<MonitoringSnapshot> | undefined;
  private readonly failures = new Map<string, number>();
  private abortController: AbortController | undefined;
  constructor(private readonly probes: NetworkProbe[] = defaultNetworkProbes(), private readonly store = createNetworkTelemetryStore(), private readonly intervalMs = 60_000, private readonly retries = 1) {}
  start(): void { this.timer ??= setInterval(() => { void this.runOnce(); }, this.intervalMs); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; this.abortController?.abort(); this.abortController = undefined; }
  async runOnce(): Promise<MonitoringSnapshot> { if (this.running) return this.running; this.running = this.collectOnce(); try { return await this.running; } finally { this.running = undefined; } }
  private async collectOnce(): Promise<MonitoringSnapshot> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const context: ProbeContext = { signal: this.abortController.signal, now: () => new Date().toISOString() };
    const measurements: NetworkMeasurement[] = [];
    for (const probe of this.probes) {
      let r: ProbeResult | undefined;
      const attempts: Array<{ success: boolean; latencyMs: number; error?: string }> = [];
      for (let attempt = 0; attempt <= this.retries; attempt += 1) {
        r = await probe.execute(context);
        attempts.push({ success: r.success, latencyMs: r.latencyMs, ...(r.error ? { error: r.error } : {}) });
        if (r.success || context.signal.aborted) break;
      }
      const m: NetworkMeasurement = { id: crypto.randomUUID(), timestamp: r?.timestamp ?? context.now(), probeType: probe.type, latency: r?.latencyMs ?? null, success: Boolean(r?.success), error: r?.error ?? null, metadata: { ...(r?.metadata ?? {}), attempts, finalAttempt: attempts.length } };
      measurements.push(m);
      this.store.measurements.push(m);
      this.failures.set(probe.name, m.success ? 0 : (this.failures.get(probe.name) ?? 0) + 1);
    }
    const score = calculateHealthScore(measurements);
    this.store.healthScores.push(score);
    return this.snapshot(measurements, score);
  }
  snapshot(measurements = this.store.measurements.slice(-this.probes.length), score = this.store.healthScores.at(-1) ?? calculateHealthScore(measurements)): MonitoringSnapshot { const failures = Object.fromEntries(this.failures); const issues = measurements.filter((m) => !m.success && m.metadata['scorable'] !== false).map((m) => `${m.probeType}: ${m.error ?? 'failed'}`); return { status: score.score >= 80 ? 'healthy' : score.score >= 50 ? 'degraded' : 'unhealthy', score, measurements, failures, issues }; }
  measurements(): NetworkMeasurement[] { return [...this.store.measurements]; }
}

export const calculateHealthScore = (measurements: NetworkMeasurement[]): NetworkHealthScore => { const scored = measurements.filter((m) => m.metadata['scorable'] !== false && m.metadata['measured'] !== false); const total = scored.length; if (!total) return { id: crypto.randomUUID(), timestamp: new Date().toISOString(), score: 0, factors: { total: 0, reason: 'no scorable network evidence' } }; const successes = scored.filter((m) => m.success).length; const availability = successes / total; const latencies = scored.map((m) => m.latency).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)); const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null; const latencyPenalty = avgLatency === null ? 0 : Math.max(0, Math.min(40, (avgLatency - 100) / 10)); const score = Math.max(0, Math.min(100, Math.round(availability * 100 - latencyPenalty))); return { id: crypto.randomUUID(), timestamp: new Date().toISOString(), score, factors: { total, successes, availability, avgLatencyMs: avgLatency === null ? null : Math.round(avgLatency) } }; };

export class ConnectivityMonitor {
  private last?: ConnectivityStatus;
  constructor(private readonly dnsHostname = 'example.com', private readonly captivePortalUrl = 'http://connectivitycheck.gstatic.com/generate_204') {}
  private async gateway(): Promise<string | undefined> { try { const { stdout } = await execFileAsync('ip', ['-4', 'route', 'show', 'default']); return stdout.match(/default via ([0-9.]+)/)?.[1]; } catch { return undefined; } }
  private async ping(host: string): Promise<boolean> { try { await execFileAsync('ping', ['-n', '-c', '1', '-W', '2', host]); return true; } catch { return false; } }
  private async captivePortal(): Promise<boolean> { try { const u = new URL(this.captivePortalUrl); const client = u.protocol === 'http:' ? httpRequest : httpsRequest; return await new Promise<boolean>((resolve) => { const req = client(u, { method: 'GET', timeout: 3000 }, (res) => { const redirected = Boolean(res.headers.location); res.resume(); res.once('end', () => resolve(res.statusCode !== 204 || redirected)); }); req.once('timeout', () => { req.destroy(); resolve(false); }); req.once('error', () => resolve(false)); req.end(); }); } catch { return false; } }
  async status(): Promise<ConnectivityStatus> { const caps = detectIpCapabilities(); let dnsFailures = 0; try { await lookup(this.dnsHostname); } catch { dnsFailures += 1; } const gateway = await this.gateway(); const gatewayReachable = gateway ? await this.ping(gateway) : false; const captivePortal = await this.captivePortal(); const online = !captivePortal && dnsFailures === 0 && gatewayReachable; const status = { online, ipv4: caps.ipv4, ipv6: caps.ipv6, captivePortal, gatewayReachable, dnsFailures, checkedAt: new Date().toISOString() }; this.last = status; return status; }
  snapshot(): ConnectivityStatus | undefined { return this.last; }
}