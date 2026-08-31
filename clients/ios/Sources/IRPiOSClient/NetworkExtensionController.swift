import Foundation

#if canImport(NetworkExtension)
import NetworkExtension

@MainActor
public final class IRPNetworkExtensionController: NSObject {
    public enum State: Equatable, Sendable {
        case unknown
        case disconnected
        case connecting
        case connected
        case disconnecting
        case failed
    }

    public private(set) var state: State = .unknown
    private let manager: NETunnelProviderManager

    public init(manager: NETunnelProviderManager = NETunnelProviderManager()) {
        self.manager = manager
        super.init()
    }

    public func load() async throws {
        try await manager.loadFromPreferences()
        state = manager.connection.status == .connected ? .connected : .disconnected
    }

    public func install(configuration: IRPPacketTunnelConfiguration, localizedDescription: String) async throws {
        let protocolConfiguration = NETunnelProviderProtocol()
        protocolConfiguration.providerBundleIdentifier = "com.nahiradev.irp.PacketTunnel"
        protocolConfiguration.serverAddress = configuration.remoteAddress
        protocolConfiguration.providerConfiguration = [
            IRPPacketTunnelConfigurationCoding.key: try IRPPacketTunnelConfigurationCoding.encode(configuration)
        ]
        protocolConfiguration.disconnectOnSleep = false

        manager.protocolConfiguration = protocolConfiguration
        manager.localizedDescription = localizedDescription
        manager.isEnabled = true
        try await manager.saveToPreferences()
        state = .disconnected
    }

    public func remove() async throws {
        manager.isEnabled = false
        try await manager.saveToPreferences()
        state = .disconnected
    }

    public func connect() async throws {
        guard manager.isEnabled else { throw IRPNetworkExtensionControllerError.notInstalled }
        state = .connecting
        do {
            try manager.connection.startVPNTunnel()
            state = .connected
        } catch {
            state = .failed
            throw error
        }
    }

    public func disconnect() {
        state = .disconnecting
        manager.connection.stopVPNTunnel()
        state = .disconnected
    }
}

public enum IRPNetworkExtensionControllerError: Error, Equatable, Sendable {
    case notInstalled
}

public enum IRPPacketTunnelConfigurationCoding {
    public static let key = "configuration"

    public static func encode(_ configuration: IRPPacketTunnelConfiguration) throws -> Data {
        try JSONEncoder().encode(configuration)
    }
}

extension IRPPacketTunnelConfiguration: Codable {}
#endif
