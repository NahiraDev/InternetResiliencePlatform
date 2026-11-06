import SwiftUI

/// Configuration source for the IRP Control Plane endpoint.
///
/// The base URL is read from the app's `Info.plist` under the key
/// `IRPControlPlaneBaseURL`. Production builds must supply a configured HTTPS
/// endpoint. A missing, empty, or insecure URL fails closed: the app reports
/// "configuration required" instead of silently connecting to localhost.
enum IRPControlPlaneConfiguration {
    static let baseURLKey = "IRPControlPlaneBaseURL"

    /// Resolves and validates the Control Plane base URL from `Info.plist`.
    /// - Returns: A validated `URL`, or `nil` when no usable endpoint is configured.
    static func resolvedBaseURL() -> URL? {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: baseURLKey) as? String,
            !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            let url = URL(string: raw)
        else {
            return nil
        }
        // Production must use HTTPS. Localhost is never acceptable in production.
        #if DEBUG
        if url.scheme?.lowercased() == "http", url.host?.lowercased() == "localhost" {
            return url // allow localhost only in debug builds
        }
        #endif
        guard url.scheme?.lowercased() == "https" else {
            return nil
        }
        return url
    }
}

@main
struct IRPiOSApp: App {
    @StateObject private var session: IRPClientSession

    init() {
        let tokenStore: any IRPSecureTokenStore = IRPKeychainTokenStore()
        let baseURL = IRPControlPlaneConfiguration.resolvedBaseURL()
        let client: any IRPControlPlaneClient
        if let baseURL, let configured = try? HttpControlPlaneClient(
            baseURL: baseURL.absoluteString,
            tokenStore: tokenStore,
        ) {
            client = configured
        } else {
            // Fail closed: never fall back to localhost. Report that configuration
            // is required so the operator supplies a real Control Plane endpoint.
            client = UnconfiguredIRPControlPlaneClient(
                reason: baseURL == nil ? "notConfigured" : "invalidBaseURL",
            )
        }
        _session = StateObject(wrappedValue: IRPClientSession(
            client: client,
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

/// Fallback control plane client that reports "configuration required" rather than
/// throwing a transport error or silently connecting to localhost. Used when the
/// Control Plane endpoint is missing or invalid.
private struct UnconfiguredIRPControlPlaneClient: IRPControlPlaneClient {
    let reason: String

    func enroll(deviceName: String) async throws -> IRPDeviceEnrollment {
        throw IRPControlPlaneClientError.configurationRequired(reason)
    }

    func snapshot(deviceId: String) async throws -> IRPNetworkSnapshot {
        throw IRPControlPlaneClientError.configurationRequired(reason)
    }

    func analytics(deviceId: String) async throws -> IRPAnalyticsSummary {
        throw IRPControlPlaneClientError.configurationRequired(reason)
    }

    func setPolicy(deviceId: String, policy: IRPPolicy) async throws -> IRPPolicy {
        throw IRPControlPlaneClientError.configurationRequired(reason)
    }
}
