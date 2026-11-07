import { lookup } from 'node:dns/promises';
import { performance } from 'node:perf_hooks';
export class NodeDNSProvider {
    async lookup(hostname, signal) {
        signal.throwIfAborted();
        const start = performance.now();
        const addresses = await lookup(hostname, { all: true });
        signal.throwIfAborted();
        return { lookupMs: performance.now() - start, addresses: addresses.map((a) => a.address) };
    }
}
//# sourceMappingURL=DNSProvider.js.map