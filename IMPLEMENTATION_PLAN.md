# InternetResiliencePlatform - Delivery Implementation Plan

## Current State Summary

### ✅ Working Well
- **Architecture**: `ResilienceRuntime` as canonical authority with `createCanonicalRuntime` composition
- **Core Packages**: All passing tests (resilience-runtime: 959 tests, gateway-registry: 113, tunnel: 42, linux-client: 169, connectivity: 13, routing: 22, dns: 27, network-intelligence: 41, failover: 10)
- **Architecture Validation**: Passes
- **Gateway Selection Plane**: Comprehensive with capacity reservation, tunnel establishment, route installation, destination verification, full compensation/rollback
- **API**: 106 tests passing (14 test files, 7 skipped)
- **Linux Client**: 169 tests passing (18 test files, 1 skipped)

### ❌ Blockers
1. **Permission Issues**: Dist directories owned by root (from previous CI runs), preventing `tsc` builds
2. **Daemon Tests**: 3 failing test files due to import resolution from dist
3. **Platform Builds**: Windows, macOS, iOS, Android clients not verified

### 🔍 Integration Gaps to Address

## Phase 1: Fix Build Infrastructure (Prerequisite)
- [ ] Resolve dist directory permission issues
- [ ] Verify all packages build with `tsc`
- [ ] Ensure `pnpm build` completes successfully

## Phase 2: Complete Integration Gaps

### 2.1 Intent → Fabric → Gateway → Tunnel → Route → Verify Chain
- [ ] Verify Intent compilation (Phase 79) → Governance (Phase 80) → Arbitration (Phase 81) flow
- [ ] Connect Fabric selection (Phase 86-92) to GatewayRegistrySelectionPlane
- [ ] Ensure Gateway selection triggers TunnelControlPlane.connect()
- [ ] Verify RoutingEngine.applyPlan() installs correct routes
- [ ] Confirm Destination verification proves external egress
- [ ] Test full rollback on any failure

### 2.2 Closed-Loop Control (Phase 78)
- [ ] BoundedClosedLoopController drives ResilienceRuntime cycles
- [ ] Scheduler coordinates with closed-loop
- [ ] Autonomous mode properly gated by host authorization

### 2.3 Fabric System (Phases 86-92)
- [ ] ProgrammableConnectivityFabric discovery providers registered
- [ ] Resource freshness evaluation working
- [ ] Capability authority enforcement
- [ ] Diversity selection (failure domains)
- [ ] Intent routing preferences (Phase 93)

### 2.4 Advanced Routing & Recovery (Phase 93+)
- [ ] Route ranking with bounded compiled-intent preferences
- [ ] Fail-closed validation
- [ ] Selection audit evidence

### 2.5 Telemetry & Intelligence (Phases 100-106)
- [ ] Unified telemetry plane
- [ ] Anomaly detection
- [ ] Correlation engine
- [ ] Streaming telemetry
- [ ] Time-series analysis
- [ ] Topology awareness

### 2.6 Security & Trust (Phases 107-113)
- [ ] Control-plane security
- [ ] Capability grants
- [ ] Device identity
- [ ] Key lifecycle
- [ ] Security monitoring

### 2.7 Fleet & Distributed Control (Phases 114-120)
- [ ] Fleet coordination
- [ ] Device lifecycle
- [ ] Inventory management
- [ ] Tenant isolation

### 2.8 Data Plane & Traffic Engineering (Phases 128-134)
- [ ] Dataplane abstraction
- [ ] Address sessions
- [ ] App policy
- [ ] NAT/Firewall
- [ ] Flow lifecycle
- [ ] QoS

### 2.9 Platform APIs & Extensibility (Phases 135-140)
- [ ] Control API with versioned endpoints
- [ ] Plugin lifecycle
- [ ] Capability directory
- [ ] Compatibility layer

### 2.10 Privacy, Governance & Compliance (Phases 141-145)
- [ ] Compliance evidence
- [ ] Data lifecycle
- [ ] Governance controls
- [ ] Immutable history
- [ ] Privacy telemetry

### 2.11 Reliability, Scale & Disaster Recovery (Phases 146-150)
- [ ] Backpressure handling
- [ ] Certification framework
- [ ] Control-plane HA
- [ ] Disaster recovery
- [ ] Consistency guarantees

## Phase 3: Platform Builds
- [ ] Linux Full Client (Debian package) - PRIMARY
- [ ] macOS Client
- [ ] Windows Client
- [ ] iOS Client (Network Extension)
- [ ] Android Client (VpnService)

## Phase 4: Release Preparation
- [ ] GitHub Release workflow
- [ ] Artifacts for all platforms
- [ ] Checksums and provenance
- [ ] Security and dependency verification
- [ ] Installation/upgrade documentation
- [ ] Release gates validation

## Immediate Actions

### 1. Fix Permission Issues
```bash
# The dist directories are owned by root from previous CI runs
# Need to clean and rebuild
```

### 2. Verify Integration Chain
Run end-to-end tests for:
- Intent → Compilation → Governance → Fabric → Gateway → Tunnel → Route → Verify

### 3. Test Platform Builds
- Linux: `pnpm linux:package` (Debian package)
- macOS: Verify Swift/ObjC compilation
- Windows: Verify MSIX/AppX
- iOS: Verify Xcode build
- Android: Verify Gradle build

### 4. Run Full Test Suite
- All package tests
- Integration tests
- E2E tests (where infrastructure permits)

## Evidence Requirements per Gate

| Gate | Required Evidence |
|------|-------------------|
| Architecture | `pnpm architecture:check` passes |
| Type Safety | `pnpm typecheck` passes all 43 packages |
| Linting | `pnpm lint` passes all 43 packages |
| Unit Tests | `pnpm test` passes all 43 packages |
| Integration | `pnpm runtime:integration` passes |
| Linux Runtime | `pnpm --filter @irp/linux-client test` passes |
| Linux Package | `pnpm linux:package` produces .deb |
| Architecture Invariants | No NetworkAutopilot, single ResilienceRuntime authority |
| Release Gates | All phase-specific certification scripts pass |

## Success Criteria
1. All 43 packages build, typecheck, lint, test pass
2. Linux Full Client Debian package builds and installs
3. Architecture validation passes (no competing authorities)
4. Full integration chain verified: Intent → Verify
5. GitHub Release published with artifacts for all claimed platforms
6. No critical security vulnerabilities
7. Rollback/recovery tested and working