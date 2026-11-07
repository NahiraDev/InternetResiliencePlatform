import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
export const DEFAULT_DECISION_WEIGHTS = {
    availability: 16,
    latency: 12,
    packetLoss: 14,
    jitter: 8,
    throughput: 8,
    stability: 10,
    security: 12,
    policyCompliance: 12,
    historicalReliability: 6,
    recoveryCost: 2,
};
const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const lowerBetter = (v, excellent, unusable) => v === null || v === undefined ? 0.5 : clamp01(1 - (v - excellent) / (unusable - excellent));
const higherBetter = (v, target) => v === null || v === undefined ? 0.5 : clamp01(v / target);
export class BoundedHistoricalObservations {
    maxPerCandidate;
    data = new Map();
    constructor(maxPerCandidate = 120) {
        this.maxPerCandidate = maxPerCandidate;
    }
    add(candidateId, observation) {
        const list = this.data.get(candidateId) ?? [];
        list.push(observation);
        while (list.length > this.maxPerCandidate)
            list.shift();
        this.data.set(candidateId, list);
    }
    get(candidateId) {
        return this.data.get(candidateId) ?? [];
    }
    snapshot() {
        return Object.fromEntries([...this.data].map(([k, v]) => [k, [...v]]));
    }
}
export class DecisionEvaluator {
    evaluate(decisions, outcomes) {
        const byId = new Map(outcomes.map((o) => [o.candidateId, o]));
        let correct = 0, fp = 0, fn = 0, comparable = 0, rankSum = 0, calibration = 0;
        for (const d of decisions) {
            const o = d.selectedCandidate ? byId.get(d.selectedCandidate.id) : undefined;
            if (!o)
                continue;
            comparable += 1;
            if (o.healthy && !o.failed)
                correct += 1;
            if (d.recommendedAction !== 'remain' && o.failed)
                fp += 1;
            if (d.recommendedAction === 'remain' && o.failed)
                fn += 1;
            rankSum += o.rank ? 1 / o.rank : 1;
            calibration += Math.abs(d.confidence - (o.healthy && !o.failed ? 1 : 0));
        }
        return {
            recommendationAccuracy: comparable ? correct / comparable : 0,
            falsePositiveRate: comparable ? fp / comparable : 0,
            falseNegativeRate: comparable ? fn / comparable : 0,
            rankingQuality: comparable ? rankSum / comparable : 0,
            confidenceCalibration: comparable ? 1 - calibration / comparable : 0,
        };
    }
}
export class NetworkDecisionEngine {
    active = 0;
    history;
    options;
    constructor(options = {}) {
        this.options = {
            weights: { ...DEFAULT_DECISION_WEIGHTS, ...options.weights },
            freshMs: options.freshMs ?? 60_000,
            staleMs: options.staleMs ?? 300_000,
            ttlMs: options.ttlMs ?? 120_000,
            maxHistoryPerCandidate: options.maxHistoryPerCandidate ?? 120,
            maxCandidates: options.maxCandidates ?? 50,
            maxConcurrentEvaluations: options.maxConcurrentEvaluations ?? 4,
            model: {
                timeoutMs: options.model?.timeoutMs ?? 250,
                maxConcurrent: options.model?.maxConcurrent ?? 1,
            },
            policyValidator: options.policyValidator,
            securityValidator: options.securityValidator,
            events: options.events,
            metrics: options.metrics,
            audit: options.audit,
        };
        this.history = new BoundedHistoricalObservations(this.options.maxHistoryPerCandidate);
    }
    async evaluate(request) {
        if (this.active >= this.options.maxConcurrentEvaluations)
            throw new Error('decision resource limit exceeded');
        this.active += 1;
        const start = performance.now();
        const now = request.now ?? new Date().toISOString();
        await this.emit('decision.started', { type: request.type });
        try {
            const candidates = request.context.candidates.slice(0, this.options.maxCandidates);
            const evaluations = await Promise.all(candidates.map((c) => this.evaluateCandidate(c, request.context, now)));
            const ranked = this.rank(evaluations);
            let fallbackUsed = false;
            if (request.modelProvider) {
                const model = await this.tryModel(request.modelProvider, request.context, request.signal);
                fallbackUsed = !model.ok;
                if (!model.ok)
                    await this.emit(model.timeout ? 'model.timeout' : 'model.failed', {
                        provider: request.modelProvider.id,
                    });
            }
            const overridden = this.applyManualOverride(ranked, request.manualOverride, now);
            const selected = overridden ?? ranked.find((e) => !e.rejected) ?? null;
            const policyValidation = selected
                ? await this.validatePolicy(selected.candidate, request.context)
                : { allowed: false, reason: 'no eligible candidate' };
            const securityValidation = selected && policyValidation.allowed
                ? await this.validateSecurity(selected.candidate, request.context)
                : { allowed: false, reason: policyValidation.reason ?? 'policy rejected candidate' };
            const status = selected && policyValidation.allowed && securityValidation.allowed
                ? 'recommended'
                : 'rejected';
            const confidence = selected ? this.confidence(selected, ranked, request.context, now) : 0;
            const result = {
                decisionId: randomUUID(),
                type: request.type,
                timestamp: now,
                selectedCandidate: status === 'recommended' ? selected.candidate : null,
                candidates: ranked,
                score: status === 'recommended' ? selected.score : 0,
                confidence: status === 'recommended' ? confidence : Math.min(confidence, 0.25),
                reasons: status === 'recommended' ? selected.reasons : [],
                rejectedCandidates: ranked
                    .filter((e) => e.rejected)
                    .map((e) => ({ id: e.candidate.id, reason: e.rejectionReason ?? 'rejected' })),
                policyValidation,
                securityValidation,
                recommendedAction: status === 'recommended'
                    ? this.actionFor(request.type, selected.candidate, request)
                    : 'none',
                expiresAt: new Date(Date.parse(now) + (request.ttlMs ?? this.options.ttlMs)).toISOString(),
                versions: request.context.versions,
                status,
                rejectionReason: status === 'rejected'
                    ? (securityValidation.reason ?? policyValidation.reason)
                    : undefined,
                fallbackUsed,
                explanation: '',
                predictedOutcomes: Object.fromEntries(ranked.map((e) => [e.candidate.id, e.predictedOutcome])),
            };
            result.explanation = this.explain(result);
            this.metric('decision_latency', performance.now() - start);
            this.metric('decision_confidence', result.confidence);
            this.metric(status === 'recommended' ? 'decisions_success_total' : 'decisions_rejected_total', 1);
            await this.emit(status === 'recommended' ? 'decision.completed' : 'decision.rejected', result);
            await this.audit('decision', this.privacyFilter(result));
            return result;
        }
        catch (error) {
            this.metric('decisions_failed_total', 1);
            await this.emit('decision.failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
        finally {
            this.active -= 1;
            this.metric('decisions_total', 1);
        }
    }
    rank(evaluations) {
        return [...evaluations].sort((a, b) => Number(a.rejected) - Number(b.rejected) ||
            b.score - a.score ||
            a.candidate.id.localeCompare(b.candidate.id));
    }
    recommend(request) {
        return this.evaluate(request);
    }
    simulate(request) {
        return this.evaluate({ ...request, requestedAction: request.requestedAction ?? 'none' });
    }
    simulateDecision(request) {
        return this.simulate(request);
    }
    replay(context, type, now = context.timestamp) {
        return this.evaluate({ type, context, now });
    }
    explain(decision) {
        const selected = decision.selectedCandidate;
        const lines = [
            `Decision ${decision.decisionId}: ${selected ? `select ${selected.id}` : 'no executable recommendation'}`,
            `Score: ${decision.score.toFixed(3)}`,
            `Confidence: ${decision.confidence.toFixed(3)}`,
            `Action: ${decision.recommendedAction}`,
        ];
        if (decision.reasons.length)
            lines.push(`Reasons: ${decision.reasons.join('; ')}`);
        const rejected = decision.rejectedCandidates.map((r) => `${r.id} (${r.reason})`).join('; ');
        if (rejected)
            lines.push(`Rejected: ${rejected}`);
        lines.push(`Policy: ${decision.policyValidation.allowed ? 'allowed' : `rejected: ${decision.policyValidation.reason}`}`);
        lines.push(`Security: ${decision.securityValidation.allowed ? 'allowed' : `rejected: ${decision.securityValidation.reason}`}`);
        return lines.join('\n');
    }
    isExpired(decision, now = new Date().toISOString()) {
        return Date.parse(now) >= Date.parse(decision.expiresAt);
    }
    revalidate(decision, context, now = new Date().toISOString()) {
        if (this.isExpired(decision, now))
            return 'expired';
        return JSON.stringify(decision.versions) === JSON.stringify(context.versions)
            ? decision.status
            : 'stale';
    }
    profile(c, history = this.history.get(c.id)) {
        return {
            latencyScore: lowerBetter(c.metrics.latencyMs, 20, 600),
            reliabilityScore: clamp01(c.metrics.reliabilityRatio ??
                c.metrics.availabilityRatio ??
                this.historicalReliability(history)),
            stabilityScore: this.stability(history),
            throughputScore: higherBetter(c.metrics.throughputMbps, 100),
            dnsScore: clamp01(c.metrics.dnsHealth ??
                (c.type === 'dns-resolver' ? lowerBetter(c.metrics.latencyMs, 20, 500) : 0.5)),
            routeScore: clamp01(c.metrics.routeHealth ?? (c.type === 'route' ? (c.health === 'healthy' ? 1 : 0.4) : 0.5)),
            tunnelScore: clamp01(c.metrics.tunnelHealth ?? (c.type === 'tunnel' ? (c.health === 'healthy' ? 1 : 0.4) : 0.5)),
        };
    }
    anomaly(c, history = this.history.get(c.id)) {
        if (history.length < 3 || c.metrics.latencyMs == null)
            return 'unknown';
        const vals = history.map((h) => h.latencyMs).filter((v) => typeof v === 'number');
        if (vals.length < 3)
            return 'unknown';
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
        if (sd === 0)
            return c.metrics.latencyMs > mean * 2 ? 'warning' : 'normal';
        const z = (c.metrics.latencyMs - mean) / sd;
        return z >= 3 ? 'anomalous' : z >= 2 ? 'warning' : 'normal';
    }
    async evaluateCandidate(candidate, context, now) {
        const history = context.historicalObservations?.[candidate.id] ?? this.history.get(candidate.id);
        const freshness = this.freshness(candidate.timestamp, now);
        const required = context.requiredCapabilities ?? [];
        const missing = required.filter((r) => !candidate.capabilities.includes(r));
        const hardReject = !candidate.policyCompatibility
            ? 'policy violation'
            : !candidate.securityCompatibility
                ? 'security violation'
                : missing.length
                    ? `missing capability: ${missing.join(',')}`
                    : ['unavailable', 'unhealthy'].includes(candidate.health)
                        ? `candidate ${candidate.health}`
                        : freshness === 'expired'
                            ? 'expired telemetry'
                            : undefined;
        const profile = this.profile(candidate, history);
        const anomaly = this.anomaly(candidate, history);
        if (anomaly === 'anomalous')
            await this.emit('anomaly.detected', { candidateId: candidate.id });
        const dimensions = this.dimensions(candidate, profile, history);
        const totalWeight = Object.values(this.options.weights).reduce((a, b) => a + b, 0);
        const score = clamp01(Object.entries(dimensions).reduce((sum, [k, v]) => sum + v * (this.options.weights[k] ?? 0), 0) / totalWeight);
        const reasons = this.reasons(candidate, dimensions, freshness, anomaly);
        const negativeFactors = Object.entries(dimensions)
            .filter(([, v]) => v < 0.55)
            .map(([k]) => `low ${k}`);
        return {
            candidate,
            score: hardReject ? 0 : score,
            dimensions,
            reasons,
            negativeFactors,
            rejected: hardReject !== undefined,
            rejectionReason: hardReject,
            freshness,
            anomaly,
            predictedOutcome: score > 0.8 ? 'likely healthy' : score > 0.55 ? 'usable with risk' : 'likely degraded',
        };
    }
    dimensions(c, p, h) {
        return {
            availability: clamp01(c.metrics.availabilityRatio ??
                (c.health === 'healthy' ? 1 : c.health === 'degraded' ? 0.6 : 0.2)),
            latency: p.latencyScore,
            packetLoss: lowerBetter(c.metrics.packetLossRatio, 0, 0.2),
            jitter: lowerBetter(c.metrics.jitterMs, 5, 100),
            throughput: p.throughputScore,
            stability: p.stabilityScore,
            security: c.securityCompatibility ? 1 : 0,
            policyCompliance: c.policyCompatibility ? 1 : 0,
            historicalReliability: this.historicalReliability(h),
            recoveryCost: lowerBetter(c.metrics.recoveryCost, 0, 100),
        };
    }
    freshness(timestamp, now) {
        const age = Date.parse(now) - Date.parse(timestamp);
        if (!Number.isFinite(age))
            return 'unknown';
        if (age <= this.options.freshMs)
            return 'fresh';
        if (age <= this.options.staleMs)
            return 'stale';
        return 'expired';
    }
    confidence(e, ranked, context, now) {
        const completeness = Object.values(e.candidate.metrics).filter((v) => v !== null && v !== undefined).length / 10;
        const freshness = e.freshness === 'fresh' ? 1 : e.freshness === 'stale' ? 0.55 : 0.2;
        const history = Math.min((context.historicalObservations?.[e.candidate.id]?.length ??
            this.history.get(e.candidate.id).length) / 10, 1);
        const margin = ranked[1] ? clamp01(e.score - ranked[1].score + 0.5) : 0.75;
        void now;
        return clamp01((completeness + freshness + history + margin) / 4);
    }
    historicalReliability(h) {
        if (!h.length)
            return 0.5;
        return clamp01(h.reduce((s, x) => s + (x.uptimeRatio ?? x.reliabilityRatio ?? x.availabilityRatio ?? 0.5), 0) / h.length);
    }
    stability(h) {
        const vals = h.map((x) => x.latencyMs).filter((v) => typeof v === 'number');
        if (vals.length < 2)
            return 0.5;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
        return clamp01(1 - Math.sqrt(variance) / Math.max(mean, 1));
    }
    reasons(c, d, f, a) {
        return [
            `${c.health} health`,
            `policy ${c.policyCompatibility ? 'compatible' : 'incompatible'}`,
            `security ${c.securityCompatibility ? 'compatible' : 'incompatible'}`,
            `telemetry ${f}`,
            `anomaly ${a}`,
            ...Object.entries(d)
                .filter(([, v]) => v >= 0.8)
                .map(([k]) => `strong ${k}`),
        ];
    }
    async validatePolicy(c, ctx) {
        return ((await this.options.policyValidator?.validate(c, ctx)) ??
            (c.policyCompatibility
                ? { allowed: true, version: ctx.versions.policyVersion }
                : { allowed: false, reason: 'policy incompatible', version: ctx.versions.policyVersion }));
    }
    async validateSecurity(c, ctx) {
        return ((await this.options.securityValidator?.validate(c, ctx)) ??
            (c.securityCompatibility
                ? { allowed: true, version: ctx.versions.securityStateVersion }
                : {
                    allowed: false,
                    reason: 'security incompatible',
                    version: ctx.versions.securityStateVersion,
                }));
    }
    actionFor(type, c, r) {
        if (r.requestedAction && r.requestedAction !== 'none')
            return r.requestedAction;
        if (type === 'routeDecision')
            return 'switch-route';
        if (type === 'tunnelDecision')
            return 'switch-tunnel';
        if (type === 'dnsDecision')
            return 'switch-dns-resolver';
        if (type === 'connectivityDecision')
            return 'switch-connectivity-source';
        if (type === 'failoverDecision')
            return c.id.includes('current') ? 'remain' : 'switch-endpoint';
        if (type === 'recoveryDecision')
            return 'reconnect';
        return 'switch-proxy';
    }
    applyManualOverride(ranked, o, now) {
        if (!o || Date.parse(o.expiresAt) <= Date.parse(now))
            return undefined;
        void this.audit('manual override', {
            candidateId: o.candidateId,
            requestedBy: o.requestedBy,
            reason: o.reason,
            expiresAt: o.expiresAt,
        });
        return ranked.find((e) => e.candidate.id === o.candidateId && !e.rejected);
    }
    async tryModel(provider, context, parent) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.options.model.timeoutMs);
        parent?.addEventListener('abort', () => controller.abort(), { once: true });
        await this.emit('model.started', { provider: provider.id });
        try {
            if (provider.evaluate)
                await provider.evaluate(context, controller.signal);
            await this.emit('model.completed', { provider: provider.id });
            return { ok: true, timeout: false };
        }
        catch {
            this.metric(controller.signal.aborted ? 'model_timeout_total' : 'model_failure_total', 1);
            return { ok: false, timeout: controller.signal.aborted };
        }
        finally {
            clearTimeout(timer);
        }
    }
    validateModelOutput(output, candidateIds) {
        const id = output.selectedCandidate?.id;
        if (id && !candidateIds.includes(id))
            return { allowed: false, reason: 'unknown candidate ID' };
        if (output.score !== undefined && !Number.isFinite(output.score))
            return { allowed: false, reason: 'invalid score' };
        if (output.confidence !== undefined && (output.confidence < 0 || output.confidence > 1))
            return { allowed: false, reason: 'invalid confidence' };
        return { allowed: true };
    }
    privacyFilter(value) {
        return JSON.parse(JSON.stringify(value, (k, v) => /secret|token|credential|privateKey|payload/i.test(k) ? '[redacted]' : v));
    }
    emit(event, payload) {
        return Promise.resolve(this.options.events?.emit(event, payload));
    }
    audit(event, payload) {
        return Promise.resolve(this.options.audit?.record(event, payload));
    }
    metric(name, value) {
        this.options.metrics?.record(name, value, { component: 'phase19-decision-engine' });
    }
}
//# sourceMappingURL=NetworkDecisionEngine.js.map