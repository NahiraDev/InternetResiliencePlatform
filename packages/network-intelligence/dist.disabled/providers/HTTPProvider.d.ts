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
export declare class NodeHTTPProvider implements HTTPProvider {
    request(url: string, signal: AbortSignal): Promise<HTTPResult>;
    tlsHandshake(url: string, signal: AbortSignal): Promise<TLSResult>;
    publicIp(url: string, signal: AbortSignal): Promise<PublicIPResult>;
    bandwidth(url: string, signal: AbortSignal): Promise<BandwidthResult>;
}
//# sourceMappingURL=HTTPProvider.d.ts.map