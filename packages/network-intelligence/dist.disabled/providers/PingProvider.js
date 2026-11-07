import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
/** Deterministic in-process fixture for unit tests. */
export class MockablePingProvider {
    async ping(_host, signal) {
        signal.throwIfAborted();
        return { latencyMs: 1, success: true };
    }
}
/** Production ICMP provider using the platform ping utility without a shell. */
export class SystemPingProvider {
    timeoutMs;
    constructor(timeoutMs = 2_000) {
        this.timeoutMs = timeoutMs;
        if (!Number.isInteger(timeoutMs) || timeoutMs < 250)
            throw new Error('timeoutMs must be an integer >= 250');
    }
    async ping(host, signal) {
        if (!host.trim() || /[\r\n]/.test(host))
            throw new Error('host must be a non-empty single-line value');
        signal.throwIfAborted();
        const args = process.platform === 'win32'
            ? ['-n', '1', '-w', String(this.timeoutMs), host]
            : process.platform === 'darwin'
                ? ['-c', '1', '-W', String(this.timeoutMs), host]
                : ['-c', '1', '-W', String(Math.max(1, Math.ceil(this.timeoutMs / 1_000))), host];
        try {
            const started = performance.now();
            const result = await execFileAsync('ping', args, {
                windowsHide: true,
                timeout: this.timeoutMs + 250,
                maxBuffer: 32_000,
                signal,
            });
            const output = `${result.stdout}\n${result.stderr}`;
            const match = output.match(/(?:time[=<]|time[\s=])\s*([0-9]+(?:\.[0-9]+)?)\s*ms/i);
            const value = match?.[1] ? Number(match[1]) : performance.now() - started;
            return {
                success: true,
                latencyMs: Number.isFinite(value) ? value : performance.now() - started,
            };
        }
        catch (error) {
            if (signal.aborted)
                throw error;
            return { success: false, latencyMs: this.timeoutMs };
        }
    }
}
//# sourceMappingURL=PingProvider.js.map