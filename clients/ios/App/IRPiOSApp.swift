import SwiftUI

@main
struct IRPiOSApp: App {
    @StateObject private var session: IRPClientSession

    init() {
        let tokenStore: any IRPSecureTokenStore = IRPKeychainTokenStore()
        let client = try? HttpControlPlaneClient(
            baseURL: "http://127.0.0.1:3000",
            tokenStore: tokenStore,
        )
        _session = StateObject(wrappedValue: IRPClientSession(
            client: client ?? UnconfiguredIRPControlPlaneClient(),
            tokenStore: tokenStore,
        ))
    }

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                IRPClientDashboardView(session: session)
                    .task {
                        _ = try? session.restoreSession()
                    }
            }
        }
    }
}

/// Fallback control plane client that reports "not configured" rather than throwing.
/// Used when the HTTP client cannot be constructed (e.g., invalid base URL).
private struct UnconfiguredIRPControlPlaneClient: IRPControlPlaneClient {
    func enroll(deviceName: String) async throws -> IRPDeviceEnrollment {
        throw IRPControlPlaneClientError.transportError(String(describing: URLError(.notConnectedToInternet)))
    }
    func snapshot(deviceId: String) async throws -> IRPNetworkSnapshot {
        throw IRPControlPlaneClientError.transportError(String(describing: URLError(.notConnectedToInternet)))
    }
    func analytics(deviceId: String) async throws -> IRPAnalyticsSummary {
        throw IRPControlPlaneClientError.transportError(String(describing: URLError(.notConnectedToInternet)))
    }
    func setPolicy(deviceId: String, policy: IRPPolicy) async throws -> IRPPolicy {
        throw IRPControlPlaneClientError.transportError(String(describing: URLError(.notConnectedToInternet)))
    }
}
