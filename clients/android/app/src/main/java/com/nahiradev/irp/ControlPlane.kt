package com.nahiradev.irp

interface ControlPlaneClient {
    suspend fun enroll(deviceName: String): DeviceEnrollment
    suspend fun snapshot(deviceId: String): NetworkSnapshot
    suspend fun analytics(deviceId: String): AnalyticsSummary
    suspend fun setPolicy(deviceId: String, policy: Policy): Policy
}

/**
 * Deterministic local implementation for previews/tests. Production transports
 * are injected behind ControlPlaneClient and remain the authority for policy.
 */
class UnconfiguredControlPlaneClient : ControlPlaneClient {
    override suspend fun enroll(deviceName: String): DeviceEnrollment =
        error("No Control Plane transport configured")

    override suspend fun snapshot(deviceId: String): NetworkSnapshot =
        error("No Control Plane transport configured")

    override suspend fun analytics(deviceId: String): AnalyticsSummary =
        error("No Control Plane transport configured")

    override suspend fun setPolicy(deviceId: String, policy: Policy): Policy =
        error("No Control Plane transport configured")
}
