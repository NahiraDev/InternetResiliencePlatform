# Phase 19 Configuration Reference

`NetworkDecisionEngine` accepts:

- `weights`: availability, latency, packetLoss, jitter, throughput, stability, security, policyCompliance, historicalReliability, recoveryCost.
- `freshMs` / `staleMs`: freshness classification thresholds.
- `ttlMs`: decision expiration window.
- `maxHistoryPerCandidate`, `maxCandidates`, `maxConcurrentEvaluations`: bounded resource limits.
- `model.timeoutMs`, `model.maxConcurrent`: optional provider bounds.
- `policyValidator`, `securityValidator`: Phase 11/18 validation adapters.
- `events`, `metrics`, `audit`: observable sinks.

Default weights are exported as `DEFAULT_DECISION_WEIGHTS` and produce normalized `0.0–1.0` scores.
