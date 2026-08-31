# IRP iOS Full Client

Phase 65 provides the native iOS Full Client boundary for enrollment, secure session state, policy controls, analytics presentation and diagnostics presentation.

## Boundaries

- Refresh/session credentials are persisted through the Apple Keychain implementation; tests use an in-memory store.
- Control-plane access is represented by `IRPControlPlaneClient` and remains authoritative for enrollment, policy and analytics.
- The client keeps network observations and presentation state locally but does not decide routes, DNS, gateways or failover.
- Network Extension and other privileged system-networking APIs are intentionally excluded from Phase 65 and belong to Phase 66.

## Local validation

From the repository root:

```bash
swift test --package-path clients/ios
```

The package supports iOS 17+ and macOS 14+ so the shared client logic can be exercised on the macOS CI runner without requiring an iOS simulator for every unit test.
