import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { performance } from 'node:perf_hooks';
import { connect as tlsConnect } from 'node:tls';
import { URL } from 'node:url';

export interface HTTPResult {
  responseMs: number;
  statusCode: number;
  bytes: number;
}

export interface TLSResult {
  handshakeMs: number;
  authorized: boolean;
}

export interface PublicIPResult {
  ip: string | null;
  asn: number | null;
  isp: string | null;
}

export interface BandwidthResult {
  mbps: number;
}

export interface HTTPProvider {
  request(url: string, signal: AbortSignal): Promise<HTTPResult>;
  tlsHandshake(url: string, signal: AbortSignal): Promise<TLSResult>;
  publicIp(url: string, signal: AbortSignal): Promise<PublicIPResult>;
  bandwidth(url: string, signal: AbortSignal): Promise<BandwidthResult>;
}

export class NodeHTTPProvider implements HTTPProvider {
  async request(url: string, signal: AbortSignal): Promise<HTTPResult> {
    return fetchLike(url, signal);
  }

  async tlsHandshake(url: string, signal: AbortSignal): Promise<TLSResult> {
    signal.throwIfAborted();
    const u = new URL(url);
    if (u.protocol !== 'https:') {
      throw new Error('TLS handshake requires an https URL');
    }

    const start = performance.now();

    return new Promise<TLSResult>((resolve, reject) => {
      let settled = false;

      const socket = tlsConnect({
        host: u.hostname,
        port: Number(u.port) || 443,
        servername: u.hostname,
        rejectUnauthorized: false,
      });

      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
        socket.removeListener('secureConnect', onSecureConnect);
        socket.removeListener('error', onError);
      };

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      const onSecureConnect = () => {
        finish(() =>
          resolve({
            handshakeMs: performance.now() - start,
            authorized: socket.authorized,
          }),
        );
        socket.end();
      };

      const onError = (error: Error) => {
        finish(() => reject(error));
      };

      const onAbort = () => {
        const reason = signal.reason ?? new Error('TLS handshake aborted');
        finish(() => reject(reason));
        socket.destroy();
      };

      socket.once('secureConnect', onSecureConnect);
      socket.once('error', onError);
      signal.addEventListener('abort', onAbort, { once: true });

      if (signal.aborted) onAbort();
    });
  }

  async publicIp(url: string, signal: AbortSignal): Promise<PublicIPResult> {
    const res = await fetch(url, { signal });
    const json = (await res.json()) as { ip?: string; asn?: number; org?: string; isp?: string };
    return { ip: json.ip ?? null, asn: json.asn ?? null, isp: json.isp ?? json.org ?? null };
  }

  async bandwidth(url: string, signal: AbortSignal): Promise<BandwidthResult> {
    const start = performance.now();
    const r = await fetchLike(url, signal);
    const seconds = Math.max((performance.now() - start) / 1000, 0.001);
    return { mbps: (r.bytes * 8) / 1_000_000 / seconds };
  }
}

const fetchLike = async (url: string, signal: AbortSignal): Promise<HTTPResult> =>
  new Promise((resolve, reject) => {
    const start = performance.now();
    const u = new URL(url);
    const req = (u.protocol === 'http:' ? httpRequest : httpsRequest)(
      u,
      { method: 'GET', signal },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
        });
        res.on('end', () =>
          resolve({
            responseMs: performance.now() - start,
            statusCode: res.statusCode ?? 0,
            bytes,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
