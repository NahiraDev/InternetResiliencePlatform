import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';
export class NodeHTTPProvider {
    async request(url, signal) {
        return fetchLike(url, signal);
    }
    async tlsHandshake(url, signal) {
        signal.throwIfAborted();
        const u = new URL(url);
        if (u.protocol !== 'https:')
            throw new Error('TLS handshake requires an https URL');
        const start = performance.now();
        return new Promise((resolve, reject) => {
            let settled = false;
            const socket = tlsConnect({
                host: u.hostname,
                port: Number(u.port) || 443,
                servername: u.hostname,
                rejectUnauthorized: true,
            });
            const cleanup = () => {
                signal.removeEventListener('abort', onAbort);
                socket.removeAllListeners();
            };
            const fail = (error) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                socket.destroy();
                reject(error);
            };
            const onAbort = () => {
                fail(signal.reason ?? new Error('TLS handshake aborted'));
            };
            signal.addEventListener('abort', onAbort, { once: true });
            socket.once('secureConnect', () => {
                if (settled)
                    return;
                settled = true;
                const handshakeMs = performance.now() - start;
                const authorized = socket.authorized;
                cleanup();
                socket.destroy();
                resolve({ handshakeMs, authorized });
            });
            socket.once('error', fail);
        });
    }
    async publicIp(url, signal) {
        const res = await fetch(url, { signal });
        const json = (await res.json());
        return { ip: json.ip ?? null, asn: json.asn ?? null, isp: json.isp ?? json.org ?? null };
    }
    async bandwidth(url, signal) {
        const start = performance.now();
        const r = await fetchLike(url, signal);
        const seconds = Math.max((performance.now() - start) / 1000, 0.001);
        return { mbps: (r.bytes * 8) / 1_000_000 / seconds };
    }
}
const fetchLike = async (url, signal) => new Promise((resolve, reject) => {
    const start = performance.now();
    const u = new URL(url);
    const req = (u.protocol === 'http:' ? httpRequest : httpsRequest)(u, { method: 'GET', signal }, (res) => {
        let bytes = 0;
        res.on('data', (chunk) => {
            bytes += chunk.length;
        });
        res.on('end', () => {
            resolve({
                responseMs: performance.now() - start,
                statusCode: res.statusCode ?? 0,
                bytes,
            });
        });
    });
    req.on('error', reject);
    req.end();
});
//# sourceMappingURL=HTTPProvider.js.map