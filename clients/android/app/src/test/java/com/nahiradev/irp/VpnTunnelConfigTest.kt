package com.nahiradev.irp

import org.junit.Assert.assertEquals
import org.junit.Test

class VpnTunnelConfigTest {
    @Test
    fun acceptsValidIpv4TunnelConfiguration() {
        val config = VpnTunnelConfig(
            address = "10.8.0.2",
            prefixLength = 24,
            route = "0.0.0.0",
            routePrefixLength = 0,
            remoteEndpoint = "198.51.100.10:51820",
            dnsServer = "1.1.1.1",
        )

        assertEquals("10.8.0.2", config.address)
        assertEquals(24, config.prefixLength)
        assertEquals(0, config.routePrefixLength)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsInvalidPrefix() {
        VpnTunnelConfig(
            address = "10.8.0.2",
            prefixLength = 33,
            route = "0.0.0.0",
            routePrefixLength = 0,
            remoteEndpoint = "198.51.100.10:51820",
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBlankRoute() {
        VpnTunnelConfig(
            address = "10.8.0.2",
            prefixLength = 24,
            route = "",
            routePrefixLength = 0,
            remoteEndpoint = "198.51.100.10:51820",
        )
    }
}
