import Foundation

public enum IRPConnectionState: String, Codable, Equatable, Sendable {
    case unknown
    case online
    case degraded
    case offline
}

public struct IRPNetworkSnapshot: Codable, Equatable, Sendable {
    public let connection: IRPConnectionState
    public let interfaceCount: Int
    public let defaultRouteAvailable: Bool
    public let dnsReachable: Bool
    public let capturedAt: Date

    public init(
        connection: IRPConnectionState,
        interfaceCount: Int,
        defaultRouteAvailable: Bool,
        dnsReachable: Bool,
        capturedAt: Date
    ) {
        self.connection = connection
        self.interfaceCount = interfaceCount
        self.defaultRouteAvailable = defaultRouteAvailable
        self.dnsReachable = dnsReachable
        self.capturedAt = capturedAt
    }
}

public struct IRPPolicy: Codable, Equatable, Sendable {
    public let autonomousMode: Bool

    public init(autonomousMode: Bool = false) {
        self.autonomousMode = autonomousMode
    }
}

public struct IRPAnalyticsSummary: Codable, Equatable, Sendable {
    public let sampleCount: Int
    public let availabilityPercent: Double
    public let medianLatencyMs: Double?
    public let packetLossPercent: Double?

    public init(
        sampleCount: Int,
        availabilityPercent: Double,
        medianLatencyMs: Double?,
        packetLossPercent: Double?
    ) {
        self.sampleCount = sampleCount
        self.availabilityPercent = availabilityPercent
        self.medianLatencyMs = medianLatencyMs
        self.packetLossPercent = packetLossPercent
    }
}

public struct IRPDeviceEnrollment: Codable, Equatable, Sendable {
    public let deviceId: String
    public let deviceName: String
    public let refreshToken: String

    public init(deviceId: String, deviceName: String, refreshToken: String) {
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.refreshToken = refreshToken
    }
}

public struct IRPClientState: Equatable, Sendable {
    public let enrolled: Bool
    public let deviceId: String?
    public let deviceName: String?
    public let connection: IRPConnectionState
    public let policy: IRPPolicy
    public let snapshot: IRPNetworkSnapshot?
    public let analytics: IRPAnalyticsSummary?
    public let revision: UInt64

    public init(
        enrolled: Bool = false,
        deviceId: String? = nil,
        deviceName: String? = nil,
        connection: IRPConnectionState = .unknown,
        policy: IRPPolicy = IRPPolicy(),
        snapshot: IRPNetworkSnapshot? = nil,
        analytics: IRPAnalyticsSummary? = nil,
        revision: UInt64 = 0
    ) {
        self.enrolled = enrolled
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.connection = connection
        self.policy = policy
        self.snapshot = snapshot
        self.analytics = analytics
        self.revision = revision
    }
}
