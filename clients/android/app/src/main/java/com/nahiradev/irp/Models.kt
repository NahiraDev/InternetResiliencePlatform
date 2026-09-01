package com.nahiradev.irp

import java.time.Instant

enum class ConnectionState { UNKNOWN, ONLINE, DEGRADED, OFFLINE }

data class NetworkSnapshot(
    val connection: ConnectionState,
    val interfaceCount: Int,
    val defaultRouteAvailable: Boolean,
    val dnsReachable: Boolean,
    val capturedAt: Instant,
)

data class Policy(val autonomousMode: Boolean = false)

data class AnalyticsSummary(
    val sampleCount: Int,
    val availabilityPercent: Double,
    val medianLatencyMs: Double?,
    val packetLossPercent: Double?,
)

data class DeviceEnrollment(
    val deviceId: String,
    val deviceName: String,
    val refreshToken: String,
)

data class ClientState(
    val enrolled: Boolean = false,
    val deviceId: String? = null,
    val deviceName: String? = null,
    val connection: ConnectionState = ConnectionState.UNKNOWN,
    val policy: Policy = Policy(),
    val snapshot: NetworkSnapshot? = null,
    val analytics: AnalyticsSummary? = null,
    val revision: Long = 0,
)
