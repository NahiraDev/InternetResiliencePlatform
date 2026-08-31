import Combine
import Foundation

public protocol IRPControlPlaneClient: Sendable {
    func enroll(deviceName: String) async throws -> IRPDeviceEnrollment
    func snapshot(deviceId: String) async throws -> IRPNetworkSnapshot
    func analytics(deviceId: String) async throws -> IRPAnalyticsSummary
    func setPolicy(deviceId: String, policy: IRPPolicy) async throws -> IRPPolicy
}

public enum IRPClientSessionError: Error, Equatable, Sendable {
    case notEnrolled
    case invalidEnrollment
}

@MainActor
public final class IRPClientSession: ObservableObject {
    @Published public private(set) var state: IRPClientState

    private let client: any IRPControlPlaneClient
    private let tokenStore: any IRPSecureTokenStore

    public init(
        client: any IRPControlPlaneClient,
        tokenStore: any IRPSecureTokenStore,
        initialState: IRPClientState = IRPClientState()
    ) {
        self.client = client
        self.tokenStore = tokenStore
        self.state = initialState
    }

    public func restoreSession() throws -> Bool {
        guard let token = try tokenStore.read(), !token.isEmpty else {
            return false
        }
        guard state.deviceId != nil else {
            throw IRPClientSessionError.invalidEnrollment
        }
        return true
    }

    public func enroll(deviceName: String) async throws {
        let enrollment = try await client.enroll(deviceName: deviceName)
        guard !enrollment.deviceId.isEmpty, !enrollment.deviceName.isEmpty, !enrollment.refreshToken.isEmpty else {
            throw IRPClientSessionError.invalidEnrollment
        }

        try tokenStore.write(enrollment.refreshToken)
        state = IRPClientState(
            enrolled: true,
            deviceId: enrollment.deviceId,
            deviceName: enrollment.deviceName,
            connection: .unknown,
            policy: IRPPolicy(),
            snapshot: nil,
            analytics: nil,
            revision: state.revision + 1
        )
    }

    public func refresh() async throws {
        guard let deviceId = state.deviceId else {
            throw IRPClientSessionError.notEnrolled
        }

        async let snapshot = client.snapshot(deviceId: deviceId)
        async let analytics = client.analytics(deviceId: deviceId)
        let (newSnapshot, newAnalytics) = try await (snapshot, analytics)

        state = IRPClientState(
            enrolled: state.enrolled,
            deviceId: state.deviceId,
            deviceName: state.deviceName,
            connection: newSnapshot.connection,
            policy: state.policy,
            snapshot: newSnapshot,
            analytics: newAnalytics,
            revision: state.revision + 1
        )
    }

    public func setAutonomousMode(_ enabled: Bool) async throws {
        guard let deviceId = state.deviceId else {
            throw IRPClientSessionError.notEnrolled
        }

        let nextPolicy = try await client.setPolicy(
            deviceId: deviceId,
            policy: IRPPolicy(autonomousMode: enabled)
        )

        state = IRPClientState(
            enrolled: state.enrolled,
            deviceId: state.deviceId,
            deviceName: state.deviceName,
            connection: state.connection,
            policy: nextPolicy,
            snapshot: state.snapshot,
            analytics: state.analytics,
            revision: state.revision + 1
        )
    }

    public func signOut() throws {
        try tokenStore.remove()
        state = IRPClientState(revision: state.revision + 1)
    }
}
