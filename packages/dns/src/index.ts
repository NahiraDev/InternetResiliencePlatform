export interface DnsQuestion { name: string; recordType: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS'; }
export interface DnsAnswer { name: string; recordType: DnsQuestion['recordType']; ttl: number; value: string; }
export interface DnsResolver { resolve(question: DnsQuestion): Promise<DnsAnswer[]>; }
export interface DnsProvider { id: string; name: string; resolvers: DnsResolver[]; }
export interface DnsHealthCheck { check(provider: DnsProvider): Promise<{ healthy: boolean; latencyMs: number; reason?: string }>; }
export interface DnsBenchmark { run(providers: DnsProvider[], question: DnsQuestion): Promise<Array<{ providerId: string; latencyMs: number; success: boolean }>>; }
