import Foundation

public struct IRPPacketRoute: Codable, Equatable, Sendable {
    public let destinationAddress: String
    public let subnetMask: String

    public init(destinationAddress: String, subnetMask: String) {
        self.destinationAddress = destinationAddress
        self.subnetMask = subnetMask
    }
}

public struct IRPPacketTunnelConfiguration: Codable, Equatable, Sendable {
    public let remoteAddress: String
    public let localAddress: String
    public let subnetMask: String
    public let dnsServers: [String]
    public let mtu: Int
    public let includedRoutes: [IRPPacketRoute]
    public let excludedRoutes: [IRPPacketRoute]

    public init(
        remoteAddress: String,
        localAddress: String,
        subnetMask: String,
        dnsServers: [String] = [],
        mtu: Int = 1_280,
        includedRoutes: [IRPPacketRoute] = [],
        excludedRoutes: [IRPPacketRoute] = []
    ) throws {
        guard !remoteAddress.isEmpty, !localAddress.isEmpty, !subnetMask.isEmpty else {
            throw IRPPacketTunnelConfigurationError.emptyAddress
        }
        guard mtu >= 1_280 && mtu <= 9_000 else {
            throw IRPPacketTunnelConfigurationError.invalidMTU(mtu)
        }
        guard dnsServers.allSatisfy({ !$0.isEmpty }) else {
            throw IRPPacketTunnelConfigurationError.emptyDNSServer
        }

        self.remoteAddress = remoteAddress
        self.localAddress = localAddress
        self.subnetMask = subnetMask
        self.dnsServers = dnsServers
        self.mtu = mtu
        self.includedRoutes = includedRoutes
        self.excludedRoutes = excludedRoutes
    }
}

public enum IRPPacketTunnelConfigurationError: Error, Equatable, Sendable {
    case emptyAddress
    case invalidMTU(Int)
    case emptyDNSServer
}
