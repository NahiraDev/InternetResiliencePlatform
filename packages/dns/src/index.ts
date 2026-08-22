import { Resolver } from 'node:dns/promises';
import { performance } from 'node:perf_hooks';
import { EventEmitter } from 'node:events';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https';

export interface Phase15ConnectivitySource {
  id: string;
  providerId?: string;
  type?: string;
  state?: string;
  health?: { score?: number };
}
export interface Phase15NetworkPath {
  id: string;
  type?: string;
  capabilities?: string[];
  score?: number;
  state?: string;
  metadata?: Record<string, unknown>;
}
export interface Phase15EventBus {
  publish(event: {
    id: string;
    type: string;
    aggregateId: string;
    occurredAt: Date;
    payload: Record<string, unknown>;
  }): Promise<void>;
}
export interface Phase15MetricsRegistry {
  record(name: string, value: number, labels?: Record<string, string>): void;
}
export interface Phase15RoutingEngine {
  simulateRouting(context: {
    destination: { kind: 'hostname' | 'ip'; value: string };
  }): Promise<{ selected?: { path: Phase15NetworkPath } }>;
}
export interface Phase15KernelRuntime {
  id: string;
  state?: string;
}
export interface Phase15Principal {
  id: string;
  capabilities?: string[];
}
const createId = (prefix = 'irp'): string => `${prefix}_${crypto.randomUUID()}`;
const phase15Destination = (value: string): { kind: 'hostname' | 'ip'; value: string } => ({
  kind: /^[0-9a-f:.]+$/i.test(value) ? 'ip' : 'hostname',
  value,
});

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS';
export type ResolverProtocol = 'udp' | 'tcp' | 'doh' | 'dot' | 'dnscrypt' | 'odoh' | 'doq';

export interface DnsQuestion {
  name: string;
  recordType: DnsRecordType;
  protocol?: 'udp' | 'tcp' | 'doh' | 'dot';
  interfaceName?: string;
}

export interface DnsAnswer {
  name: string;
  recordType: DnsRecordType;
  ttl: number;
  value: string;
  dnssecValidated?: boolean;
}

export interface ResolveOptions {
  timeoutMs?: number;
  protocol?: ResolverProtocol;
}

export interface ProviderMetadata {
  id: string;
  name: string;
  country?: string;
  homepage: string;
  endpoints: { ipv4: string[]; ipv6: string[]; doh?: string; dot?: string };
  tags: string[];
}

export interface ProviderHealth {
  healthy: boolean;
  latencyMs: number;
  checkedAt: string;
  reason?: string;
}

export interface ProviderConfig {
  enabled: boolean;
  timeoutMs: number;
  protocols: ResolverProtocol[];
  bootstrapServers?: string[];
}

export interface DnsResolver {
  protocol: ResolverProtocol;
  resolve(
    question: DnsQuestion,
    provider?: DnsProvider,
    options?: ResolveOptions,
  ): Promise<DnsAnswer[]>;
}

export interface DnsProvider {
  id: string;
  name: string;
  config: ProviderConfig;
  addresses?: string[];
  privacyScore?: number;
  securityScore?: number;
  resolve(question: DnsQuestion, options?: ResolveOptions): Promise<DnsAnswer[]>;
  resolveIPv4(name: string, options?: ResolveOptions): Promise<string[]>;
  resolveIPv6(name: string, options?: ResolveOptions): Promise<string[]>;
  supportsDNSSEC(): boolean;
  supportsDoH(): boolean;
  supportsDoT(): boolean;
  metadata(): ProviderMetadata;
  health(): Promise<ProviderHealth>;
}

export interface DnsHealthCheck {
  check(provider: DnsProvider): Promise<ProviderHealth>;
}

export interface DnsHealthSample {
  providerId: string;
  healthy: boolean;
  latencyMs: number;
  packetLoss: number;
  timestamp: number;
  dnssecValid?: boolean;
  reason?: string;
}

export interface BenchmarkSample {
  providerId: string;
  latencyMs: number;
  success: boolean;
  timedOut: boolean;
  error?: string;
  timestamp: string;
}

export interface DnsBenchmark {
  run(providers: DnsProvider[], question: DnsQuestion): Promise<BenchmarkSample[]>;
}

export type DecisionStrategy =
  | 'lowest-latency'
  | 'highest-availability'
  | 'lowest-packet-loss'
  | 'balanced'
  | 'privacy-first'
  | 'security-first'
  | 'custom';

export interface ProviderWeights {
  latency: number;
  availability: number;
  packetLoss: number;
  privacy: number;
  security: number;
  stability: number;
  prediction: number;
}

export interface FailoverConfig {
  failureThreshold: number;
  recoveryThreshold: number;
  cooldownMs: number;
  failback?: 'automatic' | 'manual' | 'disabled';
  redundantGroups?: string[][];
}

export interface DnsEngineConfig {
  strategy: DecisionStrategy;
  weights: ProviderWeights;
  failover: FailoverConfig;
  minSwitchScoreDelta: number;
  historyLimit: number;
  dnssec: { enabled: boolean; requireValidation: boolean };
}

export interface ProviderScore {
  provider: DnsProvider;
  score: number;
  rank: number;
  reasons: string[];
  prediction: HealthPrediction;
}

export interface HealthPrediction {
  expectedLatencyMs: number;
  degradationScore: number;
  failureProbability: number;
  stabilityTrend: 'improving' | 'stable' | 'degrading';
}

export interface DnsEngineEvent {
  type: string;
  providerId?: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface DnsRule {
  id: string;
  priority: number;
  match: 'domain' | 'wildcard' | 'suffix' | 'regex' | 'tld' | 'ip-range' | 'cidr';
  value: string;
  action: 'force-provider' | 'block' | 'bypass' | 'prefer-provider' | 'fallback-provider';
  provider?: string;
}

export interface RoutingProfile {
  id: string;
  name: string;
  preferredProviders: string[];
  timeoutMs: number;
  retryPolicy: { attempts: number; backoffMs: number };
  benchmarkFrequencyMs: number;
  protocols: ResolverProtocol[];
}

const txtToAnswers = (question: DnsQuestion, values: string[][]): DnsAnswer[] =>
  values.map((v) => ({ ...question, ttl: 60, value: v.join('') }));

const valuesToAnswers = (question: DnsQuestion, values: string[]): DnsAnswer[] =>
  values.map((value) => ({ ...question, ttl: 60, value }));

export class NodeDnsResolver implements DnsResolver {
  constructor(public readonly protocol: ResolverProtocol = 'udp') {}

  async resolve(
    question: DnsQuestion,
    provider?: DnsProvider,
    _options?: ResolveOptions,
  ): Promise<DnsAnswer[]> {
    if (!['udp', 'tcp', 'doh', 'dot'].includes(this.protocol)) {
      throw new Error(`Protocol ${this.protocol} is registered for future support`);
    }
    const resolver = new Resolver();
    if (provider) {
      const endpoints = provider.metadata().endpoints;
      resolver.setServers([...endpoints.ipv4, ...endpoints.ipv6.map((ip) => `[${ip}]`)]);
    }
    switch (question.recordType) {
      case 'A':
        return valuesToAnswers(question, await resolver.resolve4(question.name));
      case 'AAAA':
        return valuesToAnswers(question, await resolver.resolve6(question.name));
      case 'TXT':
        return txtToAnswers(question, await resolver.resolveTxt(question.name));
      default:
        return valuesToAnswers(question, [question.name]);
    }
  }
}

const DEFAULT_CONFIG: ProviderConfig = {
  enabled: true,
  timeoutMs: 2_000,
  protocols: ['udp', 'tcp', 'doh', 'dot'],
};

export class StaticDnsProvider implements DnsProvider {
  constructor(
    private readonly details: ProviderMetadata & { dnssec: boolean },
    public readonly config: ProviderConfig = DEFAULT_CONFIG,
    private readonly resolvers: DnsResolver[] = [new NodeDnsResolver('udp')],
  ) {}

  get id(): string {
    return this.details.id;
  }

  get name(): string {
    return this.details.name;
  }

  async resolve(question: DnsQuestion, options: ResolveOptions = {}): Promise<DnsAnswer[]> {
    const resolver =
      this.resolvers.find((r) => r.protocol === (options.protocol ?? this.config.protocols[0])) ??
      this.resolvers[0];
    if (!resolver) throw new Error(`No resolver configured for ${this.id}`);
    return resolver.resolve(question, this, options);
  }

  async resolveIPv4(name: string, options?: ResolveOptions): Promise<string[]> {
    return (await this.resolve({ name, recordType: 'A' }, options)).map((a) => a.value);
  }

  async resolveIPv6(name: string, options?: ResolveOptions): Promise<string[]> {
    return (await this.resolve({ name, recordType: 'AAAA' }, options)).map((a) => a.value);
  }

  async health(): Promise<ProviderHealth> {
    try {
      const latencyMs = await this.latency();
      return { healthy: true, latencyMs, checkedAt: new Date().toISOString() };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: this.config.timeoutMs,
        checkedAt: new Date().toISOString(),
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async latency(): Promise<number> {
    const start = performance.now();
    await this.resolveIPv4('example.com', { timeoutMs: this.config.timeoutMs });
    return performance.now() - start;
  }

  supportsDNSSEC(): boolean {
    return this.details.dnssec;
  }

  supportsDoH(): boolean {
    return Boolean(this.details.endpoints.doh);
  }

  supportsDoT(): boolean {
    return Boolean(this.details.endpoints.dot);
  }

  metadata(): ProviderMetadata {
    return {
      id: this.details.id,
      name: this.details.name,
      ...(this.details.country ? { country: this.details.country } : {}),
      homepage: this.details.homepage,
      endpoints: this.details.endpoints,
      tags: this.details.tags,
    };
  }
}

export const BUILTIN_PROVIDER_METADATA: Array<ProviderMetadata & { dnssec: boolean }> = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    country: 'US',
    homepage: 'https://developers.cloudflare.com/1.1.1.1/',
    endpoints: {
      ipv4: ['1.1.1.1', '1.0.0.1'],
      ipv6: ['2606:4700:4700::1111', '2606:4700:4700::1001'],
      doh: 'https://dns.cloudflare.com/dns-query',
      dot: 'one.one.one.one',
    },
    tags: ['fast', 'secure'],
    dnssec: true,
  },
  {
    id: 'google',
    name: 'Google Public DNS',
    country: 'US',
    homepage: 'https://developers.google.com/speed/public-dns',
    endpoints: {
      ipv4: ['8.8.8.8', '8.8.4.4'],
      ipv6: ['2001:4860:4860::8888', '2001:4860:4860::8844'],
      doh: 'https://dns.google/dns-query',
      dot: 'dns.google',
    },
    tags: ['fast', 'reliable'],
    dnssec: true,
  },
  {
    id: 'quad9',
    name: 'Quad9',
    country: 'CH',
    homepage: 'https://quad9.net/',
    endpoints: {
      ipv4: ['9.9.9.9', '149.112.112.112'],
      ipv6: ['2620:fe::fe', '2620:fe::9'],
      doh: 'https://dns.quad9.net/dns-query',
      dot: 'dns.quad9.net',
    },
    tags: ['security', 'privacy'],
    dnssec: true,
  },
  {
    id: 'opendns',
    name: 'OpenDNS',
    country: 'US',
    homepage: 'https://www.opendns.com/',
    endpoints: {
      ipv4: ['208.67.222.222', '208.67.220.220'],
      ipv6: ['2620:119:35::35', '2620:119:53::53'],
      doh: 'https://doh.opendns.com/dns-query',
      dot: 'dns.opendns.com',
    },
    tags: ['family-safe'],
    dnssec: true,
  },
  {
    id: 'controld',
    name: 'Control D',
    country: 'CA',
    homepage: 'https://controld.com/free-dns',
    endpoints: {
      ipv4: ['76.76.2.0', '76.76.10.0'],
      ipv6: ['2606:1a40::', '2606:1a40:1::'],
      doh: 'https://freedns.controld.com/p0',
      dot: 'p0.freedns.controld.com',
    },
    tags: ['privacy'],
    dnssec: true,
  },
  {
    id: 'adguard',
    name: 'AdGuard DNS',
    country: 'CY',
    homepage: 'https://adguard-dns.io/',
    endpoints: {
      ipv4: ['94.140.14.14', '94.140.15.15'],
      ipv6: ['2a10:50c0::ad1:ff', '2a10:50c0::ad2:ff'],
      doh: 'https://dns.adguard-dns.com/dns-query',
      dot: 'dns.adguard-dns.com',
    },
    tags: ['ad-blocking', 'security'],
    dnssec: true,
  },
  {
    id: 'nextdns',
    name: 'NextDNS',
    country: 'US',
    homepage: 'https://nextdns.io/',
    endpoints: {
      ipv4: ['45.90.28.0', '45.90.30.0'],
      ipv6: ['2a07:a8c0::', '2a07:a8c1::'],
      doh: 'https://dns.nextdns.io',
      dot: 'dns.nextdns.io',
    },
    tags: ['privacy', 'customizable'],
    dnssec: true,
  },
  {
    id: 'cleanbrowsing',
    name: 'CleanBrowsing',
    country: 'US',
    homepage: 'https://cleanbrowsing.org/',
    endpoints: {
      ipv4: ['185.228.168.9', '185.228.169.9'],
      ipv6: ['2a0d:2a00:1::2', '2a0d:2a00:2::2'],
      doh: 'https://doh.cleanbrowsing.org/doh/family-filter/',
      dot: 'family-filter-dns.cleanbrowsing.org',
    },
    tags: ['family-safe', 'blocking'],
    dnssec: true,
  },
];

export const createBuiltinProviders = (
  configs: Record<string, Partial<ProviderConfig>> = {},
  resolvers?: DnsResolver[],
): DnsProvider[] =>
  BUILTIN_PROVIDER_METADATA.map(
    (metadata) =>
      new StaticDnsProvider(metadata, { ...DEFAULT_CONFIG, ...configs[metadata.id] }, resolvers),
  ).filter((p) => p.config.enabled);

export const defaultDnsEngineConfig = (): DnsEngineConfig => ({
  strategy: 'balanced',
  weights: {
    latency: 0.25,
    availability: 0.25,
    packetLoss: 0.2,
    privacy: 0.1,
    security: 0.1,
    stability: 0.05,
    prediction: 0.0,
  },
  failover: { failureThreshold: 2, recoveryThreshold: 2, cooldownMs: 30000, failback: 'automatic' },
  minSwitchScoreDelta: 0.1,
  historyLimit: 100,
  dnssec: { enabled: true, requireValidation: false },
});

export class InMemoryDnsCache {
  private readonly entries = new Map<
    string,
    { answers: DnsAnswer[]; expiresAt: number; hits: number }
  >();
  private misses = 0;

  get(question: DnsQuestion): DnsAnswer[] | undefined {
    const key = `${question.name}:${question.recordType}`;
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt < Date.now()) return undefined;
    entry.hits++;
    return entry.answers;
  }

  set(question: DnsQuestion, answers: DnsAnswer[], ttlMs: number): void {
    const key = `${question.name}:${question.recordType}`;
    this.entries.set(key, { answers, expiresAt: Date.now() + ttlMs, hits: 0 });
  }

  stats(): { size: number; hitRatio: number } {
    const total =
      Array.from(this.entries.values()).reduce((sum, e) => sum + e.hits, 0) + this.misses;
    return { size: this.entries.size, hitRatio: total ? (total - this.misses) / total : 0 };
  }

  clear(): void {
    this.entries.clear();
    this.misses = 0;
  }
}

export class RuleEngine {
  constructor(private readonly rules: DnsRule[] = []) {}

  evaluate(question: DnsQuestion): DnsRule | undefined {
    return [...this.rules]
      .sort((a, b) => b.priority - a.priority)
      .find((rule) => {
        switch (rule.match) {
          case 'domain':
            return question.name === rule.value;
          case 'suffix':
            return question.name.endsWith(rule.value);
          case 'wildcard':
            return new RegExp(`^${rule.value.replace(/\*/g, '.*')}$`).test(question.name);
          case 'regex':
            return new RegExp(rule.value).test(question.name);
          default:
            return false;
        }
      });
  }
}

export const builtInProfiles: RoutingProfile[] = [
  {
    id: 'streaming',
    name: 'Streaming',
    preferredProviders: [],
    timeoutMs: 1200,
    retryPolicy: { attempts: 2, backoffMs: 50 },
    benchmarkFrequencyMs: 60_000,
    protocols: ['udp', 'doh'],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    preferredProviders: [],
    timeoutMs: 500,
    retryPolicy: { attempts: 1, backoffMs: 20 },
    benchmarkFrequencyMs: 30_000,
    protocols: ['udp'],
  },
  {
    id: 'development',
    name: 'Development',
    preferredProviders: [],
    timeoutMs: 2000,
    retryPolicy: { attempts: 2, backoffMs: 100 },
    benchmarkFrequencyMs: 120_000,
    protocols: ['udp', 'tcp', 'doh'],
  },
  {
    id: 'privacy',
    name: 'Privacy',
    preferredProviders: [],
    timeoutMs: 1500,
    retryPolicy: { attempts: 2, backoffMs: 75 },
    benchmarkFrequencyMs: 90_000,
    protocols: ['doh', 'dot'],
  },
  {
    id: 'security',
    name: 'Security',
    preferredProviders: [],
    timeoutMs: 1500,
    retryPolicy: { attempts: 2, backoffMs: 75 },
    benchmarkFrequencyMs: 90_000,
    protocols: ['doh', 'dot'],
  },
  {
    id: 'corporate',
    name: 'Corporate',
    preferredProviders: [],
    timeoutMs: 2500,
    retryPolicy: { attempts: 3, backoffMs: 200 },
    benchmarkFrequencyMs: 300_000,
    protocols: ['udp', 'tcp'],
  },
];

const avg = (values: number[]): number =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

export class IntelligentDnsEngine extends EventEmitter {
  private activeProviderId: string | undefined;
  private lastSwitchAt = 0;
  private readonly history = new Map<string, DnsHealthSample[]>();
  public readonly cache = new InMemoryDnsCache();

  constructor(
    private readonly providers: DnsProvider[],
    private readonly healthCheck: DnsHealthCheck,
    private readonly config = defaultDnsEngineConfig(),
    private readonly rules: DnsRule[] = [],
    public readonly ruleEngine = new RuleEngine(rules),
  ) {
    super();
  }

  status(): {
    activeProviderId: string | undefined;
    strategy: DecisionStrategy;
    providers: ProviderScore[];
    cache: { size: number; hitRatio: number };
  } {
    return {
      activeProviderId: this.activeProviderId,
      strategy: this.config.strategy,
      providers: this.rankProviders(),
      cache: this.cache.stats(),
    };
  }

  async evaluate(): Promise<ProviderScore[]> {
    for (const provider of this.providers) {
      await this.recordHealth(provider);
    }
    const ranked = this.rankProviders();
    const best = ranked[0];
    if (best) {
      this.maybeSwitch(best);
    }
    return ranked;
  }

  async resolve(question: DnsQuestion): Promise<DnsAnswer[]> {
    const rule = this.ruleEngine.evaluate(question);
    if (rule?.action === 'block') throw new Error(`blocked`);

    const cached = this.cache.get(question);
    if (cached) return cached;

    const provider = this.activeProviderId
      ? this.providers.find((p) => p.id === this.activeProviderId)
      : this.providers[0];
    if (!provider) throw new Error('No providers available');

    const answers = await provider.resolve(question);
    this.cache.set(question, answers, 300000);
    return answers;
  }

  selectProvider(providerId: string): void {
    const provider = this.providers.find((candidate) => candidate.id === providerId);
    if (!provider) throw new Error(`Unknown provider ${providerId}`);
    this.activeProviderId = providerId;
  }

  private async recordHealth(provider: DnsProvider): Promise<void> {
    const result = await this.healthCheck.check(provider);
    const sample: DnsHealthSample = {
      providerId: provider.id,
      healthy: result.healthy,
      latencyMs: result.latencyMs,
      packetLoss: 0,
      timestamp: Date.now(),
    };
    const history = this.history.get(provider.id) ?? [];
    history.push(sample);
    if (history.length > this.config.historyLimit) history.shift();
    this.history.set(provider.id, history);
  }

  rankProviders(): ProviderScore[] {
    return this.providers
      .map((provider) => this.score(provider))
      .sort((a, b) => b.score - a.score)
      .map((score, index) => ({ ...score, rank: index + 1 }));
  }

  private score(provider: DnsProvider): ProviderScore {
    const samples = this.history.get(provider.id) ?? [];
    const recent = samples.slice(-20);
    const availability = recent.length ? recent.filter((s) => s.healthy).length / recent.length : 0;
    const avgLatency = avg(recent.map((s) => s.latencyMs));
    const weights = this.strategyWeights();
    const score =
      (1 - avgLatency / this.config.failover.cooldownMs) * weights.latency +
      availability * weights.availability +
      (provider.privacyScore ?? 0.5) * weights.privacy +
      (provider.securityScore ?? 0.5) * weights.security;

    return {
      provider,
      score,
      rank: 0,
      reasons: [
        `availability: ${(availability * 100).toFixed(1)}%`,
        `latency: ${avgLatency.toFixed(1)}ms`,
      ],
      prediction: this.predict(provider.id),
    };
  }

  private strategyWeights(): ProviderWeights {
    const base = this.config.weights;
    if (this.config.strategy === 'lowest-latency') return { ...base, latency: 0.7 };
    if (this.config.strategy === 'highest-availability') return { ...base, availability: 0.7 };
    if (this.config.strategy === 'privacy-first') return { ...base, privacy: 0.6 };
    if (this.config.strategy === 'security-first') return { ...base, security: 0.6 };
    return base;
  }

  private predict(providerId: string): HealthPrediction {
    const samples = this.history.get(providerId) ?? [];
    const oldAvg = avg(samples.slice(-20, -10).map((s) => s.latencyMs));
    const newAvg = avg(samples.slice(-10).map((s) => s.latencyMs));
    const degradation = newAvg > oldAvg ? (newAvg - oldAvg) / oldAvg : 0;
    return {
      expectedLatencyMs: newAvg,
      degradationScore: degradation,
      failureProbability: 1 - samples.filter((s) => s.healthy).length / (samples.length || 1),
      stabilityTrend: degradation > 0.1 ? 'degrading' : degradation < -0.1 ? 'improving' : 'stable',
    };
  }

  private maybeSwitch(best: ProviderScore): void {
    if (best.provider.id === this.activeProviderId) return;
    const current = this.rankProviders().find(
      (ranked) => ranked.provider.id === this.activeProviderId,
    );
    if (current && best.score - current.score < this.config.minSwitchScoreDelta) return;
    if (Date.now() - this.lastSwitchAt < this.config.failover.cooldownMs) return;
    this.activeProviderId = best.provider.id;
    this.lastSwitchAt = Date.now();
    this.recordEvent('provider-switched', best.provider.id, `Switched to ${best.provider.name}`);
  }

  private recordEvent(type: string, providerId: string | undefined, message: string): void {
    this.emit(type, { type, providerId, message, timestamp: new Date().toISOString() });
  }
}

// Phase 14 — Smart DNS Engine & Resolver Intelligence Layer
export type DnsResolverType =
  'system' | 'local' | 'gateway' | 'public' | 'private' | 'custom' | 'plugin';
export type DnsTransportType = ResolverProtocol | 'system' | 'local-stub' | 'dnscrypt' | 'custom';
export type DnsResolverFamily = 'ipv4' | 'ipv6' | 'dual';
export type DnsResolverCapability =
  | 'ipv4'
  | 'ipv6'
  | 'udp'
  | 'tcp'
  | 'dnssec'
  | 'edns'
  | 'dot'
  | 'doh'
  | 'doq'
  | 'dns64'
  | 'large-response'
  | 'custom-record-types'
  | string;
export type DnsResolverState =
  | 'unknown'
  | 'discovered'
  | 'available'
  | 'healthy'
  | 'degraded'
  | 'failed'
  | 'recovering'
  | 'cooldown'
  | 'disabled';
export type DnsQueryType = DnsRecordType | 'SOA' | 'SRV' | 'PTR' | 'CAA' | string;
export type DnsQueryClass = 'IN' | 'CH' | 'HS' | string;
export type DnsResultState =
  | 'success'
  | 'nxdomain'
  | 'no-data'
  | 'timeout'
  | 'servfail'
  | 'refused'
  | 'network-error'
  | 'transport-error'
  | 'validation-failed'
  | 'resolver-unavailable'
  | 'cancelled';
export type DnssecValidation =
  'supported' | 'validated' | 'insecure' | 'bogus' | 'unavailable' | 'not-checked';
export type DnsAnomalyState =
  'normal' | 'inconsistent' | 'suspicious' | 'validation-failed' | 'captive-portal-suspected';
export type DnsCacheDisposition = 'hit' | 'miss' | 'bypass' | 'stored' | 'expired';

export interface ResolverHealthStats {
  score: number;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs?: number;
  recentLatencyMs?: number;
  reliability: number;
  timeoutRate: number;
  successRate: number;
  servfailRate: number;
  nxdomainRate: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  servfailCount: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailure?: string;
  lastSuccess?: string;
  lastSelected?: string;
  checkedAt: string;
}

export interface SmartDnsResolver {
  id: string;
  name: string;
  type: DnsResolverType;
  address?: string;
  addresses: string[];
  transport: DnsTransportType;
  family: DnsResolverFamily;
  capabilities: DnsResolverCapability[];
  priority: number;
  health: ResolverHealthStats;
  state: DnsResolverState;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface DnsQuery {
  id: string;
  name: string;
  type: DnsQueryType;
  class: DnsQueryClass;
  transport?: DnsTransportType;
  timeoutMs: number;
  resolverTimeoutMs: number;
  overallTimeoutMs: number;
  policyContext?: Record<string, unknown>;
  source?: { providerId?: string; resourceId?: string; networkId?: string };
  metadata: Record<string, unknown>;
}
export interface DnsResourceRecord {
  name: string;
  type: DnsQueryType;
  class: DnsQueryClass;
  ttl: number;
  value: string;
  metadata?: Record<string, unknown>;
}
export interface DnsResponseValidation {
  valid: boolean;
  dnssec: DnssecValidation;
  anomaly: DnsAnomalyState;
  reasons: string[];
}
export interface DnsResponse {
  queryId: string;
  answers: DnsResourceRecord[];
  authority: DnsResourceRecord[];
  additional: DnsResourceRecord[];
  rcode: DnsResultState;
  flags: Record<string, boolean>;
  ttl: number;
  resolverId: string;
  transport: DnsTransportType;
  latencyMs: number;
  validation: DnsResponseValidation;
  metadata: Record<string, unknown>;
}
export interface DnsResolutionResult {
  state: DnsResultState;
  response?: DnsResponse;
  decision: DnsDecision;
  attempts: DnsAttempt[];
  cached: boolean;
  error?: string;
}
export interface DnsAttempt {
  resolverId: string;
  transport: DnsTransportType;
  state: DnsResultState;
  latencyMs: number;
  retryable: boolean;
  reason?: string;
}
export interface DnsPolicyDecision {
  allowed: boolean;
  reason?: string;
  requiredResolverId?: string;
  preferredResolverId?: string;
  prohibitedResolverIds?: string[];
  requiredCapabilities?: DnsResolverCapability[];
  preferredTransport?: DnsTransportType;
  disabledTransports?: DnsTransportType[];
  scoreAdjustment?: Record<string, number>;
  flushCache?: boolean;
}
export interface DnsPolicyProvider {
  evaluate(
    query: DnsQuery,
    resolver: SmartDnsResolver,
  ): Promise<DnsPolicyDecision> | DnsPolicyDecision;
}
export interface DnsScoreFactor {
  id: string;
  weight: number;
  score(resolver: SmartDnsResolver, context: DnsDecisionContext): number;
  explain?(resolver: SmartDnsResolver, value: number): string;
}
export interface DnsTransport {
  id: string;
  type: DnsTransportType;
  supports(query: DnsQuery, resolver: SmartDnsResolver): boolean;
  resolve(
    query: DnsQuery,
    resolver: SmartDnsResolver,
    context: DnsDecisionContext,
  ): Promise<DnsResponse>;
}
export interface DnsPluginExtension {
  resolvers?: SmartDnsResolver[];
  transports?: DnsTransport[];
  scoringFactors?: DnsScoreFactor[];
  policyProviders?: DnsPolicyProvider[];
  validators?: Array<(response: DnsResponse, query: DnsQuery) => DnsResponseValidation>;
}
export interface ManualDnsOverride {
  mode:
    | 'prefer-resolver'
    | 'require-resolver'
    | 'disable-resolver'
    | 'prefer-transport'
    | 'disable-transport'
    | 'flush-cache'
    | 'clear';
  target?: string;
  reason?: string;
}
export interface DnsDecisionContext {
  query: DnsQuery;
  resolvers?: SmartDnsResolver[];
  networkState?: Record<string, unknown>;
  connectivitySources?: unknown[];
  routingDecision?: unknown;
  manualOverride?: ManualDnsOverride;
  metadata?: Record<string, unknown>;
}
export interface DnsCandidate {
  resolver: SmartDnsResolver;
  eligible: boolean;
  rejectedReason?: string;
  score: number;
  scoreComponents: Record<string, number>;
  explanation: string[];
  policy: DnsPolicyDecision[];
}
export interface DnsDecision {
  query: DnsQuery;
  candidates: DnsCandidate[];
  rejectedCandidates: DnsCandidate[];
  selectedResolver?: SmartDnsResolver;
  selectedTransport?: DnsTransportType;
  selectedPath?: unknown;
  policy: DnsPolicyDecision[];
  reason: string;
  cache: { key: string; disposition: DnsCacheDisposition };
  executionPlan: {
    fallbackOrder: string[];
    maxAttempts: number;
    timeoutMs: number;
    simulation: boolean;
  };
  explanation: Record<string, unknown>;
}
export interface DnsEnginePhase14Config {
  minimumHealthScore: number;
  cooldownMs: number;
  hysteresis: number;
  maxCacheEntries: number;
  maxTtlMs: number;
  minTtlMs: number;
  negativeTtlMs: number;
  retryCount: number;
  retryDelayMs: number;
  queryTimeoutMs: number;
  resolverTimeoutMs: number;
  overallTimeoutMs: number;
  transportPreference: DnsTransportType[];
  ipvPreference: DnsResolverFamily;
  consistencyCheck: boolean;
  anomalyDetection: boolean;
  privacyLogQueries: boolean;
}
export const defaultSmartDnsConfig = (): DnsEnginePhase14Config => ({
  minimumHealthScore: 40,
  cooldownMs: 30_000,
  hysteresis: 5,
  maxCacheEntries: 512,
  maxTtlMs: 300_000,
  minTtlMs: 1_000,
  negativeTtlMs: 30_000,
  retryCount: 2,
  retryDelayMs: 10,
  queryTimeoutMs: 2_000,
  resolverTimeoutMs: 2_000,
  overallTimeoutMs: 5_000,
  transportPreference: ['udp', 'tcp', 'system', 'doh', 'dot', 'doq', 'dnscrypt', 'custom'],
  ipvPreference: 'dual',
  consistencyCheck: false,
  anomalyDetection: true,
  privacyLogQueries: false,
});
const nowIso = (): string => new Date().toISOString();
const clamp = (n: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
export const createResolverHealth = (
  p: Partial<ResolverHealthStats> = {},
): ResolverHealthStats => ({
  score: 100,
  status: 'healthy',
  reliability: 1,
  timeoutRate: 0,
  successRate: 1,
  servfailRate: 0,
  nxdomainRate: 0,
  successCount: 0,
  failureCount: 0,
  timeoutCount: 0,
  servfailCount: 0,
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  checkedAt: nowIso(),
  ...p,
});
export const createDnsQuery = (
  input: Partial<DnsQuery> & { name: string; type?: DnsQueryType },
): DnsQuery => ({
  id: input.id ?? `dnsq_${Math.random().toString(36).slice(2)}`,
  name: normalizeDnsName(input.name),
  type: input.type ?? 'A',
  class: input.class ?? 'IN',
  timeoutMs: input.timeoutMs ?? 2_000,
  resolverTimeoutMs: input.resolverTimeoutMs ?? input.timeoutMs ?? 2_000,
  overallTimeoutMs: input.overallTimeoutMs ?? 5_000,
  ...(input.transport ? { transport: input.transport } : {}),
  ...(input.policyContext ? { policyContext: input.policyContext } : {}),
  ...(input.source ? { source: input.source } : {}),
  metadata: input.metadata ?? {},
});
export const normalizeDnsName = (name: string): string => {
  const n = name.trim().toLowerCase().replace(/\.$/, '');
  if (!/^(?=.{1,253}$)([a-z0-9_*-]{1,63}\.)*[a-z0-9_*-]{1,63}$/.test(n))
    throw new Error(`Invalid DNS query name`);
  return n;
};
export const validateResolverDefinition = (r: SmartDnsResolver): void => {
  if (!r.id || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(r.id)) throw new Error('Invalid resolver id');
  if (!r.name) throw new Error('Resolver name required');
  if (!r.enabled && r.state !== 'disabled') return;
  if (!r.addresses.length && !['system', 'local-stub', 'custom'].includes(r.transport))
    throw new Error('Resolver address required');
  if (
    !r.capabilities.includes(r.transport) &&
    !['system', 'local-stub', 'custom'].includes(r.transport)
  )
    throw new Error('Resolver missing transport capability');
};
export class DnsResolverRegistry {
  private readonly resolvers = new Map<string, SmartDnsResolver>();
  register(r: SmartDnsResolver): SmartDnsResolver {
    validateResolverDefinition(r);
    if (this.resolvers.has(r.id)) throw new Error(`Resolver already registered: ${r.id}`);
    this.resolvers.set(r.id, structuredClone(r));
    return this.get(r.id);
  }
  unregister(id: string): void {
    this.resolvers.delete(id);
  }
  get(id: string): SmartDnsResolver {
    const r = this.resolvers.get(id);
    if (!r) throw new Error(`Resolver not registered: ${id}`);
    return structuredClone(r);
  }
  find(id: string): SmartDnsResolver | undefined {
    const r = this.resolvers.get(id);
    return r ? structuredClone(r) : undefined;
  }
  list(): SmartDnsResolver[] {
    return [...this.resolvers.values()].map((r) => structuredClone(r));
  }
  enable(id: string): void {
    this.update(id, { enabled: true, state: 'available' });
  }
  disable(id: string): void {
    this.update(id, { enabled: false, state: 'disabled' });
  }
  update(id: string, patch: Partial<SmartDnsResolver>): SmartDnsResolver {
    const next = {
      ...this.get(id),
      ...patch,
      health: { ...this.get(id).health, ...patch.health },
      metadata: { ...this.get(id).metadata, ...patch.metadata },
    };
    validateResolverDefinition(next);
    this.resolvers.set(id, structuredClone(next));
    return this.get(id);
  }
}
export class DnsCache {
  private readonly entries = new Map<
    string,
    { result: DnsResolutionResult; expiresAt: number; lastAccess: number; negative: boolean }
  >();
  constructor(private readonly config = defaultSmartDnsConfig()) {}
  key(q: DnsQuery, context?: string): string {
    return [q.name, q.type, q.class, context ?? 'default'].join('|');
  }
  get(q: DnsQuery, context?: string): DnsResolutionResult | undefined {
    const key = this.key(q, context);
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    e.lastAccess = Date.now();
    return structuredClone(e.result);
  }
  set(q: DnsQuery, result: DnsResolutionResult, context?: string): void {
    if (!['success', 'nxdomain', 'no-data'].includes(result.state)) return;
    const ttl =
      result.state === 'success'
        ? Math.min(
            this.config.maxTtlMs,
            Math.max(this.config.minTtlMs, (result.response?.ttl ?? 60) * 1000),
          )
        : this.config.negativeTtlMs;
    this.entries.set(this.key(q, context), {
      result: structuredClone(result),
      expiresAt: Date.now() + ttl,
      lastAccess: Date.now(),
      negative: result.state !== 'success',
    });
    this.evict();
  }
  flush(prefix?: string): number {
    const before = this.entries.size;
    for (const k of [...this.entries.keys()])
      if (!prefix || k.startsWith(prefix)) this.entries.delete(k);
    return before - this.entries.size;
  }
  stats(): { size: number; maxEntries: number } {
    return { size: this.entries.size, maxEntries: this.config.maxCacheEntries };
  }
  private evict(): void {
    while (this.entries.size > this.config.maxCacheEntries) {
      const oldest = [...this.entries.entries()].sort(
        (a, b) => a[1].lastAccess - b[1].lastAccess,
      )[0]?.[0];
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }
}
export class SystemDnsTransport implements DnsTransport {
  readonly id = 'system-node-dns';
  readonly type: DnsTransportType = 'system';
  supports(q: DnsQuery): boolean {
    return ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS'].includes(q.type);
  }
  async resolve(query: DnsQuery, resolver: SmartDnsResolver): Promise<DnsResponse> {
    const started = performance.now();
    const provider = new StaticDnsProvider({
      id: resolver.id,
      name: resolver.name,
      homepage: 'system:',
      endpoints: {
        ipv4: resolver.addresses.filter((a) => !a.includes(':')),
        ipv6: resolver.addresses.filter((a) => a.includes(':')),
      },
      tags: [resolver.type],
      dnssec: resolver.capabilities.includes('dnssec'),
    });
    const answers = await provider.resolve(
      { name: query.name, recordType: query.type as DnsRecordType },
      { timeoutMs: query.timeoutMs, protocol: resolver.transport as ResolverProtocol },
    );
    return {
      queryId: query.id,
      answers: answers.map((a) => ({
        name: a.name,
        type: a.recordType,
        class: query.class,
        ttl: a.ttl,
        value: a.value,
      })),
      authority: [],
      additional: [],
      rcode: answers.length ? 'success' : 'no-data',
      flags: {},
      ttl: Math.min(...answers.map((a) => a.ttl), 60),
      resolverId: resolver.id,
      transport: resolver.transport,
      latencyMs: performance.now() - started,
      validation: {
        valid: true,
        dnssec: resolver.capabilities.includes('dnssec') ? 'supported' : 'not-checked',
        anomaly: 'normal',
        reasons: [],
      },
      metadata: {},
    };
  }
}
export const retryableDnsState = (s: DnsResultState): boolean =>
  ['timeout', 'servfail', 'network-error', 'transport-error', 'resolver-unavailable'].includes(s);
export const validateDnsResponse = (
  response: DnsResponse,
  query: DnsQuery,
): DnsResponseValidation => {
  const reasons: string[] = [];
  if (response.queryId !== query.id) reasons.push('query-id-mismatch');
  for (const rr of response.answers) {
    if (rr.type !== query.type && rr.type !== 'CNAME') reasons.push('record-type-mismatch');
    if (rr.ttl < 0 || rr.ttl > 604800) reasons.push('ttl-out-of-range');
    if (!rr.name) reasons.push('record-name-missing');
  }
  return {
    valid: reasons.length === 0,
    dnssec: response.validation.dnssec,
    anomaly: reasons.length ? 'validation-failed' : response.validation.anomaly,
    reasons,
  };
};
export const compareDnsResponses = (
  responses: DnsResponse[],
): {
  state: 'consensus' | 'minority' | 'inconsistent' | 'unknown';
  groups: Record<string, string[]>;
} => {
  if (responses.length < 2) return { state: 'unknown', groups: {} };
  const groups: Record<string, string[]> = {};
  for (const r of responses) {
    const sig =
      r.answers
        .map((a) => `${a.type}:${a.value}`)
        .sort()
        .join(',') || r.rcode;
    (groups[sig] ??= []).push(r.resolverId);
  }
  const sizes = Object.values(groups).map((g) => g.length);
  return {
    state:
      Object.keys(groups).length === 1
        ? 'consensus'
        : Math.max(...sizes) > 1
          ? 'minority'
          : 'inconsistent',
    groups,
  };
};
export const builtinDnsScoreFactors = (): DnsScoreFactor[] => [
  { id: 'health', weight: 0.35, score: (r) => r.health.score },
  { id: 'latency', weight: 0.2, score: (r) => clamp(100 - (r.health.latencyMs ?? 100) / 20) },
  { id: 'reliability', weight: 0.2, score: (r) => clamp(r.health.reliability * 100) },
  { id: 'priority', weight: 0.15, score: (r) => clamp(r.priority) },
  { id: 'timeouts', weight: 0.1, score: (r) => clamp(100 - r.health.timeoutRate * 100) },
];
export class SmartDnsEngine {
  readonly registry = new DnsResolverRegistry();
  readonly cache: DnsCache;
  private readonly transports = new Map<string, DnsTransport>();
  private readonly policies: DnsPolicyProvider[] = [];
  private readonly factors: DnsScoreFactor[] = [];
  private readonly singleFlight = new Map<string, Promise<DnsResolutionResult>>();
  private activeResolverId?: string;
  private manualOverride: ManualDnsOverride | undefined;
  private lastSwitchAt = 0;
  constructor(
    private readonly options: {
      events?: { publish: (event: unknown) => Promise<void> };
      metrics?: { record: (name: string, value: number, labels?: Record<string, string>) => void };
      config?: Partial<DnsEnginePhase14Config>;
    } = {},
  ) {
    this.config = { ...defaultSmartDnsConfig(), ...options.config };
    this.cache = new DnsCache(this.config);
    this.registerTransport(new SystemDnsTransport());
    for (const f of builtinDnsScoreFactors()) this.registerScoreFactor(f);
  }
  readonly config: DnsEnginePhase14Config;
  registerResolver(r: SmartDnsResolver): SmartDnsResolver {
    const out = this.registry.register(r);
    void this.publish('dns.resolver.registered', { resolverId: r.id });
    return out;
  }
  registerTransport(t: DnsTransport): void {
    this.transports.set(t.type, t);
  }
  registerPolicy(p: DnsPolicyProvider): void {
    this.policies.push(p);
  }
  registerScoreFactor(f: DnsScoreFactor): void {
    this.factors.push(f);
  }
  registerExtension(e: DnsPluginExtension): void {
    e.resolvers?.forEach((r) => this.registerResolver(r));
    e.transports?.forEach((t) => this.registerTransport(t));
    e.policyProviders?.forEach((p) => this.registerPolicy(p));
    e.scoringFactors?.forEach((f) => this.registerScoreFactor(f));
  }
  async decide(context: DnsDecisionContext, simulation = false): Promise<DnsDecision> {
    const effectiveContext: DnsDecisionContext = { ...context };
    const selectedOverride = context.manualOverride ?? this.manualOverride;
    if (selectedOverride) effectiveContext.manualOverride = selectedOverride;
    const query = effectiveContext.query;
    const cached = this.cache.get(query);
    const cacheInfo = {
      key: this.cache.key(query),
      disposition: cached ? ('hit' as const) : ('miss' as const),
    };
    const resolvers = effectiveContext.resolvers ?? this.registry.list();
    const candidates = await Promise.all(resolvers.map((r) => this.candidate(r, effectiveContext)));
    const eligible = candidates
      .filter((c) => c.eligible)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.resolver.priority - a.resolver.priority ||
          a.resolver.id.localeCompare(b.resolver.id),
      );
    let selected = eligible[0];
    if (this.activeResolverId) {
      const active = eligible.find((c) => c.resolver.id === this.activeResolverId);
      if (
        active &&
        selected &&
        selected.resolver.id !== active.resolver.id &&
        selected.score - active.score < this.config.hysteresis
      )
        selected = active;
    }
    const decision: DnsDecision = {
      query,
      candidates,
      rejectedCandidates: candidates.filter((c) => !c.eligible),
      policy: candidates.flatMap((c) => c.policy),
      reason: selected
        ? `selected ${selected.resolver.id} by deterministic score`
        : 'no eligible resolver',
      cache: cacheInfo,
      executionPlan: {
        fallbackOrder: eligible.map((c) => c.resolver.id).slice(0, this.config.retryCount + 1),
        maxAttempts: this.config.retryCount + 1,
        timeoutMs: query.overallTimeoutMs,
        simulation,
      },
      explanation: {
        privacy: this.config.privacyLogQueries ? query.name : 'query-name-redacted',
        scores: Object.fromEntries(candidates.map((c) => [c.resolver.id, c.score])),
      },
    };
    if (selected) {
      decision.selectedResolver = selected.resolver;
      decision.selectedTransport = selected.resolver.transport;
    }
    if (effectiveContext.routingDecision !== undefined)
      decision.selectedPath = effectiveContext.routingDecision;
    return decision;
  }
  simulateDnsResolution(context: DnsDecisionContext): Promise<DnsDecision> {
    return this.decide(context, true);
  }
  async resolve(
    input: DnsQuery | (Partial<DnsQuery> & { name: string; type?: DnsQueryType }),
    context: Omit<DnsDecisionContext, 'query'> = {},
  ): Promise<DnsResolutionResult> {
    const query = 'class' in input ? (input as DnsQuery) : createDnsQuery(input);
    const key = this.cache.key(query);
    const cached = this.cache.get(query);
    if (cached) {
      void this.publish('dns.cache.hit', {});
      return { ...cached, cached: true };
    }
    if (this.singleFlight.has(key)) return this.singleFlight.get(key)!;
    const promise = this.execute({ ...context, query });
    this.singleFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.singleFlight.delete(key);
    }
  }
  private async execute(context: DnsDecisionContext): Promise<DnsResolutionResult> {
    const decision = await this.decide(context);
    void this.publish('dns.query.started', {});
    const attempts: DnsAttempt[] = [];
    if (!decision.selectedResolver)
      return {
        state: 'resolver-unavailable',
        decision,
        attempts,
        cached: false,
        error: 'no eligible resolver',
      };
    for (const resolverId of decision.executionPlan.fallbackOrder) {
      const resolver =
        this.registry.find(resolverId) ??
        decision.candidates.find((c) => c.resolver.id === resolverId)?.resolver;
      if (!resolver) continue;
      const transport = this.transports.get(resolver.transport) ?? this.transports.get('system');
      if (!transport?.supports(context.query, resolver)) {
        attempts.push({
          resolverId,
          transport: resolver.transport,
          state: 'transport-error',
          latencyMs: 0,
          retryable: true,
          reason: 'unsupported transport',
        });
        continue;
      }
      try {
        const response = await Promise.race([
          transport.resolve(context.query, resolver, context),
          new Promise<DnsResponse>((_, rej) =>
            setTimeout(() => rej(new Error('timeout')), context.query.resolverTimeoutMs),
          ),
        ]);
        const validation = validateDnsResponse(response, context.query);
        response.validation = validation;
        const state: DnsResultState = validation.valid ? response.rcode : 'validation-failed';
        attempts.push({
          resolverId,
          transport: resolver.transport,
          state,
          latencyMs: response.latencyMs,
          retryable: retryableDnsState(state),
        });
        this.updateHealth(resolverId, state, response.latencyMs);
        if (state === 'success' || state === 'nxdomain' || state === 'no-data') {
          const result = { state, response, decision, attempts, cached: false };
          this.cache.set(context.query, result);
          this.setActiveResolver(resolverId);
          void this.publish('dns.query.completed', { resolverId, state });
          return result;
        }
        if (!retryableDnsState(state)) break;
      } catch (e) {
        const state: DnsResultState =
          e instanceof Error && e.message === 'timeout' ? 'timeout' : 'network-error';
        attempts.push({
          resolverId,
          transport: resolver.transport,
          state,
          latencyMs: context.query.resolverTimeoutMs,
          retryable: true,
          reason: e instanceof Error ? e.message : 'error',
        });
        this.updateHealth(resolverId, state, context.query.resolverTimeoutMs);
        void this.publish(state === 'timeout' ? 'dns.query.timeout' : 'dns.query.failed', {
          resolverId,
          state,
        });
      }
    }
    return {
      state: attempts.at(-1)?.state ?? 'resolver-unavailable',
      decision,
      attempts,
      cached: false,
      error: 'retry exhausted',
    };
  }
  setManualOverride(o: ManualDnsOverride): void {
    if (o.mode === 'flush-cache') this.cache.flush();
    if (o.mode === 'clear') {
      this.manualOverride = undefined;
      return;
    }
    if (
      (o.mode === 'disable-resolver' ||
        o.mode === 'require-resolver' ||
        o.mode === 'prefer-resolver') &&
      o.target &&
      !this.registry.find(o.target)
    )
      throw new Error('unknown override resolver');
    this.manualOverride = o;
    void this.publish('dns.manual-override', { mode: o.mode });
  }
  flushCache(prefix?: string): number {
    const n = this.cache.flush(prefix);
    void this.publish('dns.cache.invalidated', { entries: n });
    return n;
  }
  private async candidate(r: SmartDnsResolver, context: DnsDecisionContext): Promise<DnsCandidate> {
    const policy = await Promise.all(this.policies.map((p) => p.evaluate(context.query, r)));
    const override = context.manualOverride;
    const rejected =
      override?.mode === 'disable-resolver' && override.target === r.id
        ? 'manual-override'
        : override?.mode === 'require-resolver' && override.target !== r.id
          ? 'manual-override'
          : override?.mode === 'disable-transport' && override.target === r.transport
            ? 'manual-override'
            : policy.some((p) => p.prohibitedResolverIds?.includes(r.id))
              ? 'policy-prohibited'
              : policy.some((p) => p.requiredResolverId && p.requiredResolverId !== r.id)
                ? 'policy-required-another-resolver'
                : !r.enabled
                  ? 'disabled'
                  : r.state === 'disabled'
                    ? 'disabled'
                    : r.health.score < this.config.minimumHealthScore
                      ? 'resolver-unhealthy'
                      : context.query.transport && context.query.transport !== r.transport
                        ? 'transport-mismatch'
                        : policy.find((p) => !p.allowed)?.reason;
    const comps = Object.fromEntries(
      this.factors.map((f) => [f.id, clamp(f.score(r, context)) * f.weight]),
    );
    const score = clamp(
      Object.values(comps).reduce((s, v) => s + v, 0) +
        policy.reduce((s, p) => s + (p.scoreAdjustment?.[r.id] ?? 0), 0) +
        (override?.mode === 'prefer-resolver' && override.target === r.id
          ? this.config.hysteresis + 1
          : 0),
    );
    return {
      resolver: r,
      eligible: !rejected,
      ...(rejected ? { rejectedReason: rejected } : {}),
      score,
      scoreComponents: comps,
      explanation: Object.entries(comps).map(([k, v]) => `${k}:${v.toFixed(1)}`),
      policy,
    };
  }
  private setActiveResolver(id: string): void {
    if (this.activeResolverId === id) return;
    if (Date.now() - this.lastSwitchAt < this.config.cooldownMs && this.activeResolverId) return;
    const previous = this.activeResolverId;
    this.activeResolverId = id;
    this.lastSwitchAt = Date.now();
    void this.publish('dns.resolver.changed', { previous, current: id });
  }
  private updateHealth(id: string, state: DnsResultState, latency: number): void {
    const r = this.registry.find(id);
    if (!r) return;
    const h = r.health;
    const ok = state === 'success' || state === 'nxdomain' || state === 'no-data';
    const failureCount = h.failureCount + (ok ? 0 : 1);
    const successCount = h.successCount + (ok ? 1 : 0);
    const timeoutCount = h.timeoutCount + (state === 'timeout' ? 1 : 0);
    const total = Math.max(1, failureCount + successCount);
    const healthPatch: Partial<ResolverHealthStats> = {
      ...h,
      latencyMs: latency,
      recentLatencyMs: latency,
      successCount,
      failureCount,
      timeoutCount,
      servfailCount: h.servfailCount + (state === 'servfail' ? 1 : 0),
      consecutiveFailures: ok ? 0 : h.consecutiveFailures + 1,
      consecutiveSuccesses: ok ? h.consecutiveSuccesses + 1 : 0,
      lastSelected: nowIso(),
      successRate: successCount / total,
      timeoutRate: timeoutCount / total,
      reliability: successCount / total,
      score: clamp(100 * (successCount / total) - 20 * (timeoutCount / total)),
      status: failureCount / total > 0.5 ? 'unhealthy' : failureCount ? 'degraded' : 'healthy',
    };
    if (ok) healthPatch.lastSuccess = nowIso();
    else healthPatch.lastFailure = nowIso();
    const next = createResolverHealth(healthPatch);
    this.registry.update(id, {
      health: next,
      state:
        next.status === 'healthy' ? 'healthy' : next.status === 'degraded' ? 'degraded' : 'failed',
    });
  }
  private async publish(type: string, payload: Record<string, unknown>): Promise<void> {
    this.options.metrics?.record(`${type.replace(/[.-]/g, '_')}_total`, 1);
    await this.options.events?.publish({
      id: `evt_${Date.now()}`,
      type,
      aggregateId: 'dns',
      occurredAt: new Date(),
      payload,
    });
  }
}

export type DnsTransportState =
  | 'unknown'
  | 'available'
  | 'unavailable'
  | 'connecting'
  | 'healthy'
  | 'degraded'
  | 'failed'
  | 'recovering'
  | 'disabled';
export type DnsTransportCapability =
  | 'plaintext'
  | 'encrypted'
  | 'tls'
  | 'https'
  | 'quic'
  | 'certificate-validation'
  | 'hostname-verification'
  | 'connection-reuse'
  | 'wire-format'
  | 'plugin-provided'
  | string;
export type DnsSecurityProfileId = 'strict' | 'secure' | 'balanced' | 'compatibility' | 'custom';
export type DnsTransportErrorCode =
  | 'TransportUnavailable'
  | 'ConnectionTimeout'
  | 'ConnectionRefused'
  | 'TlsHandshakeFailed'
  | 'CertificateValidationFailed'
  | 'HostnameVerificationFailed'
  | 'HttpError'
  | 'HttpTimeout'
  | 'ProtocolError'
  | 'DnsMessageInvalid'
  | 'QuicHandshakeFailed'
  | 'TransportPolicyRejected'
  | 'TransportCancelled'
  | 'ConfigurationInvalid'
  | 'ResponseTooLarge'
  | 'CircuitOpen';
export type DnsTransportFailureKind =
  | 'retryable-transport'
  | 'non-retryable-security'
  | 'resolver'
  | 'policy'
  | 'configuration'
  | 'cancelled';
export type CertificateValidationState =
  | 'valid'
  | 'expired'
  | 'untrusted'
  | 'hostname-mismatch'
  | 'unexpected-chain'
  | 'validation-failed'
  | 'not-applicable';
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export class DnsTransportError extends Error {
  constructor(
    readonly code: DnsTransportErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly failureKind: DnsTransportFailureKind,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = code;
  }
}

export interface DnsWireMessage {
  id: number;
  payload: Buffer;
  recordType?: DnsRecordType | undefined;
}
export interface TransportEndpoint {
  hostname: string;
  port: number;
  path?: string;
  url?: string;
  tlsServerName?: string;
}
export interface TransportConnection {
  id: string;
  key: string;
  transportId: string;
  type: DnsTransportType;
  endpoint: TransportEndpoint;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  state: 'connecting' | 'open' | 'closed';
  raw?: unknown;
}
export interface TransportRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}
export interface TransportPoolConfig {
  maxConnections: number;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
  keepAlive: boolean;
}
export interface TransportCircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxAttempts: number;
}
export interface DnsTransportConfig {
  priority: DnsTransportType[];
  allowedTransports: DnsTransportType[];
  disabledTransports: DnsTransportType[];
  tls: {
    minVersion: 'TLSv1.2' | 'TLSv1.3';
    requireCertificateValidation: true;
    requireHostnameVerification: true;
  };
  timeouts: {
    connectMs: number;
    readMs: number;
    writeMs: number;
    queryMs: number;
    shutdownMs: number;
  };
  retry: TransportRetryConfig;
  pool: TransportPoolConfig;
  circuitBreaker: TransportCircuitBreakerConfig;
  maxResponseBytes: number;
  fallback: { allowPlaintextDowngrade: boolean; enabled: boolean };
}
export interface DnsTransportSecurityProfile {
  id: DnsSecurityProfileId;
  allowedTransports: DnsTransportType[];
  requireEncrypted: boolean;
  requireCertificateValidation: boolean;
  requireHostnameVerification: boolean;
  allowPlaintextFallback: boolean;
  preferredOrder: DnsTransportType[];
}
export interface DnsTransportPolicy {
  requireEncryptedDns?: boolean;
  preferTransports?: DnsTransportType[];
  allowTransports?: DnsTransportType[];
  denyTransports?: DnsTransportType[];
  requireCertificateValidation?: boolean;
  requireResolverId?: string;
  requireTransport?: DnsTransportType;
  denyPlaintextDns?: boolean;
}
export interface DnsTransportContext {
  resolver: DnsProvider;
  networkState?: unknown;
  connectivitySource?: Phase15ConnectivitySource;
  route?: Phase15NetworkPath;
  policy?: DnsTransportPolicy;
  securityProfile?: DnsTransportSecurityProfile;
  timeoutMs?: number;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}
export interface DnsTransportScore {
  security: number;
  latency: number;
  reliability: number;
  availability: number;
  networkCompatibility: number;
  resolverCompatibility: number;
  connectionStability: number;
  historicalPerformance: number;
  policyPreference: number;
  total: number;
}
export interface DnsTransportCandidate {
  transport: SecureDnsTransport;
  endpoint: TransportEndpoint;
  score: DnsTransportScore;
}
export interface RejectedDnsTransportCandidate {
  transportId: string;
  type: DnsTransportType;
  reason: string;
  policyViolation: boolean;
  securityImplication?: string;
}
export interface DnsTransportDecision {
  query: { recordType: DnsRecordType; nameHash: string };
  resolver: { id: string; name: string };
  candidates: DnsTransportCandidate[];
  rejectedCandidates: RejectedDnsTransportCandidate[];
  selectedTransport?: DnsTransportCandidate;
  securityProfile: DnsTransportSecurityProfile;
  policy?: DnsTransportPolicy;
  route?: Phase15NetworkPath;
  reason: string;
  fallbackOrder: DnsTransportCandidate[];
  securityImplications: string[];
  dryRun: boolean;
}
export interface SecureDnsTransport {
  id: string;
  type: DnsTransportType;
  capabilities: DnsTransportCapability[];
  state: DnsTransportState;
  supports(query: DnsWireMessage, resolver: DnsProvider, context: DnsTransportContext): boolean;
  endpoint(resolver: DnsProvider): TransportEndpoint | undefined;
  connect(resolver: DnsProvider, context: DnsTransportContext): Promise<TransportConnection>;
  resolve(
    connection: TransportConnection,
    query: DnsWireMessage,
    context: DnsTransportContext,
  ): Promise<DnsWireMessage>;
  close(connection: TransportConnection): Promise<void>;
}

export const defaultDnsTransportConfig = (): DnsTransportConfig => ({
  priority: ['doh', 'dot', 'doq', 'tcp', 'udp', 'system'],
  allowedTransports: ['system', 'udp', 'tcp', 'dot', 'doh', 'doq', 'dnscrypt', 'custom'],
  disabledTransports: [],
  tls: {
    minVersion: 'TLSv1.2',
    requireCertificateValidation: true,
    requireHostnameVerification: true,
  },
  timeouts: { connectMs: 2000, readMs: 2000, writeMs: 2000, queryMs: 3000, shutdownMs: 1000 },
  retry: { maxAttempts: 2, initialDelayMs: 50, maxDelayMs: 500, jitterRatio: 0.2 },
  pool: { maxConnections: 8, idleTimeoutMs: 30000, maxLifetimeMs: 300000, keepAlive: true },
  circuitBreaker: { failureThreshold: 3, recoveryTimeoutMs: 30000, halfOpenMaxAttempts: 1 },
  maxResponseBytes: 4096,
  fallback: { allowPlaintextDowngrade: false, enabled: true },
});
export const dnsTransportSecurityProfiles: Record<
  Exclude<DnsSecurityProfileId, 'custom'>,
  DnsTransportSecurityProfile
> = {
  strict: {
    id: 'strict',
    allowedTransports: ['doh', 'dot', 'doq'],
    requireEncrypted: true,
    requireCertificateValidation: true,
    requireHostnameVerification: true,
    allowPlaintextFallback: false,
    preferredOrder: ['doh', 'dot', 'doq'],
  },
  secure: {
    id: 'secure',
    allowedTransports: ['doh', 'dot', 'doq'],
    requireEncrypted: true,
    requireCertificateValidation: true,
    requireHostnameVerification: true,
    allowPlaintextFallback: false,
    preferredOrder: ['doh', 'dot', 'doq'],
  },
  balanced: {
    id: 'balanced',
    allowedTransports: ['doh', 'dot', 'doq', 'tcp', 'udp', 'system'],
    requireEncrypted: false,
    requireCertificateValidation: true,
    requireHostnameVerification: true,
    allowPlaintextFallback: false,
    preferredOrder: ['doh', 'dot', 'doq', 'tcp', 'udp', 'system'],
  },
  compatibility: {
    id: 'compatibility',
    allowedTransports: ['doh', 'dot', 'doq', 'tcp', 'udp', 'system'],
    requireEncrypted: false,
    requireCertificateValidation: true,
    requireHostnameVerification: true,
    allowPlaintextFallback: true,
    preferredOrder: ['doh', 'dot', 'tcp', 'udp', 'system', 'doq'],
  },
};

export const encodeDnsQuery = (question: DnsQuestion): DnsWireMessage => {
  const labels = question.name.split('.').filter(Boolean);
  const qname = Buffer.concat(
    labels
      .map((l) => {
        const b = Buffer.from(l);
        if (b.length > 63)
          throw new DnsTransportError(
            'DnsMessageInvalid',
            'DNS label exceeds 63 octets',
            false,
            'configuration',
          );
        return Buffer.concat([Buffer.from([b.length]), b]);
      })
      .concat(Buffer.from([0])),
  );
  const qtype: Record<DnsRecordType, number> = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };
  const id = Math.floor(Math.random() * 65535);
  const head = Buffer.alloc(12);
  head.writeUInt16BE(id, 0);
  head.writeUInt16BE(0x0100, 2);
  head.writeUInt16BE(1, 4);
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(qtype[question.recordType], 0);
  tail.writeUInt16BE(1, 2);
  return { id, payload: Buffer.concat([head, qname, tail]), recordType: question.recordType };
};
export const validateDnsWireResponse = (
  payload: Buffer,
  request?: DnsWireMessage,
  max = 4096,
): DnsWireMessage => {
  if (payload.length < 12)
    throw new DnsTransportError(
      'DnsMessageInvalid',
      'DNS response shorter than header',
      false,
      'resolver',
    );
  if (payload.length > max)
    throw new DnsTransportError(
      'ResponseTooLarge',
      'DNS response exceeds configured limit',
      false,
      'resolver',
      { size: payload.length, max },
    );
  const id = payload.readUInt16BE(0);
  if (request && id !== request.id)
    throw new DnsTransportError(
      'ProtocolError',
      'DNS response id does not match request',
      true,
      'retryable-transport',
    );
  return { id, payload, recordType: request?.recordType };
};
const hashQuery = (q: DnsQuestion | DnsWireMessage): string => {
  const s = 'payload' in q ? q.payload.toString('hex') : `${q.recordType}:${q.name}`;
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16);
};
export const validateDohEndpoint = (url: string): TransportEndpoint => {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new DnsTransportError(
      'ConfigurationInvalid',
      'Invalid DoH endpoint URL',
      false,
      'configuration',
    );
  }
  if (u.protocol !== 'https:')
    throw new DnsTransportError(
      'ConfigurationInvalid',
      'DoH endpoint must use https',
      false,
      'configuration',
      { scheme: u.protocol },
    );
  if (!u.hostname || !u.pathname || u.username || u.password)
    throw new DnsTransportError(
      'ConfigurationInvalid',
      'DoH endpoint requires hostname/path and no credentials',
      false,
      'configuration',
    );
  return {
    hostname: u.hostname,
    port: u.port ? Number(u.port) : 443,
    path: `${u.pathname}${u.search}`,
    url: u.toString(),
    tlsServerName: u.hostname,
  };
};
export const validateDotEndpoint = (host: string): TransportEndpoint => {
  if (!host || host.includes('://'))
    throw new DnsTransportError(
      'ConfigurationInvalid',
      'DoT endpoint must be a hostname, not a URL',
      false,
      'configuration',
    );
  return { hostname: host, port: 853, tlsServerName: host };
};

class TransportConnectionPool {
  private readonly entries = new Map<string, TransportConnection[]>();
  constructor(private readonly config: TransportPoolConfig) {}
  key(
    resolver: DnsProvider,
    transport: SecureDnsTransport,
    endpoint: TransportEndpoint,
    ctx: DnsTransportContext,
  ): string {
    return [
      resolver.id,
      transport.type,
      endpoint.hostname,
      endpoint.port,
      endpoint.tlsServerName ?? '',
      ctx.securityProfile?.id ?? 'balanced',
      ctx.connectivitySource?.id ?? '',
      ctx.route?.id ?? '',
      ctx.metadata?.proxy ?? 'direct',
    ].join('|');
  }
  acquire(key: string): TransportConnection | undefined {
    const now = Date.now();
    const list = (this.entries.get(key) ?? []).filter(
      (c) =>
        c.state === 'open' && c.expiresAt > now && now - c.lastUsedAt <= this.config.idleTimeoutMs,
    );
    this.entries.set(key, list);
    const conn = list.shift();
    if (conn) conn.lastUsedAt = now;
    return conn;
  }
  release(conn: TransportConnection): void {
    if (conn.state !== 'open') return;
    const list = this.entries.get(conn.key) ?? [];
    if (list.length < this.config.maxConnections) this.entries.set(conn.key, [...list, conn]);
  }
  async drain(close: (c: TransportConnection) => Promise<void>): Promise<void> {
    const all = [...this.entries.values()].flat();
    this.entries.clear();
    await Promise.all(all.map(close));
  }
  size(): number {
    return [...this.entries.values()].reduce((s, l) => s + l.length, 0);
  }
}
class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  state: CircuitBreakerState = 'closed';
  constructor(private readonly config: TransportCircuitBreakerConfig) {}
  before(): void {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.config.recoveryTimeoutMs) this.state = 'half-open';
      else
        throw new DnsTransportError(
          'CircuitOpen',
          'Transport circuit is open',
          true,
          'retryable-transport',
        );
    }
  }
  success(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  failure(): boolean {
    this.failures++;
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
      return true;
    }
    return false;
  }
}

abstract class BaseTransport implements SecureDnsTransport {
  state: DnsTransportState = 'available';
  abstract id: string;
  abstract type: DnsTransportType;
  abstract capabilities: DnsTransportCapability[];
  abstract endpoint(resolver: DnsProvider): TransportEndpoint | undefined;
  supports(_q: DnsWireMessage, resolver: DnsProvider, ctx: DnsTransportContext): boolean {
    return Boolean(this.endpoint(resolver)) && !ctx.policy?.denyTransports?.includes(this.type);
  }
  abstract connect(
    resolver: DnsProvider,
    context: DnsTransportContext,
  ): Promise<TransportConnection>;
  abstract resolve(
    connection: TransportConnection,
    query: DnsWireMessage,
    context: DnsTransportContext,
  ): Promise<DnsWireMessage>;
  async close(connection: TransportConnection): Promise<void> {
    connection.state = 'closed';
    const raw = connection.raw;
    if (raw && typeof (raw as { destroy?: () => void }).destroy === 'function')
      (raw as { destroy: () => void }).destroy();
  }
}
export class DnsOverTlsTransport extends BaseTransport {
  id = 'builtin.dot';
  type: DnsTransportType = 'dot';
  capabilities: DnsTransportCapability[] = [
    'encrypted',
    'tls',
    'certificate-validation',
    'hostname-verification',
    'connection-reuse',
    'wire-format',
  ];
  endpoint(resolver: DnsProvider): TransportEndpoint | undefined {
    const dot = resolver.metadata().endpoints.dot;
    return dot ? validateDotEndpoint(dot) : undefined;
  }
  async connect(resolver: DnsProvider, ctx: DnsTransportContext): Promise<TransportConnection> {
    const ep = this.endpoint(resolver);
    if (!ep)
      throw new DnsTransportError(
        'TransportUnavailable',
        'Resolver has no DoT endpoint',
        true,
        'retryable-transport',
      );
    const socket = await new Promise<TLSSocket>((resolve, reject) => {
      const s = tlsConnect(
        {
          host: ep.hostname,
          port: ep.port,
          servername: ep.tlsServerName,
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          timeout: ctx.timeoutMs ?? defaultDnsTransportConfig().timeouts.connectMs,
        },
        () => resolve(s),
      );
      s.once('timeout', () => {
        s.destroy();
        reject(
          new DnsTransportError(
            'ConnectionTimeout',
            'DoT connection timed out',
            true,
            'retryable-transport',
          ),
        );
      });
      s.once('error', (e) =>
        reject(
          new DnsTransportError('TlsHandshakeFailed', e.message, false, 'non-retryable-security'),
        ),
      );
      ctx.signal?.addEventListener(
        'abort',
        () => {
          s.destroy();
          reject(
            new DnsTransportError(
              'TransportCancelled',
              'DoT connection cancelled',
              false,
              'cancelled',
            ),
          );
        },
        { once: true },
      );
    });
    const cert = socket.getPeerCertificate();
    if (!socket.authorized)
      throw new DnsTransportError(
        String(socket.authorizationError) === 'ERR_TLS_CERT_ALTNAME_INVALID'
          ? 'HostnameVerificationFailed'
          : 'CertificateValidationFailed',
        String(socket.authorizationError ?? 'TLS validation failed'),
        false,
        'non-retryable-security',
      );
    return {
      id: createId('dot_conn'),
      key: '',
      transportId: this.id,
      type: this.type,
      endpoint: ep,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      expiresAt: Date.now() + defaultDnsTransportConfig().pool.maxLifetimeMs,
      state: 'open',
      raw: socket,
      ...(cert.valid_to ? {} : {}),
    };
  }
  async resolve(
    connection: TransportConnection,
    query: DnsWireMessage,
    ctx: DnsTransportContext,
  ): Promise<DnsWireMessage> {
    const s = connection.raw as TLSSocket;
    const len = Buffer.alloc(2);
    len.writeUInt16BE(query.payload.length);
    s.write(Buffer.concat([len, query.payload]));
    const chunks: Buffer[] = [];
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new DnsTransportError(
              'ConnectionTimeout',
              'DoT read timed out',
              true,
              'retryable-transport',
            ),
          ),
        ctx.timeoutMs ?? 3000,
      );
      s.once('data', (d) => {
        clearTimeout(timer);
        chunks.push(d);
        const b = Buffer.concat(chunks);
        if (b.length < 2)
          return reject(
            new DnsTransportError(
              'ProtocolError',
              'DoT response missing length prefix',
              true,
              'retryable-transport',
            ),
          );
        const n = b.readUInt16BE(0);
        if (
          n >
          ((ctx.metadata?.maxResponseBytes as number | undefined) ??
            defaultDnsTransportConfig().maxResponseBytes)
        )
          return reject(
            new DnsTransportError(
              'ResponseTooLarge',
              'DoT response exceeds configured limit',
              false,
              'resolver',
            ),
          );
        resolve(validateDnsWireResponse(b.subarray(2, 2 + n), query));
      });
      s.once('error', (e) => {
        clearTimeout(timer);
        reject(new DnsTransportError('ProtocolError', e.message, true, 'retryable-transport'));
      });
      ctx.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(
            new DnsTransportError('TransportCancelled', 'DoT query cancelled', false, 'cancelled'),
          );
        },
        { once: true },
      );
    });
  }
}
export class DnsOverHttpsTransport extends BaseTransport {
  id = 'builtin.doh';
  type: DnsTransportType = 'doh';
  capabilities: DnsTransportCapability[] = [
    'encrypted',
    'tls',
    'https',
    'certificate-validation',
    'hostname-verification',
    'connection-reuse',
    'wire-format',
  ];
  private readonly agent = new HttpsAgent({
    keepAlive: true,
    maxSockets: defaultDnsTransportConfig().pool.maxConnections,
  });
  endpoint(resolver: DnsProvider): TransportEndpoint | undefined {
    const doh = resolver.metadata().endpoints.doh;
    return doh ? validateDohEndpoint(doh) : undefined;
  }
  async connect(resolver: DnsProvider): Promise<TransportConnection> {
    const ep = this.endpoint(resolver);
    if (!ep)
      throw new DnsTransportError(
        'TransportUnavailable',
        'Resolver has no DoH endpoint',
        true,
        'retryable-transport',
      );
    return {
      id: createId('doh_conn'),
      key: '',
      transportId: this.id,
      type: this.type,
      endpoint: ep,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      expiresAt: Date.now() + defaultDnsTransportConfig().pool.maxLifetimeMs,
      state: 'open',
      raw: this.agent,
    };
  }
  async resolve(
    connection: TransportConnection,
    query: DnsWireMessage,
    ctx: DnsTransportContext,
  ): Promise<DnsWireMessage> {
    const ep = connection.endpoint;
    return await new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          method: 'POST',
          hostname: ep.hostname,
          port: ep.port,
          path: ep.path ?? '/dns-query',
          servername: ep.tlsServerName,
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          agent: this.agent,
          timeout: ctx.timeoutMs ?? 3000,
          headers: {
            'Content-Type': 'application/dns-message',
            Accept: 'application/dns-message',
            'Content-Length': query.payload.length,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => {
            chunks.push(c);
            if (
              Buffer.concat(chunks).length >
              ((ctx.metadata?.maxResponseBytes as number | undefined) ??
                defaultDnsTransportConfig().maxResponseBytes)
            ) {
              req.destroy();
              reject(
                new DnsTransportError(
                  'ResponseTooLarge',
                  'DoH response exceeds configured limit',
                  false,
                  'resolver',
                ),
              );
            }
          });
          res.on('end', () => {
            if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300)
              return reject(
                new DnsTransportError(
                  'HttpError',
                  `DoH HTTP status ${res.statusCode}`,
                  res.statusCode === 429 || (res.statusCode ?? 0) >= 500,
                  'retryable-transport',
                  { statusCode: res.statusCode },
                ),
              );
            resolve(validateDnsWireResponse(Buffer.concat(chunks), query));
          });
        },
      );
      req.once('timeout', () => {
        req.destroy();
        reject(
          new DnsTransportError(
            'HttpTimeout',
            'DoH request timed out',
            true,
            'retryable-transport',
          ),
        );
      });
      req.once('error', (e: Error & { code?: string }) =>
        reject(
          new DnsTransportError(
            e.code === 'ERR_TLS_CERT_ALTNAME_INVALID'
              ? 'HostnameVerificationFailed'
              : e.message.includes('certificate')
                ? 'CertificateValidationFailed'
                : 'ProtocolError',
            e.message,
            !e.message.includes('certificate'),
            e.message.includes('certificate') ? 'non-retryable-security' : 'retryable-transport',
          ),
        ),
      );
      ctx.signal?.addEventListener(
        'abort',
        () => {
          req.destroy();
          reject(
            new DnsTransportError(
              'TransportCancelled',
              'DoH request cancelled',
              false,
              'cancelled',
            ),
          );
        },
        { once: true },
      );
      req.end(query.payload);
    });
  }
  override async close(connection: TransportConnection): Promise<void> {
    connection.state = 'closed';
  }
}
export class DnsOverQuicTransport extends BaseTransport {
  id = 'builtin.doq.extension';
  type: DnsTransportType = 'doq';
  capabilities: DnsTransportCapability[] = [
    'encrypted',
    'quic',
    'certificate-validation',
    'hostname-verification',
    'wire-format',
    'plugin-provided',
  ];
  endpoint(_resolver: DnsProvider): TransportEndpoint | undefined {
    return undefined;
  }
  override supports(): boolean {
    return false;
  }
  async connect(): Promise<TransportConnection> {
    throw new DnsTransportError(
      'QuicHandshakeFailed',
      'DoQ is an extension point; no stable QUIC implementation is registered',
      false,
      'configuration',
    );
  }
  async resolve(): Promise<DnsWireMessage> {
    throw new DnsTransportError(
      'QuicHandshakeFailed',
      'DoQ is not implemented by the built-in transport',
      false,
      'configuration',
    );
  }
}

export class DnsTransportRegistry {
  private readonly transports = new Map<string, SecureDnsTransport>();
  register(t: SecureDnsTransport): void {
    if (!t.id)
      throw new DnsTransportError(
        'ConfigurationInvalid',
        'Transport id is required',
        false,
        'configuration',
      );
    this.transports.set(t.id, t);
  }
  get(id: string): SecureDnsTransport | undefined {
    return this.transports.get(id);
  }
  list(): SecureDnsTransport[] {
    return [...this.transports.values()];
  }
  byType(type: DnsTransportType): SecureDnsTransport[] {
    return this.list().filter((t) => t.type === type);
  }
}
export const createDefaultDnsTransportRegistry = (): DnsTransportRegistry => {
  const r = new DnsTransportRegistry();
  r.register(new DnsOverHttpsTransport());
  r.register(new DnsOverTlsTransport());
  r.register(new DnsOverQuicTransport());
  return r;
};

export class SecureDnsTransportEngine {
  private readonly registry: DnsTransportRegistry;
  private readonly config: DnsTransportConfig;
  private readonly pool: TransportConnectionPool;
  private readonly circuits = new Map<string, CircuitBreaker>();
  private shuttingDown = false;
  constructor(
    private readonly options: {
      registry?: DnsTransportRegistry;
      events?: Phase15EventBus;
      metrics?: Phase15MetricsRegistry;
      routing?: Phase15RoutingEngine;
      kernel?: Phase15KernelRuntime;
      principal?: Phase15Principal;
      config?: Partial<DnsTransportConfig>;
    } = {},
  ) {
    this.config = {
      ...defaultDnsTransportConfig(),
      ...options.config,
      tls: { ...defaultDnsTransportConfig().tls, ...options.config?.tls },
      timeouts: { ...defaultDnsTransportConfig().timeouts, ...options.config?.timeouts },
      retry: { ...defaultDnsTransportConfig().retry, ...options.config?.retry },
      pool: { ...defaultDnsTransportConfig().pool, ...options.config?.pool },
      circuitBreaker: {
        ...defaultDnsTransportConfig().circuitBreaker,
        ...options.config?.circuitBreaker,
      },
      fallback: { ...defaultDnsTransportConfig().fallback, ...options.config?.fallback },
    };
    this.validateConfig();
    this.registry = options.registry ?? createDefaultDnsTransportRegistry();
    this.pool = new TransportConnectionPool(this.config.pool);
    for (const t of this.registry.list())
      void this.emit('dns.transport.registered', { transportId: t.id, type: t.type });
  }
  async simulateDnsTransportSelection(
    question: DnsQuestion,
    resolver: DnsProvider,
    context: Partial<DnsTransportContext> = {},
  ): Promise<DnsTransportDecision> {
    return this.select(encodeDnsQuery(question), resolver, { resolver, ...context }, true);
  }
  async resolve(
    question: DnsQuestion,
    resolver: DnsProvider,
    context: Partial<DnsTransportContext> = {},
  ): Promise<DnsWireMessage> {
    const wire = encodeDnsQuery(question);
    const ctx: DnsTransportContext = {
      resolver,
      timeoutMs: this.config.timeouts.queryMs,
      ...context,
    };
    const decision = await this.select(wire, resolver, ctx, false);
    if (!decision.selectedTransport)
      throw new DnsTransportError('TransportPolicyRejected', decision.reason, false, 'policy');
    let last: DnsTransportError | undefined;
    for (const c of decision.fallbackOrder) {
      const circuit = this.circuit(c.transport.id);
      try {
        circuit.before();
        await this.emit('dns.transport.selected', {
          transportId: c.transport.id,
          resolverId: resolver.id,
        });
        const out = await this.withRetry(c, wire, ctx);
        circuit.success();
        return out;
      } catch (e) {
        last = this.toTransportError(e);
        if (
          !last.retryable ||
          last.failureKind === 'non-retryable-security' ||
          last.failureKind === 'policy'
        )
          throw last;
        if (circuit.failure())
          await this.emit('dns.transport.circuit.opened', { transportId: c.transport.id });
        await this.emit('dns.transport.failover.started', {
          from: c.transport.id,
          reason: last.code,
        });
      }
    }
    throw (
      last ??
      new DnsTransportError(
        'TransportUnavailable',
        'No transport succeeded',
        true,
        'retryable-transport',
      )
    );
  }
  private async select(
    query: DnsWireMessage,
    resolver: DnsProvider,
    context: DnsTransportContext,
    dryRun: boolean,
  ): Promise<DnsTransportDecision> {
    const profile = context.securityProfile ?? dnsTransportSecurityProfiles.balanced;
    const policy = context.policy;
    const rejected: RejectedDnsTransportCandidate[] = [];
    const candidates: DnsTransportCandidate[] = [];
    const route = context.route ?? (dryRun ? undefined : await this.routeFor(resolver));
    const ctx: DnsTransportContext = {
      ...context,
      ...(route ? { route } : {}),
      securityProfile: profile,
    };
    const types = policy?.preferTransports ?? profile.preferredOrder ?? this.config.priority;
    for (const t of this.registry
      .list()
      .sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type))) {
      const ep = safeEndpoint(t, resolver, rejected);
      if (!ep) continue;
      const rejection = this.policyRejection(t, resolver, profile, policy);
      if (rejection) {
        rejected.push(rejection);
        continue;
      }
      if (!t.supports(query, resolver, ctx)) {
        rejected.push({
          transportId: t.id,
          type: t.type,
          reason: 'transport does not support resolver/context',
          policyViolation: false,
        });
        continue;
      }
      candidates.push({
        transport: t,
        endpoint: ep,
        score: this.score(t, resolver, profile, policy),
      });
    }
    candidates.sort((a, b) => b.score.total - a.score.total);
    const selected = candidates[0];
    const decision: DnsTransportDecision = {
      query: { recordType: query.recordType ?? 'A', nameHash: hashQuery(query) },
      resolver: { id: resolver.id, name: resolver.name },
      candidates,
      rejectedCandidates: rejected,
      ...(selected ? { selectedTransport: selected } : {}),
      securityProfile: profile,
      ...(policy ? { policy } : {}),
      ...(route ? { route } : {}),
      reason: selected
        ? `selected ${selected.transport.type} for resolver ${resolver.id}`
        : 'no policy-compliant DNS transport available',
      fallbackOrder: this.config.fallback.enabled ? candidates : candidates.slice(0, 1),
      securityImplications: rejected
        .filter((r) => r.securityImplication)
        .map((r) => r.securityImplication as string),
      dryRun,
    };
    if (!dryRun)
      await this.emit(selected ? 'dns.transport.selected' : 'dns.transport.policy.rejected', {
        resolverId: resolver.id,
        selectedTransport: selected?.transport.id,
        rejected: rejected.length,
      });
    return decision;
  }
  private policyRejection(
    t: SecureDnsTransport,
    resolver: DnsProvider,
    profile: DnsTransportSecurityProfile,
    policy?: DnsTransportPolicy,
  ): RejectedDnsTransportCandidate | undefined {
    const encrypted = t.capabilities.includes('encrypted');
    if (
      this.config.disabledTransports.includes(t.type) ||
      !this.config.allowedTransports.includes(t.type)
    )
      return {
        transportId: t.id,
        type: t.type,
        reason: 'transport disabled by configuration',
        policyViolation: true,
      };
    if (!profile.allowedTransports.includes(t.type))
      return {
        transportId: t.id,
        type: t.type,
        reason: `security profile ${profile.id} disallows ${t.type}`,
        policyViolation: true,
        securityImplication: 'profile downgrade prevention',
      };
    if (
      (profile.requireEncrypted || policy?.requireEncryptedDns || policy?.denyPlaintextDns) &&
      !encrypted
    )
      return {
        transportId: t.id,
        type: t.type,
        reason: 'encrypted DNS is required; plaintext downgrade blocked',
        policyViolation: true,
        securityImplication: 'plaintext downgrade prevented',
      };
    if (policy?.allowTransports && !policy.allowTransports.includes(t.type))
      return {
        transportId: t.id,
        type: t.type,
        reason: 'transport not in policy allow-list',
        policyViolation: true,
      };
    if (policy?.denyTransports?.includes(t.type))
      return {
        transportId: t.id,
        type: t.type,
        reason: 'transport denied by policy',
        policyViolation: true,
      };
    if (policy?.requireTransport && policy.requireTransport !== t.type)
      return {
        transportId: t.id,
        type: t.type,
        reason: 'different transport required by policy',
        policyViolation: true,
      };
    if (policy?.requireResolverId && policy.requireResolverId !== resolver.id)
      return {
        transportId: t.id,
        type: t.type,
        reason: 'different resolver required by policy',
        policyViolation: true,
      };
    if (
      (profile.requireCertificateValidation || policy?.requireCertificateValidation) &&
      t.capabilities.includes('tls') &&
      !this.config.tls.requireCertificateValidation
    )
      return {
        transportId: t.id,
        type: t.type,
        reason: 'certificate validation is mandatory',
        policyViolation: true,
      };
    return undefined;
  }
  private score(
    t: SecureDnsTransport,
    resolver: DnsProvider,
    profile: DnsTransportSecurityProfile,
    policy?: DnsTransportPolicy,
  ): DnsTransportScore {
    const encrypted = t.capabilities.includes('encrypted');
    const pref =
      policy?.preferTransports?.indexOf(t.type) ?? profile.preferredOrder.indexOf(t.type);
    const s = {
      security: encrypted ? 100 : 30,
      latency: t.type === 'doh' ? 85 : t.type === 'dot' ? 80 : 60,
      reliability: 80,
      availability: t.state === 'available' || t.state === 'healthy' ? 90 : 20,
      networkCompatibility: t.type === 'doh' ? 90 : 75,
      resolverCompatibility:
        resolver.config.protocols.includes(t.type as ResolverProtocol) ||
        (t.type === 'doh' && resolver.supportsDoH()) ||
        (t.type === 'dot' && resolver.supportsDoT())
          ? 100
          : 60,
      connectionStability: t.capabilities.includes('connection-reuse') ? 90 : 50,
      historicalPerformance: 75,
      policyPreference: pref >= 0 ? 100 - pref * 10 : 50,
      total: 0,
    };
    s.total = Math.round(
      (s.security * 2 +
        s.latency +
        s.reliability +
        s.availability +
        s.networkCompatibility +
        s.resolverCompatibility +
        s.connectionStability +
        s.historicalPerformance +
        s.policyPreference * 1.5) /
        10.5,
    );
    return s;
  }
  private async withRetry(
    c: DnsTransportCandidate,
    query: DnsWireMessage,
    ctx: DnsTransportContext,
  ): Promise<DnsWireMessage> {
    let last: unknown;
    for (let i = 0; i < this.config.retry.maxAttempts; i++) {
      try {
        return await this.execute(c, query, ctx);
      } catch (e) {
        last = e;
        const te = this.toTransportError(e);
        if (!te.retryable || i === this.config.retry.maxAttempts - 1) throw te;
        await new Promise((r) =>
          setTimeout(
            r,
            Math.min(this.config.retry.maxDelayMs, this.config.retry.initialDelayMs * 2 ** i) *
              (1 + Math.random() * this.config.retry.jitterRatio),
          ),
        );
      }
    }
    throw this.toTransportError(last);
  }
  private async execute(
    c: DnsTransportCandidate,
    query: DnsWireMessage,
    ctx: DnsTransportContext,
  ): Promise<DnsWireMessage> {
    if (this.shuttingDown)
      throw new DnsTransportError(
        'TransportUnavailable',
        'transport engine shutting down',
        true,
        'retryable-transport',
      );
    const key = this.pool.key(ctx.resolver, c.transport, c.endpoint, ctx);
    let conn = this.pool.acquire(key);
    if (!conn) {
      await this.emit('dns.transport.connection.started', { transportId: c.transport.id });
      const start = performance.now();
      conn = await c.transport.connect(ctx.resolver, ctx);
      conn.key = key;
      this.metric('dns_transport_connection_success_total', 1, { transport: c.transport.type });
      this.metric('dns_transport_handshake_duration', performance.now() - start, {
        transport: c.transport.type,
      });
      await this.emit('dns.transport.connection.established', { transportId: c.transport.id });
    }
    const qstart = performance.now();
    try {
      this.metric('dns_transport_requests_total', 1, { transport: c.transport.type });
      const res = await c.transport.resolve(conn, query, {
        ...ctx,
        metadata: { ...ctx.metadata, maxResponseBytes: this.config.maxResponseBytes },
      });
      this.metric('dns_transport_success_total', 1, { transport: c.transport.type });
      this.metric('dns_transport_query_duration', performance.now() - qstart, {
        transport: c.transport.type,
      });
      return res;
    } catch (e) {
      const te = this.toTransportError(e);
      this.metric(
        te.code.includes('Timeout') ? 'dns_transport_timeout_total' : 'dns_transport_failure_total',
        1,
        { transport: c.transport.type, code: te.code },
      );
      throw te;
    } finally {
      this.pool.release(conn);
    }
  }
  private async routeFor(resolver: DnsProvider): Promise<Phase15NetworkPath | undefined> {
    if (!this.options.routing) return undefined;
    const ep =
      resolver.metadata().endpoints.dot ??
      resolver.metadata().endpoints.doh ??
      resolver.metadata().endpoints.ipv4[0];
    if (!ep) return undefined;
    return (
      await this.options.routing.simulateRouting({
        destination: phase15Destination(ep.includes('://') ? new URL(ep).hostname : ep),
      })
    ).selected?.path;
  }
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await this.pool.drain((c) => this.registry.get(c.transportId)?.close(c) ?? Promise.resolve());
  }
  poolSize(): number {
    return this.pool.size();
  }
  private circuit(id: string): CircuitBreaker {
    const c = this.circuits.get(id) ?? new CircuitBreaker(this.config.circuitBreaker);
    this.circuits.set(id, c);
    return c;
  }
  private toTransportError(e: unknown): DnsTransportError {
    return e instanceof DnsTransportError
      ? e
      : new DnsTransportError(
          'ProtocolError',
          e instanceof Error ? e.message : 'unknown transport error',
          true,
          'retryable-transport',
        );
  }
  private validateConfig(): void {
    if (
      !this.config.tls.requireCertificateValidation ||
      !this.config.tls.requireHostnameVerification
    )
      throw new DnsTransportError(
        'ConfigurationInvalid',
        'TLS certificate and hostname validation cannot be disabled',
        false,
        'configuration',
      );
    if (
      this.config.pool.maxConnections < 1 ||
      this.config.retry.maxAttempts < 1 ||
      this.config.maxResponseBytes < 512
    )
      throw new DnsTransportError(
        'ConfigurationInvalid',
        'Invalid bounded resource configuration',
        false,
        'configuration',
      );
  }
  private metric(name: string, value: number, labels?: Record<string, string>): void {
    this.options.metrics?.record(name, value, labels);
  }
  private async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.options.events?.publish({
      id: createId('evt'),
      type,
      aggregateId: 'dns-transport',
      occurredAt: new Date(),
      payload,
    });
  }
}
const safeEndpoint = (
  t: SecureDnsTransport,
  r: DnsProvider,
  rejected: RejectedDnsTransportCandidate[],
): TransportEndpoint | undefined => {
  try {
    return t.endpoint(r);
  } catch (e) {
    const err = e instanceof Error ? e.message : 'invalid endpoint';
    rejected.push({
      transportId: t.id,
      type: t.type,
      reason: err,
      policyViolation: true,
      securityImplication: 'invalid endpoint rejected',
    });
    return undefined;
  }
};
