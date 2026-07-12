import { networkInterfaces } from 'node:os';
import { performance } from 'node:perf_hooks';
import { lookup } from 'node:dns/promises';
export interface NetworkInterfaceInfo { name: string; address: string; family: 'IPv4' | 'IPv6'; internal: boolean; }
export interface ConnectivityStatus { online: boolean; ipv4: boolean; ipv6: boolean; captivePortal: boolean; gatewayReachable: boolean; dnsFailures: number; checkedAt: string; }
export const getNetworkInterfaces = (): NetworkInterfaceInfo[] => Object.entries(networkInterfaces()).flatMap(([name, infos]) => (infos ?? []).map((info) => ({ name, address: info.address, family: info.family as 'IPv4' | 'IPv6', internal: info.internal })));
export const detectIpCapabilities = (): { ipv4: boolean; ipv6: boolean } => { const interfaces = getNetworkInterfaces().filter((i) => !i.internal); return { ipv4: interfaces.some((i) => i.family === 'IPv4'), ipv6: interfaces.some((i) => i.family === 'IPv6') }; };
export const measureLatency = async (operation: () => Promise<unknown>): Promise<number> => { const start = performance.now(); await operation(); return performance.now() - start; };
export class ConnectivityMonitor { private last?: ConnectivityStatus; async status(): Promise<ConnectivityStatus> { const caps = detectIpCapabilities(); let dnsFailures = 0; try { await lookup('example.com'); } catch { dnsFailures += 1; } const status = { online: dnsFailures === 0 && (caps.ipv4 || caps.ipv6), ipv4: caps.ipv4, ipv6: caps.ipv6, captivePortal: false, gatewayReachable: caps.ipv4 || caps.ipv6, dnsFailures, checkedAt: new Date().toISOString() }; this.last = status; return status; } snapshot(): ConnectivityStatus | undefined { return this.last; } }
