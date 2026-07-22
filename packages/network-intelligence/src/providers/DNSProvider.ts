import { lookup } from 'node:dns/promises';
import { performance } from 'node:perf_hooks';
export interface DNSLookupResult { lookupMs: number; addresses: readonly string[]; }
export interface DNSProvider { lookup(hostname: string, signal: AbortSignal): Promise<DNSLookupResult>; }
export class NodeDNSProvider implements DNSProvider { async lookup(hostname: string, signal: AbortSignal): Promise<DNSLookupResult> { signal.throwIfAborted(); const start = performance.now(); const addresses = await lookup(hostname, { all: true }); signal.throwIfAborted(); return { lookupMs: performance.now() - start, addresses: addresses.map((a)=>a.address) }; } }
