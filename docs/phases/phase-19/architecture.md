# Phase 19 Architecture — AI-Assisted Network Decision Engine

```text
Phase 12 Connectivity
        ↓
Phase 13 Routing
        ↓
Phase 14 DNS
        ↓
Phase 15 Secure DNS
        ↓
Phase 17 Tunnel
        ↓
Phase 18 Security
        ↓
Phase 19 Decision Engine
        ↓
Policy Validation (Phase 11 adapter)
        ↓
Security Validation (Phase 18 adapter)
        ↓
Existing Controllers
        ↓
Phase 10 Kernel
```

Phase 19 is advisory. It ranks normalized candidates, explains recommendations, and returns expiring decision records. It does not execute shell commands, mutate DNS, modify routes, activate tunnels, change interfaces, or call the kernel.

Implemented:

- `NetworkDecisionEngine` with `evaluate`, `rank`, `recommend`, `explain`, `simulate`, `simulateDecision`, `replay`, `revalidate`.
- Deterministic weighted scoring with configurable documented weights.
- Hard policy/security/capability/health/freshness constraints before soft optimization.
- Confidence from completeness, freshness, history, and score margin.
- Bounded history, performance profiles, anomaly detection, model-provider timeout/fallback, model-output validation, privacy filtering, audit/events/metrics sinks.

Experimental:

- External `DecisionModelProvider` abstraction. Output is never trusted directly and deterministic fallback remains primary.

Unsupported:

- Autonomous network changes, credential handling, raw packet retention, direct kernel bypass.
