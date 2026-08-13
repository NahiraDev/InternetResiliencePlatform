# Phase 14 — Smart DNS Engine & Resolver Intelligence Layer

Phase 14 extends `@irp/dns` with `SmartDnsEngine`, a DNS intelligence layer that decides **which resolver and transport strategy should be used for a DNS query**. It does not replace the kernel, event bus, rule/policy layer, connectivity manager, or routing engine, and it does not apply OS DNS configuration directly.

## Reused architecture

- **Kernel / capability boundary:** DNS transports are abstractions. Future privileged DNS configuration changes must be executed through Phase 10 kernel capabilities and dispatcher contracts, not shell commands from the DNS engine.
- **Event bus:** the engine accepts the existing `EventBus`-compatible publisher and emits structured `dns.*` events for resolver registration, query lifecycle, cache invalidation, timeouts, and resolver changes.
- **Telemetry:** the engine accepts the existing metrics registry shape and records privacy-conscious counters derived from event names, without raw query labels.
- **Connectivity and routing:** `DnsDecisionContext` accepts connectivity source snapshots and a routing decision/path selected by Phase 12 and Phase 13. Phase 14 consumes that context; it does not manage connectivity or routes.
- **Policy:** `DnsPolicyProvider` is an extension point for consuming Phase 11 policy decisions. Policies can allow/deny resolvers, prefer or require resolvers, require capabilities, disable transports, and adjust scores without creating a second rule engine.
- **Plugin compatibility:** `DnsPluginExtension` lets plugins contribute resolvers, transports, scoring factors, policy providers, and validators through the existing plugin architecture.

## Resolution pipeline

```text
Resolver discovery / plugin contribution
        ↓
Resolver registry
        ↓
Resolver health and state
        ↓
Eligibility filtering
        ↓
Policy evaluation
        ↓
Composable scoring
        ↓
Deterministic resolver selection
        ↓
Query execution with bounded fallback
        ↓
Response validation
        ↓
Positive / negative cache
        ↓
Result + telemetry + events
```

## Domain model

`SmartDnsResolver` separates resolver identity from resolver transport. A resolver has a stable `id`, `type`, `addresses`, `transport`, address `family`, advertised `capabilities`, static `priority`, `health`, lifecycle `state`, and metadata.

Supported resolver categories are `system`, `local`, `gateway`, `public`, `private`, `custom`, and `plugin`. Supported transport identities include current UDP/TCP/system-style transports plus future extension identifiers for DoH, DoT, DoQ, DNSCrypt, local stub, and custom transports. Phase 14 implements the generic transport abstraction and a Node/system transport adapter; it does not claim to implement a full encrypted DNS stack.

`DnsQuery` normalizes query name, record type, class, transport preference, query/resolver/overall timeouts, policy context, source context, and metadata. Standard record types include `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `SOA`, `SRV`, `PTR`, and `CAA`, while string extension types remain possible.

`DnsResponse` exposes answers, authority, additional records, explicit result state, flags, TTL, resolver identity, transport identity, latency, validation state, DNSSEC preparation state, and metadata without leaking transport-specific internals.

## Resolver registry and lifecycle

`DnsResolverRegistry` supports `register`, `unregister`, `get`, `find`, `list`, `enable`, `disable`, and `update`. Registration validates stable identifiers, required names, address requirements, and transport capabilities. Duplicate resolver registration is rejected. Disabled resolvers are represented explicitly and are not eligible for selection.

Resolver state is represented as `unknown`, `discovered`, `available`, `healthy`, `degraded`, `failed`, `recovering`, `cooldown`, or `disabled`. Health keeps bounded aggregate counters instead of unbounded query history: success/failure/timeout/SERVFAIL counts, consecutive successes/failures, latency, reliability, rates, and last success/failure/selected timestamps.

## Scoring, selection, failover, and recovery

Scoring is composable through `DnsScoreFactor`. Built-in factors cover health score, latency, reliability, static priority, and timeout rate. Scores are normalized to a 0–100 range and sorted deterministically by score, priority, then resolver id.

Eligibility considers resolver enabled state, resolver lifecycle state, health threshold, requested transport, transport support, and policy decisions. Hysteresis prevents small score deltas from flipping away from the active resolver. Cooldown prevents rapid active resolver switching.

Resolution uses a bounded fallback order (`retryCount + 1`) and never retries indefinitely. Retry semantics distinguish timeout, SERVFAIL, network error, transport error, resolver unavailable, NXDOMAIN, no-data, refused, cancellation, and validation failure. NXDOMAIN and NODATA may be negatively cached; transient transport failures are not cached as permanent negative answers.

## Cache and single-flight

`DnsCache` is bounded by `maxCacheEntries`, respects positive TTLs within configured min/max limits, supports negative cache TTLs for NXDOMAIN/NODATA, expires entries, evicts least-recently accessed entries, and supports manual/selective flush. Cache keys include normalized name, record type, class, and optional semantic context.

`SmartDnsEngine.resolve()` coalesces concurrent identical cache misses with a single-flight map so many simultaneous identical requests share one upstream resolution attempt.

## Validation, anomaly, and consistency

`validateDnsResponse()` verifies query id consistency, expected record semantics, record presence, and TTL sanity. Responses carry structured validation and DNSSEC preparation states (`supported`, `validated`, `insecure`, `bogus`, `unavailable`, `not-checked`).

`compareDnsResponses()` compares multi-resolver answer sets and reports `consensus`, `minority`, `inconsistent`, or `unknown`. This is an intelligence signal for policy and future anomaly handling; differing answers are not automatically classified as malicious. The anomaly model can represent normal, inconsistent, suspicious, validation-failed, and captive-portal-suspected states for future connectivity integration.

## Simulation and explainability

`simulateDnsResolution()` is deterministic and does not send network requests. It returns candidate resolvers, rejected candidates, policy decisions, selected resolver/transport, fallback order, cache disposition, selected routing path context, and a structured explanation with redacted query data by default.

## Security and privacy

The DNS engine validates resolver definitions and query names, enforces transport capability checks, keeps retry and cache sizes bounded, avoids shell execution, and does not apply privileged OS DNS changes. Metrics intentionally avoid raw DNS query labels. Query names are redacted in explanations unless `privacyLogQueries` is explicitly enabled.

## Intentionally deferred

Future roadmap phases may add full encrypted DNS transports, VPN/proxy/tunnel data planes, persistent learning, AI recommendations, desktop/mobile UI, remote agents, and OS-specific adapters. Phase 14 provides the typed resolver intelligence and orchestration layer those systems can extend.
