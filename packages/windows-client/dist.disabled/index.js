import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
async function command(file, args, timeout = 5_000) {
    try {
        const result = await execFileAsync(file, args, {
            timeout,
            maxBuffer: 512 * 1024,
            windowsHide: true,
        });
        return result.stdout.trim();
    }
    catch (error) {
        return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
}
export class WindowsSystem {
    policy = { autonomousMode: false };
    async snapshot() {
        if (process.platform !== 'win32') {
            return {
                interfaces: 'unavailable: Windows platform required',
                routes: 'unavailable: Windows platform required',
                dns: 'unavailable: Windows platform required',
                capturedAt: new Date().toISOString(),
                platform: 'unsupported',
            };
        }
        const [interfaces, routes, dns] = await Promise.all([
            command('ipconfig', ['/all']),
            command('route', ['print']),
            command('netsh', ['interface', 'ipv4', 'show', 'dnsservers']),
        ]);
        return { interfaces, routes, dns, capturedAt: new Date().toISOString(), platform: 'win32' };
    }
    async setAutonomousMode(enabled) {
        this.policy = { autonomousMode: enabled };
    }
    getPolicy() {
        return { ...this.policy };
    }
}
