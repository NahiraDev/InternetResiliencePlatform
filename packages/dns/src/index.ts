import { Resolver } from 'node:dns/promises';
import { performance } from 'node:perf_hooks';

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS';
export type ResolverProtocol = 'udp' | 'tcp' | 'doh' | 'dot' | 'dnscrypt' | 'odoh' | 'doq';
export interface DnsQuestion { name: string; recordType: DnsRecordType; }
export interface DnsAnswer { name: string; recordType: DnsQuestion['recordType']; ttl: number; value: string; }
export interface ResolveOptions { timeoutMs?: number; protocol?: ResolverProtocol; }
export interface ProviderMetadata { id: string; name: string; country?: string; homepage: string; endpoints: { ipv4: string[]; ipv6: string[]; doh?: string; dot?: string }; tags: string[]; }
export interface ProviderHealth { healthy: boolean; latencyMs: number; checkedAt: string; reason?: string; }
export interface ProviderConfig { enabled: boolean; timeoutMs: number; protocols: ResolverProtocol[]; bootstrapServers?: string[]; }
export interface DnsResolver { protocol: ResolverProtocol; resolve(question: DnsQuestion, provider: DnsProvider, options?: ResolveOptions): Promise<DnsAnswer[]>; }
export interface DnsProvider { id: string; name: string; config: ProviderConfig; resolve(question: DnsQuestion, options?: ResolveOptions): Promise<DnsAnswer[]>; resolveIPv4(name: string, options?: ResolveOptions): Promise<string[]>; resolveIPv6(name: string, options?: ResolveOptions): Promise<string[]>; health(): Promise<ProviderHealth>; latency(): Promise<number>; supportsDNSSEC(): boolean; supportsDoH(): boolean; supportsDoT(): boolean; metadata(): ProviderMetadata; }
export interface DnsHealthCheck { check(provider: DnsProvider): Promise<ProviderHealth>; }
export interface BenchmarkSample { providerId: string; latencyMs: number; success: boolean; timedOut: boolean; error?: string; timestamp: string; }
export interface DnsBenchmark { run(providers: DnsProvider[], question: DnsQuestion): Promise<BenchmarkSample[]>; }

const txtToAnswers = (question: DnsQuestion, values: string[][]): DnsAnswer[] => values.map((v) => ({ ...question, ttl: 60, value: v.join('') }));
const valuesToAnswers = (question: DnsQuestion, values: string[]): DnsAnswer[] => values.map((value) => ({ ...question, ttl: 60, value }));

export class NodeDnsResolver implements DnsResolver {
  constructor(public readonly protocol: ResolverProtocol = 'udp') {}
  async resolve(question: DnsQuestion, provider: DnsProvider): Promise<DnsAnswer[]> {
    if (!['udp', 'tcp', 'doh', 'dot'].includes(this.protocol)) throw new Error(`Protocol ${this.protocol} is registered for future support`);
    const resolver = new Resolver();
    const endpoints = provider.metadata().endpoints;
    resolver.setServers([...endpoints.ipv4, ...endpoints.ipv6.map((ip) => `[${ip}]`)]);
    switch (question.recordType) {
      case 'A': return valuesToAnswers(question, await resolver.resolve4(question.name));
      case 'AAAA': return valuesToAnswers(question, await resolver.resolve6(question.name));
      case 'TXT': return txtToAnswers(question, await resolver.resolveTxt(question.name));
      default: return valuesToAnswers(question, await resolver.resolve(question.name, question.recordType));
    }
  }
}

const DEFAULT_CONFIG: ProviderConfig = { enabled: true, timeoutMs: 2_000, protocols: ['udp', 'tcp', 'doh', 'dot'] };

export class StaticDnsProvider implements DnsProvider {
  constructor(private readonly details: ProviderMetadata & { dnssec: boolean }, public readonly config: ProviderConfig = DEFAULT_CONFIG, private readonly resolvers: DnsResolver[] = [new NodeDnsResolver('udp')]) {}
  get id(): string { return this.details.id; }
  get name(): string { return this.details.name; }
  async resolve(question: DnsQuestion, options: ResolveOptions = {}): Promise<DnsAnswer[]> { const resolver = this.resolvers.find((r) => r.protocol === (options.protocol ?? this.config.protocols[0])) ?? this.resolvers[0]; if (!resolver) throw new Error(`No resolver configured for ${this.id}`); return resolver.resolve(question, this, options); }
  async resolveIPv4(name: string, options?: ResolveOptions): Promise<string[]> { return (await this.resolve({ name, recordType: 'A' }, options)).map((a) => a.value); }
  async resolveIPv6(name: string, options?: ResolveOptions): Promise<string[]> { return (await this.resolve({ name, recordType: 'AAAA' }, options)).map((a) => a.value); }
  async health(): Promise<ProviderHealth> { try { const latencyMs = await this.latency(); return { healthy: true, latencyMs, checkedAt: new Date().toISOString() }; } catch (error) { return { healthy: false, latencyMs: Number.POSITIVE_INFINITY, checkedAt: new Date().toISOString(), reason: error instanceof Error ? error.message : 'unknown error' }; } }
  async latency(): Promise<number> { const start = performance.now(); await this.resolveIPv4('example.com', { timeoutMs: this.config.timeoutMs }); return performance.now() - start; }
  supportsDNSSEC(): boolean { return this.details.dnssec; }
  supportsDoH(): boolean { return Boolean(this.details.endpoints.doh); }
  supportsDoT(): boolean { return Boolean(this.details.endpoints.dot); }
  metadata(): ProviderMetadata { return { id: this.details.id, name: this.details.name, ...(this.details.country ? { country: this.details.country } : {}), homepage: this.details.homepage, endpoints: this.details.endpoints, tags: [...this.details.tags] }; }
}

export const BUILTIN_PROVIDER_METADATA: Array<ProviderMetadata & { dnssec: boolean }> = [
  { id: 'cloudflare', name: 'Cloudflare', country: 'US', homepage: 'https://developers.cloudflare.com/1.1.1.1/', endpoints: { ipv4: ['1.1.1.1', '1.0.0.1'], ipv6: ['2606:4700:4700::1111', '2606:4700:4700::1001'], doh: 'https://cloudflare-dns.com/dns-query', dot: 'tls://1.1.1.1' }, tags: ['anycast', 'privacy'], dnssec: true },
  { id: 'google', name: 'Google Public DNS', country: 'US', homepage: 'https://developers.google.com/speed/public-dns', endpoints: { ipv4: ['8.8.8.8', '8.8.4.4'], ipv6: ['2001:4860:4860::8888', '2001:4860:4860::8844'], doh: 'https://dns.google/dns-query', dot: 'tls://dns.google' }, tags: ['anycast'], dnssec: true },
  { id: 'quad9', name: 'Quad9', country: 'CH', homepage: 'https://quad9.net/', endpoints: { ipv4: ['9.9.9.9', '149.112.112.112'], ipv6: ['2620:fe::fe', '2620:fe::9'], doh: 'https://dns.quad9.net/dns-query', dot: 'tls://dns.quad9.net' }, tags: ['security'], dnssec: true },
  { id: 'opendns', name: 'OpenDNS', country: 'US', homepage: 'https://www.opendns.com/', endpoints: { ipv4: ['208.67.222.222', '208.67.220.220'], ipv6: ['2620:119:35::35', '2620:119:53::53'], doh: 'https://doh.opendns.com/dns-query', dot: 'tls://dns.opendns.com' }, tags: ['filtering'], dnssec: true },
  { id: 'controld', name: 'Control D', country: 'CA', homepage: 'https://controld.com/free-dns', endpoints: { ipv4: ['76.76.2.0', '76.76.10.0'], ipv6: ['2606:1a40::', '2606:1a40:1::'], doh: 'https://freedns.controld.com/p0', dot: 'tls://p0.freedns.controld.com' }, tags: ['filtering'], dnssec: true },
  { id: 'adguard', name: 'AdGuard DNS', country: 'CY', homepage: 'https://adguard-dns.io/', endpoints: { ipv4: ['94.140.14.14', '94.140.15.15'], ipv6: ['2a10:50c0::ad1:ff', '2a10:50c0::ad2:ff'], doh: 'https://dns.adguard-dns.com/dns-query', dot: 'tls://dns.adguard-dns.com' }, tags: ['privacy', 'filtering'], dnssec: true },
  { id: 'nextdns', name: 'NextDNS', country: 'US', homepage: 'https://nextdns.io/', endpoints: { ipv4: ['45.90.28.0', '45.90.30.0'], ipv6: ['2a07:a8c0::', '2a07:a8c1::'], doh: 'https://dns.nextdns.io', dot: 'tls://dns.nextdns.io' }, tags: ['privacy', 'configurable'], dnssec: true },
  { id: 'cleanbrowsing', name: 'CleanBrowsing', country: 'US', homepage: 'https://cleanbrowsing.org/', endpoints: { ipv4: ['185.228.168.9', '185.228.169.9'], ipv6: ['2a0d:2a00:1::2', '2a0d:2a00:2::2'], doh: 'https://doh.cleanbrowsing.org/doh/security-filter/', dot: 'tls://security-filter-dns.cleanbrowsing.org' }, tags: ['security', 'filtering'], dnssec: true },
];
export const createBuiltinProviders = (configs: Record<string, Partial<ProviderConfig>> = {}, resolvers?: DnsResolver[]): DnsProvider[] => BUILTIN_PROVIDER_METADATA.map((metadata) => new StaticDnsProvider(metadata, { ...DEFAULT_CONFIG, ...configs[metadata.id] }, resolvers)).filter((p) => p.config.enabled);
