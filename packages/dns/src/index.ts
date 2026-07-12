import { Resolver } from 'node:dns/promises';
import { performance } from 'node:perf_hooks';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execFileAsync = promisify(execFile);

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
  resolve(question: DnsQuestion, provider?: DnsProvider, options?: ResolveOptions): Promise<DnsAnswer[]>;
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

export type DecisionStrategy = 'lowest-latency' | 'highest-availability' | 'lowest-packet-loss' | 'balanced' | 'privacy-first' | 'security-first' | 'custom';

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

  async resolve(question: DnsQuestion, provider?: DnsProvider, _options?: ResolveOptions): Promise<DnsAnswer[]> {
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
        return valuesToAnswers(question, await resolver.resolveAny(question.name) as string[]);
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
    const resolver = this.resolvers.find((r) => r.protocol === (options.protocol ?? this.config.protocols[0])) ?? this.resolvers[0];
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
    },
    tags: ['family-safe'],
    dnssec: false,
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
    },
    tags: ['privacy'],
    dnssec: false,
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
    dnssec: false,
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
  weights: { latency: 0.25, availability: 0.25, packetLoss: 0.2, privacy: 0.1, security: 0.1, stability: 0.05, prediction: 0.0 },
  failover: { failureThreshold: 2, recoveryThreshold: 2, cooldownMs: 30000, failback: 'automatic' },
  minSwitchScoreDelta: 0.1,
  historyLimit: 100,
  dnssec: { enabled: true, requireValidation: false },
});

export class InMemoryDnsCache {
  private readonly entries = new Map<string, { answers: DnsAnswer[]; expiresAt: number; hits: number }>();
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
    const total = Array.from(this.entries.values()).reduce((sum, e) => sum + e.hits, 0) + this.misses;
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
  { id: 'streaming', name: 'Streaming', preferredProviders: [], timeoutMs: 1200, retryPolicy: { attempts: 2, backoffMs: 50 }, benchmarkFrequencyMs: 60_000, protocols: ['udp', 'doh'] },
  { id: 'gaming', name: 'Gaming', preferredProviders: [], timeoutMs: 500, retryPolicy: { attempts: 1, backoffMs: 20 }, benchmarkFrequencyMs: 30_000, protocols: ['udp'] },
  { id: 'development', name: 'Development', preferredProviders: [], timeoutMs: 2000, retryPolicy: { attempts: 2, backoffMs: 100 }, benchmarkFrequencyMs: 120_000, protocols: ['udp', 'tcp', 'doh'] },
  { id: 'privacy', name: 'Privacy', preferredProviders: [], timeoutMs: 1500, retryPolicy: { attempts: 2, backoffMs: 75 }, benchmarkFrequencyMs: 90_000, protocols: ['doh', 'dot'] },
  { id: 'security', name: 'Security', preferredProviders: [], timeoutMs: 1500, retryPolicy: { attempts: 2, backoffMs: 75 }, benchmarkFrequencyMs: 90_000, protocols: ['doh', 'dot'] },
  { id: 'corporate', name: 'Corporate', preferredProviders: [], timeoutMs: 2500, retryPolicy: { attempts: 3, backoffMs: 200 }, benchmarkFrequencyMs: 300_000, protocols: ['udp', 'tcp'] },
];

const avg = (values: number[]): number => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

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

    const provider = this.activeProviderId ? this.providers.find((p) => p.id === this.activeProviderId) : this.providers[0];
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
      reasons: [`availability: ${(availability * 100).toFixed(1)}%`, `latency: ${avgLatency.toFixed(1)}ms`],
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
      failureProbability: 1 - (samples.filter((s) => s.healthy).length / (samples.length || 1)),
      stabilityTrend: degradation > 0.1 ? 'degrading' : degradation < -0.1 ? 'improving' : 'stable',
    };
  }

  private maybeSwitch(best: ProviderScore): void {
    if (best.provider.id === this.activeProviderId) return;
    const current = this.rankProviders().find((ranked) => ranked.provider.id === this.activeProviderId);
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

export class SystemDnsManager {
  async apply(provider: DnsProvider): Promise<{ ok: boolean; rollback: () => Promise<void> }> {
    const platform_ = platform();
    if (platform_ === 'win32') {
      // Windows: Set DNS via netsh
      const addresses = provider.addresses ?? provider.metadata().endpoints.ipv4;
      await execFileAsync('netsh', ['interface', 'ip', 'set', 'dns', 'name=Ethernet', 'static', addresses[0]]);
      return {
        ok: true,
        rollback: async () => {
          await execFileAsync('netsh', ['interface', 'ip', 'set', 'dns', 'name=Ethernet', 'dhcp']);
        },
      };
    }
    return { ok: false, rollback: async () => {} };
  }
}

export class WorkerSupervisor {
  private readonly controllers = new Map<string, AbortController>();

  start(name: string, intervalMs: number, task: (signal: AbortSignal) => Promise<void>): void {
    const controller = new AbortController();
    this.controllers.set(name, controller);
    const interval = setInterval(async () => {
      if (controller.signal.aborted) {
        clearInterval(interval);
        return;
      }
      try {
        await task(controller.signal);
      } catch (error) {
        console.error(`Worker ${name} failed:`, error);
      }
    }, intervalMs);
  }

  stop(name: string): void {
    this.controllers.get(name)?.abort();
    this.controllers.delete(name);
  }
}
