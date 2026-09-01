package com.nahiradev.irp

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private class MemoryTokenStore : SecureTokenStore {
    var token: String? = null
    override fun read() = token
    override fun write(token: String) { this.token = token }
    override fun remove() { token = null }
}

private class FakeControlPlane : ControlPlaneClient {
    override suspend fun enroll(deviceName: String) = DeviceEnrollment("android-1", deviceName, "refresh-token")
    override suspend fun snapshot(deviceId: String) = NetworkSnapshot(
        ConnectionState.ONLINE, 1, true, true, java.time.Instant.EPOCH,
    )
    override suspend fun analytics(deviceId: String) = AnalyticsSummary(10, 99.0, 24.0, 0.1)
    override suspend fun setPolicy(deviceId: String, policy: Policy): Policy = policy
}

private class DenyingControlPlane : ControlPlaneClient {
    override suspend fun enroll(deviceName: String) = DeviceEnrollment("android-1", deviceName, "refresh-token")
    override suspend fun snapshot(deviceId: String) = NetworkSnapshot(
        ConnectionState.ONLINE, 1, true, true, java.time.Instant.EPOCH,
    )
    override suspend fun analytics(deviceId: String) = AnalyticsSummary(10, 99.0, 24.0, 0.1)
    override suspend fun setPolicy(deviceId: String, policy: Policy): Policy = error("denied")
}

class ClientSessionTest {
    @Test
    fun enrollmentStoresCredentialAndIdentity() = runTest {
        val store = MemoryTokenStore()
        val session = ClientSession(FakeControlPlane(), store)

        session.enroll("Pixel test")

        assertTrue(session.state.value.enrolled)
        assertEquals("android-1", session.state.value.deviceId)
        assertEquals("refresh-token", store.token)
    }

    @Test
    fun refreshPublishesSnapshotAndAnalyticsTogether() = runTest {
        val session = ClientSession(FakeControlPlane(), MemoryTokenStore())
        session.enroll("Pixel test")
        session.refresh()

        assertEquals(ConnectionState.ONLINE, session.state.value.connection)
        assertEquals(10, session.state.value.analytics?.sampleCount)
    }

    @Test
    fun failedPolicyDoesNotMutateLocalPolicy() = runTest {
        val session = ClientSession(DenyingControlPlane(), MemoryTokenStore())
        session.enroll("Pixel test")

        runCatching { session.setAutonomousMode(true) }

        assertEquals(false, session.state.value.policy.autonomousMode)
    }

    @Test
    fun signOutRemovesCredentialAndClearsEnrollment() = runTest {
        val store = MemoryTokenStore()
        val session = ClientSession(FakeControlPlane(), store)
        session.enroll("Pixel test")
        session.signOut()

        assertEquals(null, store.token)
        assertEquals(false, session.state.value.enrolled)
    }
}
