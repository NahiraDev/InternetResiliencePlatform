import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

interface EventPublisher {
  publish(event: unknown): Promise<void>;
}
interface MetricRecorder {
  record(name: string, value: number, labels?: Record<string, string>): void;
}
interface AuditAppender {
  append(input: {
    action: 'network.modify';
    actorId: string;
    target: string;
    outcome: 'success' | 'failure';
    details?: Record<string, unknown>;
  }): unknown;
}
interface ConnectivityAdapter {
  getAvailableSources(): ConnectivityLikeSource[];
  switchSource(
    resourceId: string,
    reason?: string,
    trigger?: string,
  ): Promise<{ status?: string }> | { status?: string };
}
interface ConnectivityLikeSource {
  sourceId: string;
  health?: { score?: number };
}
interface RoutingAdapter {
  simulateRouting(
    context: unknown,
  ): Promise<{ candidates: RoutingLikeCandidate[] }> | { candidates: RoutingLikeCandidate[] };
  applyPlan(plan: never): Promise<unknown> | unknown;
}
interface RoutingLikeCandidate {
  path: { id: string };
  totalScore: number;
  plan?: unknown;
}
interface DnsAdapter {
  decide(
    context: unknown,
    simulation?: boolean,
  ): Promise<{ candidates: DnsLikeCandidate[] }> | { candidates: DnsLikeCandidate[] };
  setManualOverride(override: unknown): void;
}
interface DnsLikeCandidate {
  resolver: { id: string; transport: string };
  score: number;
}
const createId = (prefix = 'irp'): string => `${prefix}_${randomUUID()}`;

export type FailureDomain =
  | 'connectivity'
  | 'route'
  | 'dns'
  | 'dns-transport'
  | 'resolver'
  | 'service'
  | 'platform'
  | 'configuration'
  | 'security';
export type FailureType =
  | 'transient'
  | 'intermittent'
  | 'persistent'
  | 'systemic'
  | 'dependency'
  | 'configuration'
  | 'policy'
  | 'security'
  | 'resource'
  | 'unknown';
export type FailureSeverity = 'info' | 'minor' | 'major' | 'critical';
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type FailureState =
  | 'detected'
  | 'confirmed'
  | 'recovering'
  | 'recovered'
  | 'unresolved'
  | 'escalated'
  | 'suppressed'
  | 'resolved';
export type RecoveryState =
  | 'idle'
  | 'detecting'
  | 'confirming'
  | 'planning'
  | 'executing'
  | 'validating'
  | 'recovered'
  | 'stabilizing'
  | 'rolling-back'
  | 'degraded'
  | 'escalated'
  | 'cooldown';
export type RecoveryActionType =
  | 're-probe'
  | 'retry'
  | 'reconnect'
  | 'switch-connectivity-source'
  | 'switch-route'
  | 'switch-resolver'
  | 'switch-dns-transport'
  | 'restart-subsystem'
  | 'reinitialize-component'
  | 'invalidate-cache'
  | 'clear-stale-state'
  | 'enter-degraded-mode'
  | 'rollback'
  | 'escalate';
export type CircuitState = 'closed' | 'open' | 'half-open';
export type ManualOverrideMode =
  | 'force-preferred'
  | 'disable-automatic-failover'
  | 'force-recovery'
  | 'clear-failure-state'
  | 'reset-circuit-breaker'
  | 'reset-recovery-budget';
export type RecoveryCost = 'none' | 'low' | 'medium' | 'high';

export interface FailureEvidence {
  signalId: string;
  source: string;
  message: string;
  observedAt: string;
  weight: number;
  healthScore?: number;
  timeout?: boolean;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}
export interface FailureImpact {
  affectedDomains: FailureDomain[];
  affectedComponents: string[];
  downstreamComponents: string[];
  serviceImpact: 'none' | 'degraded' | 'unavailable' | 'security-risk';
  estimatedBlastRadius: number;
}
export interface Failure {
  id: string;
  domain: FailureDomain;
  component: string;
  type: FailureType;
  severity: FailureSeverity;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  detectedAt: string;
  source: string;
  evidence: FailureEvidence[];
  impact: FailureImpact;
  state: FailureState;
  correlationId?: string;
}
export interface HealthSignal {
  id?: string;
  domain: FailureDomain;
  component: string;
  source: string;
  status:
    | 'healthy'
    | 'degraded'
    | 'unhealthy'
    | 'timeout'
    | 'error'
    | 'security-failure'
    | 'policy-denied';
  observedAt?: string;
  healthScore?: number;
  latencyMs?: number;
  timeout?: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}
export interface RecoveryConfig {
  detectionThreshold: number;
  confirmationThreshold: number;
  confidenceThreshold: number;
  maxRetries: number;
  maxRecoveryAttempts: number;
  maxFailovers: number;
  maxComponentSwitches: number;
  maxTotalRecoveryDurationMs: number;
  backoffInitialMs: number;
  backoffMaxMs: number;
  backoffJitterRatio: number;
  cooldownMs: number;
  hysteresisMinimumImprovement: number;
  stabilizationMs: number;
  recoveryTimeoutMs: number;
  maxConcurrentRecoveries: number;
  maxHistory: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerCooldownMs: number;
  failClosed: boolean;
  automaticRecovery: boolean;
  automaticConnectivitySwitching: boolean;
  automaticRouteSwitching: boolean;
  automaticResolverSwitching: boolean;
  automaticTransportSwitching: boolean;
}
export interface RecoveryCandidate {
  id: string;
  domain: FailureDomain;
  component: string;
  action: RecoveryActionType;
  eligible: boolean;
  rejectionReasons: string[];
  score: number;
  scoreComponents: Record<string, number>;
  cost: RecoveryCost;
  capabilities: string[];
  secure: boolean;
  source: 'connectivity' | 'routing' | 'dns' | 'dns-transport' | 'builtin' | 'plugin';
  payload?: unknown;
}
export interface RecoveryStrategy {
  id: string;
  trigger: FailureType | FailureDomain | 'any';
  scope: FailureDomain[];
  priority: number;
  prerequisites: string[];
  actions: RecoveryActionType[];
  validation: RecoveryActionType[];
  rollback: RecoveryActionType[];
  cooldownMs: number;
  budget: Partial<RecoveryConfig>;
}
export interface RecoveryStep {
  id: string;
  action: RecoveryActionType;
  candidateId?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'rolled-back' | 'skipped';
  reason: string;
  startedAt?: string;
  completedAt?: string;
  rollback?: RecoveryActionType;
}
export interface RecoveryPlan {
  id: string;
  failure: Failure;
  candidates: RecoveryCandidate[];
  rejectedCandidates: RecoveryCandidate[];
  selectedStrategy: RecoveryStrategy;
  steps: RecoveryStep[];
  validation: RecoveryActionType[];
  rollback: RecoveryActionType[];
  timeoutMs: number;
  reason: string;
  dryRun: boolean;
  createdAt: string;
}
export interface RecoveryDecision {
  failure: Failure;
  confidence: ConfidenceLevel;
  impact: FailureImpact;
  candidates: RecoveryCandidate[];
  rejectedCandidates: RecoveryCandidate[];
  selectedStrategy: RecoveryStrategy;
  actions: RecoveryActionType[];
  validation: RecoveryActionType[];
  rollback: RecoveryActionType[];
  reason: string;
  expectedCost: RecoveryCost;
  explanation: RecoveryExplanation;
}
export interface RecoveryExplanation {
  summary: string;
  evidence: string[];
  candidateSummary: { id: string; eligible: boolean; score: number; reasons: string[] }[];
  decision: string;
  reason: string;
  policy: string[];
  security: string[];
}
export interface RecoveryHistorySnapshot {
  failureCount: number;
  recoveryCount: number;
  successRate: number;
  averageRecoveryDurationMs: number;
  lastFailure?: string;
  lastRecovery?: string;
  recentStrategies: string[];
  failedStrategies: string[];
  successfulStrategies: string[];
  records: RecoveryHistoryRecord[];
}
export interface RecoveryHistoryRecord {
  failureContext: Pick<Failure, 'id' | 'domain' | 'component' | 'type' | 'severity' | 'confidence'>;
  strategy: string;
  outcome: 'success' | 'failed' | 'rolled-back' | 'degraded' | 'escalated' | 'simulated';
  durationMs: number;
  cost: RecoveryCost;
  stability: ConfidenceLevel;
  rollback: boolean;
  policy: string[];
  environment: Record<string, unknown>;
  at: string;
}
export interface RecoveryPolicyDecision {
  allowed: boolean;
  reason?: string;
  constraints?: string[];
  allowInsecureFallback?: boolean;
}
export interface RecoveryAdapters {
  connectivity?: ConnectivityAdapter;
  routing?: RoutingAdapter;
  dns?: DnsAdapter;
  events?: EventPublisher;
  metrics?: MetricRecorder;
  audit?: AuditAppender;
  kernel?: unknown;
  principal?: { id: string };
  securityPrincipal?: { id: string };
  policy?: (decision: RecoveryDecision) => Promise<RecoveryPolicyDecision> | RecoveryPolicyDecision;
  validate?: (step: RecoveryStep, plan: RecoveryPlan) => Promise<boolean> | boolean;
}

export const defaultRecoveryConfig = (): RecoveryConfig => ({
  detectionThreshold: 2,
  confirmationThreshold: 2,
  confidenceThreshold: 60,
  maxRetries: 2,
  maxRecoveryAttempts: 4,
  maxFailovers: 3,
  maxComponentSwitches: 3,
  maxTotalRecoveryDurationMs: 120_000,
  backoffInitialMs: 100,
  backoffMaxMs: 5_000,
  backoffJitterRatio: 0.1,
  cooldownMs: 30_000,
  hysteresisMinimumImprovement: 8,
  stabilizationMs: 30_000,
  recoveryTimeoutMs: 60_000,
  maxConcurrentRecoveries: 2,
  maxHistory: 100,
  circuitBreakerFailureThreshold: 3,
  circuitBreakerCooldownMs: 60_000,
  failClosed: true,
  automaticRecovery: true,
  automaticConnectivitySwitching: true,
  automaticRouteSwitching: true,
  automaticResolverSwitching: true,
  automaticTransportSwitching: true,
});
const order: FailureDomain[] = [
  'connectivity',
  'route',
  'dns-transport',
  'resolver',
  'dns',
  'service',
  'platform',
  'configuration',
  'security',
];
const transitions: Record<RecoveryState, RecoveryState[]> = {
  idle: ['detecting', 'planning', 'degraded'],
  detecting: ['confirming', 'idle'],
  confirming: ['planning', 'idle', 'cooldown'],
  planning: ['executing', 'degraded', 'escalated', 'cooldown'],
  executing: ['validating', 'rolling-back', 'degraded', 'escalated'],
  validating: ['recovered', 'rolling-back', 'degraded', 'escalated'],
  recovered: ['stabilizing', 'idle'],
  stabilizing: ['idle', 'cooldown'],
  'rolling-back': ['degraded', 'escalated', 'cooldown'],
  degraded: ['planning', 'escalated', 'cooldown'],
  escalated: ['cooldown'],
  cooldown: ['idle'],
};
const now = () => new Date().toISOString();
const scoreToConfidence = (n: number): ConfidenceLevel =>
  n >= 80 ? 'high' : n >= 50 ? 'medium' : 'low';
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const costValue = (c: RecoveryCost) => ({ none: 0, low: 1, medium: 2, high: 3 })[c];

export class DependencyGraph {
  private readonly edges = new Map<string, Set<string>>();
  addDependency(upstream: string, downstream: string): void {
    (this.edges.get(upstream) ?? this.edges.set(upstream, new Set()).get(upstream)!).add(
      downstream,
    );
  }
  downstream(component: string): string[] {
    const out = new Set<string>();
    const visit = (c: string) => {
      for (const d of this.edges.get(c) ?? [])
        if (!out.has(d)) {
          out.add(d);
          visit(d);
        }
    };
    visit(component);
    return [...out];
  }
  upstream(component: string): string[] {
    return [...this.edges].filter(([, ds]) => ds.has(component)).map(([u]) => u);
  }
  recoveryOrder(domains: FailureDomain[]): FailureDomain[] {
    return [...new Set(domains)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
}
export class CircuitBreaker {
  state: CircuitState = 'closed';
  failures = 0;
  openedAt = 0;
  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
  ) {}
  allow(at = Date.now()): boolean {
    if (this.state !== 'open') return true;
    if (at - this.openedAt >= this.cooldownMs) {
      this.state = 'half-open';
      return true;
    }
    return false;
  }
  record(success: boolean, at = Date.now()): CircuitState {
    if (success) {
      this.failures = 0;
      this.state = 'closed';
      return this.state;
    }
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.openedAt = at;
    }
    return this.state;
  }
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = 0;
  }
}
export class RecoveryBudget {
  recoveryAttempts = 0;
  retries = 0;
  failovers = 0;
  componentSwitches = 0;
  readonly startedAt = Date.now();
  constructor(private readonly config: RecoveryConfig) {}
  consume(kind: 'recovery' | 'retry' | 'failover' | 'switch'): boolean {
    if (Date.now() - this.startedAt > this.config.maxTotalRecoveryDurationMs) return false;
    if (kind === 'recovery') return ++this.recoveryAttempts <= this.config.maxRecoveryAttempts;
    if (kind === 'retry') return ++this.retries <= this.config.maxRetries;
    if (kind === 'failover') return ++this.failovers <= this.config.maxFailovers;
    return ++this.componentSwitches <= this.config.maxComponentSwitches;
  }
  reset(): void {
    this.recoveryAttempts = this.retries = this.failovers = this.componentSwitches = 0;
  }
}

export class FailoverRecoveryEngine {
  readonly graph = new DependencyGraph();
  private readonly config: RecoveryConfig;
  private readonly signals = new Map<string, HealthSignal[]>();
  private readonly circuits = new Map<string, CircuitBreaker>();
  private readonly locks = new Set<FailureDomain>();
  private readonly history: RecoveryHistoryRecord[] = [];
  private state: RecoveryState = 'idle';
  private automaticDisabled = false;
  constructor(
    private readonly adapters: RecoveryAdapters = {},
    config: Partial<RecoveryConfig> = {},
  ) {
    this.config = { ...defaultRecoveryConfig(), ...config };
    for (let i = 0; i < order.length - 1; i += 1)
      this.graph.addDependency(order[i]!, order[i + 1]!);
  }
  getState(): RecoveryState {
    return this.state;
  }
  transition(to: RecoveryState): RecoveryState {
    if (!transitions[this.state].includes(to))
      throw new Error(`Invalid recovery transition ${this.state} -> ${to}`);
    this.state = to;
    return this.state;
  }
  detect(signal: HealthSignal): Failure | undefined {
    this.transitionFromIdle('detecting');
    const s = {
      ...signal,
      id: signal.id ?? createId('signal'),
      observedAt: signal.observedAt ?? now(),
    };
    const key = `${s.domain}:${s.component}`;
    const list = [...(this.signals.get(key) ?? []), s].slice(-this.config.maxHistory);
    this.signals.set(key, list);
    if (
      s.status === 'healthy' ||
      list.filter((x) => x.status !== 'healthy').length < this.config.detectionThreshold
    ) {
      this.state = 'idle';
      return undefined;
    }
    const evidence: FailureEvidence[] = list
      .filter((x) => x.status !== 'healthy')
      .map((x) => ({
        signalId: x.id!,
        source: x.source,
        message: x.message ?? x.status,
        observedAt: x.observedAt!,
        weight: x.timeout ? 15 : x.status === 'security-failure' ? 45 : 25,
        ...(x.healthScore !== undefined ? { healthScore: x.healthScore } : {}),
        ...(x.timeout !== undefined ? { timeout: x.timeout } : {}),
        ...(x.latencyMs !== undefined ? { latencyMs: x.latencyMs } : {}),
        ...(x.metadata ? { metadata: x.metadata } : {}),
      }));
    const confidenceScore = this.confidence(evidence);
    const failure: Failure = {
      id: createId('failure'),
      domain: s.domain,
      component: s.component,
      type: this.classify(s, evidence),
      severity: this.severity(s.domain, confidenceScore),
      confidence: scoreToConfidence(confidenceScore),
      confidenceScore,
      detectedAt: now(),
      source: s.source,
      evidence,
      impact: this.impact(s.domain, s.component),
      state: 'detected',
    };
    void this.emit('recovery.failure.detected', { failureId: failure.id, domain: failure.domain });
    this.metric('recovery_failures_detected_total');
    return failure;
  }
  confirm(failure: Failure): Failure {
    this.transition('confirming');
    const confirmed =
      failure.confidenceScore >= this.config.confidenceThreshold &&
      failure.evidence.length >= this.config.confirmationThreshold;
    const out = { ...failure, state: confirmed ? ('confirmed' as const) : ('suppressed' as const) };
    if (confirmed) {
      void this.emit('recovery.failure.confirmed', { failureId: out.id });
      this.metric('recovery_failures_confirmed_total');
    }
    return out;
  }
  correlate(failures: Failure[]): Failure[] {
    const sorted = [...failures].sort((a, b) => order.indexOf(a.domain) - order.indexOf(b.domain));
    const root = sorted[0];
    if (!root) return [];
    return [
      {
        ...root,
        correlationId: createId('correlation'),
        impact: {
          ...root.impact,
          affectedDomains: [...new Set(sorted.map((f) => f.domain))],
          affectedComponents: sorted.map((f) => f.component),
        },
      },
    ];
  }
  async simulateRecovery(input: Failure | HealthSignal): Promise<RecoveryDecision> {
    const failure = 'state' in input ? input : this.confirm(this.detect(input)!);
    const plan = await this.plan(failure, true);
    return this.decision(plan);
  }
  async recover(input: Failure | HealthSignal): Promise<RecoveryPlan> {
    const detected = 'state' in input ? input : this.detect(input);
    if (!detected) throw new Error('failure not detected');
    const failure = detected.state === 'confirmed' ? detected : this.confirm(detected);
    if (failure.state !== 'confirmed')
      return this.degradedPlan(failure, 'failure confidence below automatic recovery threshold');
    if (!this.config.automaticRecovery || this.automaticDisabled)
      return this.degradedPlan(failure, 'automatic recovery disabled');
    const plan = await this.plan(failure, false);
    return this.execute(plan);
  }
  async plan(failure: Failure, dryRun = false): Promise<RecoveryPlan> {
    this.transitionFromIdle('planning');
    const candidates = await this.candidates(failure);
    const decision = this.decisionFrom(failure, candidates);
    const plan: RecoveryPlan = {
      id: createId('recovery_plan'),
      failure,
      candidates: candidates.filter((c) => c.eligible),
      rejectedCandidates: candidates.filter((c) => !c.eligible),
      selectedStrategy: decision.selectedStrategy,
      steps: decision.actions.map((a) => {
        const candidateId = decision.candidates.find((c) => c.action === a)?.id;
        const rollback = decision.rollback[0];
        return {
          id: createId('recovery_step'),
          action: a,
          status: 'pending',
          reason: decision.reason,
          ...(candidateId ? { candidateId } : {}),
          ...(rollback ? { rollback } : {}),
        };
      }),
      validation: decision.validation,
      rollback: decision.rollback,
      timeoutMs: this.config.recoveryTimeoutMs,
      reason: decision.reason,
      dryRun,
      createdAt: now(),
    };
    void this.emit('recovery.plan.created', { planId: plan.id, failureId: failure.id, dryRun });
    this.metric('recovery_plans_total');
    return plan;
  }
  decision(plan: RecoveryPlan): RecoveryDecision {
    return this.decisionFrom(plan.failure, [...plan.candidates, ...plan.rejectedCandidates]);
  }
  async execute(plan: RecoveryPlan): Promise<RecoveryPlan> {
    if (plan.dryRun) return plan;
    const domain = plan.failure.domain;
    if (this.locks.has(domain))
      throw new Error(`conflicting recovery already running for ${domain}`);
    this.locks.add(domain);
    const start = performance.now();
    const budget = new RecoveryBudget(this.config);
    try {
      this.transition('executing');
      void this.emit('recovery.plan.started', { planId: plan.id });
      for (const step of plan.steps) {
        if (!budget.consume('recovery')) return this.escalate(plan, 'recovery budget exhausted');
        await this.runStep(step, plan, budget);
        if (step.status === 'failed') return this.rollback(plan, 'step failed');
      }
      this.transition('validating');
      void this.emit('recovery.validation.started', { planId: plan.id });
      const ok = this.adapters.validate
        ? await this.adapters.validate(plan.steps.at(-1)!, plan)
        : true;
      if (!ok) return this.rollback(plan, 'validation failed');
      void this.emit('recovery.validation.succeeded', { planId: plan.id });
      this.transition('recovered');
      this.transition('stabilizing');
      void this.emit('recovery.stabilizing', {
        planId: plan.id,
        stabilizationMs: this.config.stabilizationMs,
      });
      this.record(plan, 'success', performance.now() - start);
      this.metric('recovery_plans_success_total');
      this.transition('idle');
      return plan;
    } finally {
      this.locks.delete(domain);
    }
  }
  async manualOverride(mode: ManualOverrideMode, component?: string): Promise<void> {
    if (mode === 'disable-automatic-failover') this.automaticDisabled = true;
    if (mode === 'force-recovery') this.automaticDisabled = false;
    if (mode === 'reset-recovery-budget') {
      /* next recovery creates a fresh bounded budget */
    }
    if (mode === 'reset-circuit-breaker' && component) this.circuit(component).reset();
    if (mode === 'clear-failure-state' && component) this.signals.delete(component);
    await this.audit('manual_override', { mode, component });
    await this.emit('recovery.manual_override', { mode, component });
  }
  historySnapshot(): RecoveryHistorySnapshot {
    const successes = this.history.filter((h) => h.outcome === 'success').length;
    const avg = this.history.reduce((s, h) => s + h.durationMs, 0) / (this.history.length || 1);
    const lastFailure = this.history.at(-1)?.failureContext.id;
    const lastRecovery = this.history.filter((h) => h.outcome === 'success').at(-1)?.at;
    return {
      failureCount: this.signals.size,
      recoveryCount: this.history.length,
      successRate: this.history.length ? successes / this.history.length : 0,
      averageRecoveryDurationMs: avg,
      ...(lastFailure ? { lastFailure } : {}),
      ...(lastRecovery ? { lastRecovery } : {}),
      recentStrategies: this.history.slice(-10).map((h) => h.strategy),
      failedStrategies: this.history
        .filter((h) => h.outcome !== 'success')
        .map((h) => h.strategy)
        .slice(-10),
      successfulStrategies: this.history
        .filter((h) => h.outcome === 'success')
        .map((h) => h.strategy)
        .slice(-10),
      records: [...this.history],
    };
  }
  private async candidates(f: Failure): Promise<RecoveryCandidate[]> {
    const out: RecoveryCandidate[] = [];
    const add = (c: RecoveryCandidate) => out.push(this.eligible(c, f));
    if (f.domain === 'connectivity' && this.adapters.connectivity)
      for (const s of this.adapters.connectivity.getAvailableSources())
        add(
          this.candidate(
            'connectivity',
            s.sourceId,
            'switch-connectivity-source',
            'connectivity',
            s,
            s.health?.score ?? 50,
            'high',
          ),
        );
    if (f.domain === 'route' && this.adapters.routing) {
      const d = await this.adapters.routing.simulateRouting({
        destination: { kind: 'default', value: '0.0.0.0/0' },
      });
      for (const c of d.candidates)
        add(
          this.candidate('route', c.path.id, 'switch-route', 'routing', c, c.totalScore, 'medium'),
        );
    }
    if ((f.domain === 'dns' || f.domain === 'resolver') && this.adapters.dns) {
      const q = { id: createId('dns_query'), name: 'example.com', type: 'A', class: 'IN' };
      const d = await this.adapters.dns.decide({ query: q }, true);
      for (const c of d.candidates)
        add(
          this.candidate(
            'resolver',
            c.resolver.id,
            'switch-resolver',
            'dns',
            c,
            c.score,
            'low',
            !['udp', 'tcp'].includes(c.resolver.transport),
          ),
        );
    }
    if (f.domain === 'dns-transport')
      for (const t of ['doh', 'dot', 'doq'])
        add(
          this.candidate(
            'dns-transport',
            t,
            'switch-dns-transport',
            'dns-transport',
            { transport: t },
            t === 'doh' ? 85 : 75,
            'low',
            true,
          ),
        );
    add(this.candidate(f.domain, f.component, 're-probe', 'builtin', undefined, 60, 'none', true));
    return out.slice(0, 50);
  }
  private eligible(c: RecoveryCandidate, f: Failure): RecoveryCandidate {
    const reasons = [...c.rejectionReasons];
    if (!this.circuit(c.component).allow()) reasons.push('circuit-open');
    if (f.type === 'security' && !c.secure)
      reasons.push('security-policy-rejects-insecure-fallback');
    if (c.action === 'switch-connectivity-source' && !this.config.automaticConnectivitySwitching)
      reasons.push('connectivity-switching-disabled');
    if (c.action === 'switch-route' && !this.config.automaticRouteSwitching)
      reasons.push('route-switching-disabled');
    if (c.action === 'switch-resolver' && !this.config.automaticResolverSwitching)
      reasons.push('resolver-switching-disabled');
    if (c.action === 'switch-dns-transport' && !this.config.automaticTransportSwitching)
      reasons.push('transport-switching-disabled');
    return { ...c, eligible: c.eligible && reasons.length === 0, rejectionReasons: reasons };
  }
  private candidate(
    domain: FailureDomain,
    component: string,
    action: RecoveryActionType,
    source: RecoveryCandidate['source'],
    payload: unknown,
    score: number,
    cost: RecoveryCost,
    secure = true,
  ): RecoveryCandidate {
    return {
      id: createId('candidate'),
      domain,
      component,
      action,
      eligible: true,
      rejectionReasons: [],
      score: clamp(score - costValue(cost) * 8),
      scoreComponents: {
        health: clamp(score),
        disruptionCost: 100 - costValue(cost) * 25,
        stability: 80,
      },
      cost,
      capabilities: [`${domain}.recover`],
      secure,
      source,
      payload,
    };
  }
  private decisionFrom(failure: Failure, candidates: RecoveryCandidate[]): RecoveryDecision {
    const eligible = candidates
      .filter((c) => c.eligible)
      .sort((a, b) => b.score - a.score || costValue(a.cost) - costValue(b.cost));
    const selected = eligible[0];
    const actions: RecoveryActionType[] = selected
      ? (['re-probe', selected.action].filter(
          (v, i, a) => a.indexOf(v) === i,
        ) as RecoveryActionType[])
      : ['enter-degraded-mode', 'escalate'];
    const strategy: RecoveryStrategy = {
      id: selected ? `strategy:${selected.action}` : 'strategy:degraded-escalate',
      trigger: failure.type,
      scope: [failure.domain],
      priority: failure.severity === 'critical' ? 100 : 50,
      prerequisites: ['policy-approved', 'budget-available', 'circuit-closed'],
      actions,
      validation: ['re-probe'],
      rollback: selected?.action.startsWith('switch') ? ['rollback'] : [],
      cooldownMs: this.config.cooldownMs,
      budget: this.config,
    };
    const reason = selected
      ? `selected ${selected.component} for minimal-disruption ${selected.action}`
      : 'no eligible recovery candidates';
    return {
      failure,
      confidence: failure.confidence,
      impact: failure.impact,
      candidates: eligible,
      rejectedCandidates: candidates.filter((c) => !c.eligible),
      selectedStrategy: strategy,
      actions,
      validation: strategy.validation,
      rollback: strategy.rollback,
      reason,
      expectedCost: selected?.cost ?? 'high',
      explanation: {
        summary: reason,
        evidence: failure.evidence.map((e) => e.message),
        candidateSummary: candidates.map((c) => ({
          id: c.id,
          eligible: c.eligible,
          score: c.score,
          reasons: c.rejectionReasons,
        })),
        decision: selected?.action ?? 'degraded/escalated',
        reason,
        policy: [],
        security:
          failure.type === 'security'
            ? ['insecure fallback rejected']
            : ['secure alternatives preferred'],
      },
    };
  }
  private async runStep(
    step: RecoveryStep,
    plan: RecoveryPlan,
    budget: RecoveryBudget,
  ): Promise<void> {
    step.status = 'running';
    step.startedAt = now();
    await this.emit('recovery.step.started', {
      planId: plan.id,
      stepId: step.id,
      action: step.action,
    });
    const ok = await this.perform(step, plan);
    step.status = ok ? 'succeeded' : 'failed';
    step.completedAt = now();
    this.circuit(plan.failure.component).record(ok);
    if (!ok && budget.consume('retry'))
      step.status = (await this.perform(step, plan)) ? 'succeeded' : 'failed';
    await this.emit(ok ? 'recovery.step.completed' : 'recovery.step.failed', {
      planId: plan.id,
      stepId: step.id,
    });
  }
  private async perform(step: RecoveryStep, plan: RecoveryPlan): Promise<boolean> {
    if (step.action === 're-probe' || step.action === 'retry') return true;
    const c = plan.candidates.find((x) => x.id === step.candidateId);
    if (step.action === 'switch-connectivity-source' && c)
      return Boolean(
        (
          await this.adapters.connectivity?.switchSource(
            c.component,
            'active-source-failed',
            'recovery',
          )
        )?.status !== 'failed',
      );
    if (step.action === 'switch-route' && c?.payload)
      return Boolean(
        (await this.adapters.routing?.applyPlan((c.payload as { plan?: unknown }).plan as never)) ??
        true,
      );
    if (step.action === 'switch-resolver' && c) {
      this.adapters.dns?.setManualOverride({
        mode: 'prefer-resolver',
        target: c.component,
        reason: 'phase16 recovery',
      });
      return true;
    }
    if (step.action === 'switch-dns-transport' && c) {
      this.adapters.dns?.setManualOverride({
        mode: 'prefer-transport',
        target: c.component,
        reason: 'phase16 recovery',
      } as never);
      return true;
    }
    return step.action === 'enter-degraded-mode' || step.action === 'escalate';
  }
  private async rollback(plan: RecoveryPlan, reason: string): Promise<RecoveryPlan> {
    this.transition('rolling-back');
    await this.emit('recovery.rollback.started', { planId: plan.id, reason });
    const can = plan.rollback.length > 0;
    if (!can) return this.escalate(plan, 'rollback unavailable');
    for (const s of plan.steps.filter((x) => x.status === 'succeeded').reverse())
      s.status = 'rolled-back';
    await this.emit('recovery.rollback.succeeded', { planId: plan.id });
    this.record(plan, 'rolled-back', 0);
    this.transition('cooldown');
    this.transition('idle');
    return plan;
  }
  private degradedPlan(failure: Failure, reason: string): RecoveryPlan {
    this.transitionFromIdle('planning');
    const plan: RecoveryPlan = {
      id: createId('recovery_plan'),
      failure,
      candidates: [],
      rejectedCandidates: [],
      selectedStrategy: {
        id: 'strategy:degraded',
        trigger: failure.type,
        scope: [failure.domain],
        priority: 0,
        prerequisites: [],
        actions: ['enter-degraded-mode'],
        validation: [],
        rollback: [],
        cooldownMs: this.config.cooldownMs,
        budget: {},
      },
      steps: [
        { id: createId('recovery_step'), action: 'enter-degraded-mode', status: 'pending', reason },
      ],
      validation: [],
      rollback: [],
      timeoutMs: this.config.recoveryTimeoutMs,
      reason,
      dryRun: false,
      createdAt: now(),
    };
    this.state = 'degraded';
    void this.emit('recovery.degraded', { planId: plan.id, reason });
    this.metric('recovery_degraded_total');
    return plan;
  }
  private async escalate(plan: RecoveryPlan, reason: string): Promise<RecoveryPlan> {
    this.state = 'escalated';
    await this.emit('recovery.escalated', { planId: plan.id, reason });
    this.metric('recovery_escalated_total');
    this.record(plan, 'escalated', 0);
    return plan;
  }
  private classify(s: HealthSignal, evidence: FailureEvidence[]): FailureType {
    if (s.status === 'security-failure') return 'security';
    if (s.status === 'policy-denied') return 'policy';
    if (s.domain === 'configuration') return 'configuration';
    if (evidence.length >= this.config.confirmationThreshold * 2) return 'persistent';
    if (evidence.filter((e) => e.timeout).length > 1) return 'intermittent';
    if (this.graph.upstream(s.domain).length) return 'dependency';
    return 'transient';
  }
  private confidence(e: FailureEvidence[]): number {
    return clamp(
      e.reduce(
        (s, x) =>
          s + x.weight + (x.healthScore !== undefined ? Math.max(0, 60 - x.healthScore) / 2 : 0),
        0,
      ),
    );
  }
  private impact(domain: FailureDomain, component: string): FailureImpact {
    const downstream = this.graph.downstream(domain);
    return {
      affectedDomains: [
        domain,
        ...downstream.filter((d): d is FailureDomain => order.includes(d as FailureDomain)),
      ],
      affectedComponents: [component, ...downstream],
      downstreamComponents: downstream,
      serviceImpact:
        domain === 'security'
          ? 'security-risk'
          : domain === 'connectivity'
            ? 'unavailable'
            : 'degraded',
      estimatedBlastRadius: downstream.length + 1,
    };
  }
  private severity(domain: FailureDomain, confidence: number): FailureSeverity {
    if (domain === 'connectivity' || domain === 'security')
      return confidence >= 80 ? 'critical' : 'major';
    return confidence >= 80 ? 'major' : confidence >= 50 ? 'minor' : 'info';
  }
  private circuit(component: string): CircuitBreaker {
    const c =
      this.circuits.get(component) ??
      new CircuitBreaker(
        this.config.circuitBreakerFailureThreshold,
        this.config.circuitBreakerCooldownMs,
      );
    this.circuits.set(component, c);
    return c;
  }
  private transitionFromIdle(to: RecoveryState): void {
    if (this.state !== 'idle') this.state = 'idle';
    this.transition(to);
  }
  private record(
    plan: RecoveryPlan,
    outcome: RecoveryHistoryRecord['outcome'],
    durationMs: number,
  ): void {
    this.history.push({
      failureContext: plan.failure,
      strategy: plan.selectedStrategy.id,
      outcome,
      durationMs,
      cost: this.decision(plan).expectedCost,
      stability: plan.failure.confidence,
      rollback: plan.rollback.length > 0,
      policy: [],
      environment: { domain: plan.failure.domain },
      at: now(),
    });
    if (this.history.length > this.config.maxHistory)
      this.history.splice(0, this.history.length - this.config.maxHistory);
    this.metric('recovery_duration', durationMs);
  }
  private metric(name: string, value = 1): void {
    this.adapters.metrics?.record(name, value, { domain: 'recovery' });
  }
  private async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.adapters.events?.publish({
      id: createId('evt'),
      type,
      aggregateId: 'recovery',
      occurredAt: new Date(),
      payload,
    });
  }
  private async audit(action: string, details: Record<string, unknown>): Promise<void> {
    this.adapters.audit?.append({
      actorId: this.adapters.securityPrincipal?.id ?? 'recovery-engine',
      action: 'network.modify',
      target: 'recovery',
      outcome: 'success',
      details: { recoveryAction: action, ...details },
    });
  }
}
