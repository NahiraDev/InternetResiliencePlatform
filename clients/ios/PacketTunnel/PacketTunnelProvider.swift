import Foundation
import NetworkExtension

private enum PacketTunnelError: Error, Equatable {
    case invalidConfiguration
    case transportUnavailable
}

private struct SerializableTunnelConfiguration: Codable {
    let remoteAddress: String
    let localAddress: String
    let subnetMask: String
    let dnsServers: [String]
    let mtu: Int
    let includedRoutes: [SerializableRoute]
    let excludedRoutes: [SerializableRoute]

    func makeConfiguration() throws -> TunnelConfiguration {
        guard !remoteAddress.isEmpty, !localAddress.isEmpty, !subnetMask.isEmpty else {
            throw PacketTunnelError.invalidConfiguration
        }
        guard mtu >= 1_280 && mtu <= 9_000 else {
            throw PacketTunnelError.invalidConfiguration
        }
        return TunnelConfiguration(
            remoteAddress: remoteAddress,
            localAddress: localAddress,
            subnetMask: subnetMask,
            dnsServers: dnsServers,
            mtu: mtu,
            includedRoutes: includedRoutes.map { ($0.destinationAddress, $0.subnetMask) },
            excludedRoutes: excludedRoutes.map { ($0.destinationAddress, $0.subnetMask) }
        )
    }
}

private struct SerializableRoute: Codable {
    let destinationAddress: String
    let subnetMask: String
}

private struct TunnelConfiguration {
    let remoteAddress: String
    let localAddress: String
    let subnetMask: String
    let dnsServers: [String]
    let mtu: Int
    let includedRoutes: [(String, String)]
    let excludedRoutes: [(String, String)]
}

final class IRPPacketTunnelProvider: NEPacketTunnelProvider {
    private var transportTask: Task<Void, Never>?

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        guard let configuration = configurationFromProtocol() else {
            completionHandler(PacketTunnelError.invalidConfiguration)
            return
        }

        let settings = makeNetworkSettings(configuration)
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
                    try await self.runTransport(configuration: configuration)
                    completionHandler(nil)
                } catch {
                    completionHandler(error)
                    self.cancelTunnel(with: .failed)
                }
            }
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        transportTask?.cancel()
        transportTask = nil
        completionHandler()
    }

    override func handleAppMessage(
        _ messageData: Data,
        completionHandler: ((Data?) -> Void)? = nil
    ) {
        completionHandler?(Data("irp-ok".utf8))
    }

    private func configurationFromProtocol() -> TunnelConfiguration? {
        guard
            let protocolConfiguration = protocolConfiguration as? NETunnelProviderProtocol,
            let providerConfiguration = protocolConfiguration.providerConfiguration,
            let data = providerConfiguration["configuration"] as? Data,
            let decoded = try? JSONDecoder().decode(SerializableTunnelConfiguration.self, from: data),
            let configuration = try? decoded.makeConfiguration()
        else {
            return nil
        }
        return configuration
    }

    private func makeNetworkSettings(_ configuration: TunnelConfiguration) -> NEPacketTunnelNetworkSettings {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: configuration.remoteAddress)
        let ipv4 = NEIPv4Settings(
            addresses: [configuration.localAddress],
            subnetMasks: [configuration.subnetMask]
        )
        ipv4.includedRoutes = configuration.includedRoutes.map {
            NEIPv4Route(destinationAddress: $0.0, subnetMask: $0.1)
        }
        ipv4.excludedRoutes = configuration.excludedRoutes.map {
            NEIPv4Route(destinationAddress: $0.0, subnetMask: $0.1)
        }
        settings.ipv4Settings = ipv4
        if !configuration.dnsServers.isEmpty {
            settings.dnsSettings = NEDNSSettings(servers: configuration.dnsServers)
        }
        settings.mtu = NSNumber(value: configuration.mtu)
        return settings
    }

    private func runTransport(configuration: TunnelConfiguration) async throws {
        _ = configuration
        try Task.checkCancellation()
        throw PacketTunnelError.transportUnavailable
    }
}
