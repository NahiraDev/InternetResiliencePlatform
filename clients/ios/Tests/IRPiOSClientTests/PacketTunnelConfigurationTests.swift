import XCTest
@testable import IRPiOSClient

final class PacketTunnelConfigurationTests: XCTestCase {
    func testAcceptsValidConfigurationAndPreservesRoutes() throws {
        let configuration = try IRPPacketTunnelConfiguration(
            remoteAddress: "192.0.2.10",
            localAddress: "10.42.0.2",
            subnetMask: "255.255.255.0",
            dnsServers: ["1.1.1.1", "9.9.9.9"],
            mtu: 1_420,
            includedRoutes: [IRPPacketRoute(destinationAddress: "0.0.0.0", subnetMask: "0.0.0.0")],
            excludedRoutes: [IRPPacketRoute(destinationAddress: "10.0.0.0", subnetMask: "255.0.0.0")]
        )

        XCTAssertEqual(configuration.mtu, 1_420)
        XCTAssertEqual(configuration.dnsServers, ["1.1.1.1", "9.9.9.9"])
        XCTAssertEqual(configuration.includedRoutes.count, 1)
        XCTAssertEqual(configuration.excludedRoutes.count, 1)
    }

    func testRejectsEmptyAddresses() {
        XCTAssertThrowsError(
            try IRPPacketTunnelConfiguration(
                remoteAddress: "",
                localAddress: "10.42.0.2",
                subnetMask: "255.255.255.0"
            )
        ) { error in
            XCTAssertEqual(error as? IRPPacketTunnelConfigurationError, .emptyAddress)
        }
    }

    func testRejectsMTUOutsideBound() {
        XCTAssertThrowsError(
            try IRPPacketTunnelConfiguration(
                remoteAddress: "192.0.2.10",
                localAddress: "10.42.0.2",
                subnetMask: "255.255.255.0",
                mtu: 1_279
            )
        ) { error in
            XCTAssertEqual(error as? IRPPacketTunnelConfigurationError, .invalidMTU(1_279))
        }
    }

    func testRejectsEmptyDNSServerEntry() {
        XCTAssertThrowsError(
            try IRPPacketTunnelConfiguration(
                remoteAddress: "192.0.2.10",
                localAddress: "10.42.0.2",
                subnetMask: "255.255.255.0",
                dnsServers: ["1.1.1.1", ""]
            )
        ) { error in
            XCTAssertEqual(error as? IRPPacketTunnelConfigurationError, .emptyDNSServer)
        }
    }
}
