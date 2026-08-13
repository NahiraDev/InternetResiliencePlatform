import { Resolver } from 'node:dns/promises';
import { performance } from 'node:perf_hooks';
import { EventEmitter } from 'node:events';

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
export type DnsTransportType = ResolverProtocol | 'system' | 'local-stub' | 'custom';
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
