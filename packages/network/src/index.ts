import { networkInterfaces } from 'node:os';
import { performance } from 'node:perf_hooks';
export interface NetworkInterfaceInfo { name: string; address: string; family: 'IPv4' | 'IPv6'; internal: boolean; }
export const getNetworkInterfaces = (): NetworkInterfaceInfo[] => Object.entries(networkInterfaces()).flatMap(([name, infos]) => (infos ?? []).map((info) => ({ name, address: info.address, family: info.family as 'IPv4' | 'IPv6', internal: info.internal })));
export const detectIpCapabilities = (): { ipv4: boolean; ipv6: boolean } => { const interfaces = getNetworkInterfaces().filter((i) => !i.internal); return { ipv4: interfaces.some((i) => i.family === 'IPv4'), ipv6: interfaces.some((i) => i.family === 'IPv6') }; };
export const measureLatency = async (operation: () => Promise<unknown>): Promise<number> => { const start = performance.now(); await operation(); return performance.now() - start; };
export class ConnectivityMonitor { async status(): Promise<{ online: boolean; checkedAt: string }> { return { online: true, checkedAt: new Date().toISOString() }; } }
