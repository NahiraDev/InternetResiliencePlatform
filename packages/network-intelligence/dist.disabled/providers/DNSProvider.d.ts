export interface DNSLookupResult {
    lookupMs: number;
    addresses: readonly string[];
}
export interface DNSProvider {
    lookup(hostname: string, signal: AbortSignal): Promise<DNSLookupResult>;
}
export declare class NodeDNSProvider implements DNSProvider {
    lookup(hostname: string, signal: AbortSignal): Promise<DNSLookupResult>;
}
//# sourceMappingURL=DNSProvider.d.ts.map