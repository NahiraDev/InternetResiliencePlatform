import SwiftUI

@main
struct IRPiOSApp: App {
    @StateObject private var session = IRPClientSession(
        client: IRPUnconfiguredControlPlaneClient(),
        tokenStore: IRPKeychainTokenStore()
    )

    var body: some Scene {
        WindowGroup {
            // No network extension is bundled yet, so the tunnel status stays an honest statement.
            IRPClientDashboardView(session: session, tunnelStatus: "VPN not configured")
        }
    }
}

enum IRPControlPlaneUnavailable: LocalizedError {
    case notConfigured

    var errorDescription: String? { "No Control Plane is configured in this build." }
}

/// The app ships without a Control Plane endpoint, so every call fails visibly instead of
/// returning invented data. The dashboard shows empty states and offers no enrolment actions.
struct IRPUnconfiguredControlPlaneClient: IRPControlPlaneClient {
    func enroll(deviceName: String) async throws -> IRPDeviceEnrollment { throw IRPControlPlaneUnavailable.notConfigured }
    func snapshot(deviceId: String) async throws -> IRPNetworkSnapshot { throw IRPControlPlaneUnavailable.notConfigured }
    func analytics(deviceId: String) async throws -> IRPAnalyticsSummary { throw IRPControlPlaneUnavailable.notConfigured }
    func setPolicy(deviceId: String, policy: IRPPolicy) async throws -> IRPPolicy { throw IRPControlPlaneUnavailable.notConfigured }
}
