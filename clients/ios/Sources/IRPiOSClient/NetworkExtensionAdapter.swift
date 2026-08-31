import Foundation

#if canImport(NetworkExtension)
import NetworkExtension

public enum IRPNetworkExtensionError: Error, Equatable, Sendable {
    case transportUnavailable
    case invalidConfiguration
    case tunnelNotConfigured
}

public protocol IRPPacketTunnelTransport: AnyObject, Sendable {
    func start(configuration: IRPPacketTunnelConfiguration, packetFlow: NEPacketTunnelFlow) async throws
    func stop() async
}

public struct IRPNetworkExtensionSettingsFactory: Sendable {
    public init() {}

    public func makeSettings(_ configuration: IRPPacketTunnelConfiguration) -> NEPacketTunnelNetworkSettings {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: configuration.remoteAddress)
        let ipv4 = NEIPv4Settings(
            addresses: [configuration.localAddress],
            subnetMasks: [configuration.subnetMask]
        )
        ipv4.includedRoutes = configuration.includedRoutes.map {
            NEIPv4Route(destinationAddress: $0.destinationAddress, subnetMask: $0.subnetMask)
        }
        ipv4.excludedRoutes = configuration.excludedRoutes.map {
            NEIPv4Route(destinationAddress: $0.destinationAddress, subnetMask: $0.subnetMask)
        }
        settings.ipv4Settings = ipv4
        if !configuration.dnsServers.isEmpty {
            settings.dnsSettings = NEDNSSettings(servers: configuration.dnsServers)
        }
        settings.mtu = NSNumber(value: configuration.mtu)
        return settings
    }
}

public final class IRPPacketTunnelProvider: NEPacketTunnelProvider {
    public static let configurationKey = "irp.packetTunnel.configuration"

    private let settingsFactory = IRPNetworkExtensionSettingsFactory()
    private var transportTask: Task<Void, Never>?
    private var transport: (any IRPPacketTunnelTransport)?

    public override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        guard let configuration = Self.configuration(from: options) else {
            completionHandler(IRPNetworkExtensionError.invalidConfiguration)
            return
        }
        guard let transport else {
            completionHandler(IRPNetworkExtensionError.transportUnavailable)
            return
        }

        let settings = settingsFactory.makeSettings(configuration)
        setTunnelNetworkSettings(settings) { [weak self] error in
            guard let self else {
                completionHandler(error)
                return
            }
            guard error == nil else {
                completionHandler(error)
                return
            }

            self.transportTask = Task {
                do {
                    try await transport.start(configuration: configuration, packetFlow: self.packetFlow)
                } catch {
                    self.cancelTunnel(withError: error)
                }
            }
            completionHandler(nil)
        }
    }

    public override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        transportTask?.cancel()
        transportTask = nil
        guard let transport else {
            completionHandler()
            return
        }
        Task {
            await transport.stop()
            completionHandler()
        }
    }

    public override func handleAppMessage(
        _ messageData: Data,
        completionHandler: ((Data?) -> Void)? = nil
    ) {
        completionHandler?(Data("irp-ok".utf8))
    }

    private static func configuration(from options: [String: NSObject]?) -> IRPPacketTunnelConfiguration? {
        guard let data = options?[configurationKey] as? Data else { return nil }
        return try? JSONDecoder().decode(SerializableTunnelConfiguration.self, from: data).makeConfiguration()
    }
}

private struct SerializableTunnelConfiguration: Codable {
    let remoteAddress: String
    let localAddress: String
    let subnetMask: String
    let dnsServers: [String]
    let mtu: Int
    let includedRoutes: [IRPPacketRoute]
    let excludedRoutes: [IRPPacketRoute]

    func makeConfiguration() throws -> IRPPacketTunnelConfiguration {
        try IRPPacketTunnelConfiguration(
            remoteAddress: remoteAddress,
            localAddress: localAddress,
            subnetMask: subnetMask,
            dnsServers: dnsServers,
            mtu: mtu,
            includedRoutes: includedRoutes,
            excludedRoutes: excludedRoutes
        )
    }
}
#endif
