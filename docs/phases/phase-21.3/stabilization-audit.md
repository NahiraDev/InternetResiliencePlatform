# Phase 21.3 Stabilization Audit

| ID       | Severity | Subsystem                    | Root cause                                                         | Fix                                                                                                                                | Verification                                                      |
| -------- | -------- | ---------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P213-001 | P1       | Environment                  | Container uses Node v20.20.2 while repo requires Node >=22.        | Documented as blocker; did not alter engines or bypass validation.                                                                 | `node --version` returned v20.20.2.                               |
| P213-002 | P1       | Security                     | API used a development JWT fallback even for production/staging.   | Added fail-safe JWT secret resolution for production/staging runtimes.                                                             | API test asserts production startup rejects missing `JWT_SECRET`. |
| P213-003 | P1       | Electron integration         | Desktop IPC returned demo snapshots for all status channels.       | Added LIVE default mode and backend connector for `/api/v1/platform/status`; DEMO mode remains explicit.                           | Desktop build/typecheck and IPC tests.                            |
| P213-004 | P1       | Backend-to-Electron contract | No backend endpoint provided consolidated live desktop state.      | Added `/api/v1/platform/status` with live network, DNS, security, recovery, tunnel, decision, event bus, and observability status. | API test verifies LIVE status payload.                            |
| P213-005 | P1       | Secure DNS                   | DoH/DoT implementation exists but is still not runtime-registered. | Marked `secureTransport: NOT_IMPLEMENTED` in live status instead of pretending secure DNS is active.                               | Documentation and API payload.                                    |
| P213-006 | P2       | Decision engine truthfulness | Desktop demo data could imply AI behavior.                         | Backend live status reports deterministic recommendations from live network health.                                                | API test verifies `mode: deterministic`.                          |
| P213-007 | P2       | Documentation                | Prior docs overstated separated flows as readiness blockers.       | Added Phase 21.3 truth artifacts and NO-GO decision.                                                                               | Artifact review.                                                  |

## Inventory summary

- `apps/api`: live backend path exists and now exposes a consolidated platform status endpoint.
- `apps/desktop`: LIVE and DEMO modes are explicit; LIVE mode consumes backend status through main-process IPC.
- `packages/network`: owns runtime monitoring/probes used by backend.
- `packages/network-intelligence`: remains intelligence/package-level; not merged into runtime monitoring.
- `packages/dns`: owns secure DNS implementation; runtime registration remains incomplete.
- `packages/routing`, `packages/tunnel`, `packages/failover`, `packages/security`: package capabilities remain partially integrated and are represented honestly in live status.
