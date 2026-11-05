/**
 * Phase 97 — Service Reachability Intelligence.
 *
 * Maintains bounded probe evidence per (service, path) and derives a
 * reachability verdict with explicit failure-layer attribution. Pure state
 * machine over injected timestamps; probing itself is performed by existing
 * observation providers.
 */
import { SampleWindow, parseTime, clamp } from '../analytics/series.js';
export const DEFAULT_REACHABILITY_CONFIG = Object.freeze({
    windowSize: 20, maxAgeMs: 5 * 60_000, minSamples: 3, reachableRatio: 0.9, unreachableRatio: 0.2,
});
export class ServiceReachabilityLedger {
    config;
    tracks = new Map();
    constructor(config = DEFAULT_REACHABILITY_CONFIG) {
        this.config = config;
    }
    key(serviceId, pathId) { return `${serviceId}\u0000${pathId}`; }
    record(probe) {
        const at = parseTime(probe.at);
        if (!Number.isFinite(at))
            throw new Error('reachability probe timestamp is invalid');
        if (!probe.ok && !probe.failedLayer)
            throw new Error('failed reachability probe must declare failedLayer');
        const key = this.key(probe.serviceId, probe.pathId);
        let track = this.tracks.get(key);
        if (!track) {
            track = { window: new SampleWindow(this.config.windowSize), ok: new SampleWindow(this.config.windowSize), layers: new Map(), failures: 0, lastAt: 0 };
            this.tracks.set(key, track);
        }
        track.window.push({ at, value: probe.ok ? 1 : 0 });
        if (probe.ok && probe.latencyMs !== undefined)
            track.ok.push({ at, value: probe.latencyMs });
        track.failures = probe.ok ? 0 : track.failures + 1;
        track.lastAt = Math.max(track.lastAt, at);
        if (!probe.ok && probe.failedLayer)
            track.layers.set(probe.failedLayer, (track.layers.get(probe.failedLayer) ?? 0) + 1);
    }
    verdict(serviceId, pathId, now) {
        const nowMs = parseTime(now);
        const track = this.tracks.get(this.key(serviceId, pathId));
        if (!track) {
            return Object.freeze({ serviceId, pathId, state: 'unknown', successRatio: 0, samples: 0, confidence: 0, consecutiveFailures: 0, stale: true });
        }
        const live = track.window.values().filter((s) => nowMs - s.at <= this.config.maxAgeMs);
        const stale = live.length === 0;
        const samples = live.length;
        const successRatio = samples === 0 ? 0 : live.reduce((s, x) => s + x.value, 0) / samples;
        const latencies = track.ok.values().filter((s) => nowMs - s.at <= this.config.maxAgeMs).map((s) => s.value).sort((a, b) => a - b);
        const p50 = latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : undefined;
        let dominant;
        let best = 0;
        for (const [layer, count] of [...track.layers.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            if (count > best) {
                best = count;
                dominant = layer;
            }
        }
        let state;
        if (stale || samples < this.config.minSamples)
            state = 'unknown';
        else if (successRatio >= this.config.reachableRatio)
            state = 'reachable';
        else if (successRatio <= this.config.unreachableRatio)
            state = 'unreachable';
        else
            state = 'degraded';
        const confidence = stale ? 0 : clamp(samples / this.config.windowSize, 0, 1) * (state === 'unknown' ? 0.5 : 1);
        return Object.freeze({
            serviceId, pathId, state, successRatio, samples, confidence, consecutiveFailures: track.failures,
            ...(dominant && successRatio < 1 ? { dominantFailureLayer: dominant } : {}),
            ...(p50 !== undefined ? { p50LatencyMs: p50 } : {}),
            ...(track.lastAt ? { lastProbeAt: new Date(track.lastAt).toISOString() } : {}),
            stale,
        });
    }
    /** Verdicts for one service across every known path, best state first. */
    servicePaths(serviceId, now) {
        const rank = { reachable: 0, degraded: 1, unknown: 2, unreachable: 3 };
        const verdicts = [];
        for (const key of this.tracks.keys()) {
            const [svc, path] = key.split('\u0000');
            if (svc === serviceId)
                verdicts.push(this.verdict(svc, path, now));
        }
        return Object.freeze(verdicts.sort((a, b) => rank[a.state] - rank[b.state] || b.successRatio - a.successRatio || a.pathId.localeCompare(b.pathId)));
    }
    /** Service-level verdict: reachable if any path is, i.e. an outage only when every path is down. */
    serviceState(serviceId, now) {
        const paths = this.servicePaths(serviceId, now);
        if (paths.length === 0)
            return 'unknown';
        if (paths.some((p) => p.state === 'reachable'))
            return 'reachable';
        if (paths.some((p) => p.state === 'degraded'))
            return 'degraded';
        if (paths.every((p) => p.state === 'unreachable'))
            return 'unreachable';
        return 'unknown';
    }
}
//# sourceMappingURL=reachability.js.map