# IRP iOS Full Client

Phase 65 provides the native iOS Full Client boundary for enrollment, secure session state, policy controls, analytics presentation and diagnostics presentation. Phase 66 adds the native Network Extension execution boundary.

## Architecture

- The containing app owns presentation and `NETunnelProviderManager` profile lifecycle.
- The packet-tunnel extension subclasses `NEPacketTunnelProvider` and receives a Control Plane-authorized tunnel configuration.
- Core/Control Plane remains authoritative for routing, destination policy, gateway selection, tunnel selection and failover decisions.
- The extension does not implement a second WireGuard/OpenVPN stack. A concrete authorized packet transport must be supplied behind the transport boundary.

## Security boundaries

- Refresh/session credentials are persisted through the Apple Keychain implementation; tests use an in-memory store.
- Network Extension is enabled only for the packet-tunnel capability required by this client.
- Malformed tunnel configuration is rejected before network settings are applied.
- Missing tunnel transport fails closed rather than creating a partially functional VPN.

## Local validation

From the repository root:

```bash
swift test --package-path clients/ios
swift build --package-path clients/ios
xcodebuild -list -project clients/ios/IRP.xcodeproj
```

For a simulator build without Apple signing assets:

```bash
xcodebuild -project clients/ios/IRP.xcodeproj \
  -target IRPPacketTunnel \
  -sdk iphonesimulator \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build
```

The package supports iOS 17+ and macOS 14+ for host-side unit-test execution. A real iPhone install requires an Apple-signed build with the Network Extension capability provisioned for the App ID.
