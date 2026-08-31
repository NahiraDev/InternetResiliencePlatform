import XCTest
@testable import IRPiOSClient

private final class MockControlPlane: IRPControlPlaneClient, @unchecked Sendable {
    var enrollment: IRPDeviceEnrollment?
    var snapshotValue: IRPNetworkSnapshot = IRPNetworkSnapshot(
        connection: .online,
        interfaceCount: 1,
        defaultRouteAvailable: true,
        dnsReachable: true,
        capturedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    var analyticsValue = IRPAnalyticsSummary(
        sampleCount: 10,
        availabilityPercent: 99.5,
        medianLatencyMs: 42,
        packetLossPercent: 0.2
    )
    var policyValue = IRPPolicy()
    var error: Error?

    func enroll(deviceName: String) async throws -> IRPDeviceEnrollment {
        if let error { throw error }
        return enrollment ?? IRPDeviceEnrollment(
            deviceId: "device-1",
            deviceName: deviceName,
            refreshToken: "refresh-token"
        )
    }

    func snapshot(deviceId: String) async throws -> IRPNetworkSnapshot {
        if let error { throw error }
        return snapshotValue
    }

    func analytics(deviceId: String) async throws -> IRPAnalyticsSummary {
        if let error { throw error }
        return analyticsValue
    }

    func setPolicy(deviceId: String, policy: IRPPolicy) async throws -> IRPPolicy {
        if let error { throw error }
        policyValue = policy
        return policyValue
    }
}

final class IRPiOSClientTests: XCTestCase {
    @MainActor
    func testEnrollmentStoresRefreshTokenAndPublishesState() async throws {
        let api = MockControlPlane()
        let store = IRPMemoryTokenStore()
        let session = IRPClientSession(client: api, tokenStore: store)

        try await session.enroll(deviceName: "Nima iPhone")

        XCTAssertEqual(session.state.deviceId, "device-1")
        XCTAssertEqual(session.state.deviceName, "Nima iPhone")
        XCTAssertTrue(session.state.enrolled)
        XCTAssertEqual(try store.read(), "refresh-token")
    }

    @MainActor
    func testRefreshUpdatesSnapshotAndAnalyticsAtomically() async throws {
        let api = MockControlPlane()
        let session = IRPClientSession(
            client: api,
            tokenStore: IRPMemoryTokenStore(),
            initialState: IRPClientState(enrolled: true, deviceId: "device-1", deviceName: "Test")
        )

        try await session.refresh()

        XCTAssertEqual(session.state.connection, .online)
        XCTAssertEqual(session.state.snapshot?.interfaceCount, 1)
        XCTAssertEqual(session.state.analytics?.sampleCount, 10)
    }

    @MainActor
    func testRefreshFailureLeavesPreviousStateUnchanged() async throws {
        let api = MockControlPlane()
        api.error = TestError.adapterUnavailable
        let before = IRPClientState(enrolled: true, deviceId: "device-1", deviceName: "Test")
        let session = IRPClientSession(client: api, tokenStore: IRPMemoryTokenStore(), initialState: before)

        do {
            try await session.refresh()
            XCTFail("refresh should fail")
        } catch {
            XCTAssertEqual(session.state, before)
        }
    }

    @MainActor
    func testPolicyFailureDoesNotMutateLocalState() async throws {
        let api = MockControlPlane()
        api.error = TestError.policyRejected
        let before = IRPClientState(enrolled: true, deviceId: "device-1", deviceName: "Test")
        let session = IRPClientSession(client: api, tokenStore: IRPMemoryTokenStore(), initialState: before)

        do {
            try await session.setAutonomousMode(true)
            XCTFail("policy update should fail")
        } catch {
            XCTAssertEqual(session.state, before)
        }
    }

    @MainActor
    func testSignOutClearsEnrollmentAndSecureToken() throws {
        let store = IRPMemoryTokenStore(token: "refresh-token")
        let api = MockControlPlane()
        let session = IRPClientSession(
            client: api,
            tokenStore: store,
            initialState: IRPClientState(enrolled: true, deviceId: "device-1", deviceName: "Test")
        )

        try session.signOut()

        XCTAssertFalse(session.state.enrolled)
        XCTAssertNil(session.state.deviceId)
        XCTAssertNil(try store.read())
    }
}

enum TestError: Error {
    case adapterUnavailable
    case policyRejected
}
