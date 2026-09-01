package com.nahiradev.irp

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private class PersistedTokenStore : SecureTokenStore {
    private var token: String? = null
    override fun read() = token
    override fun write(token: String) { this.token = token }
    override fun remove() { token = null }
}

class SessionRestoreTest {
    @Test
    fun restoreRequiresBothCredentialAndIdentity() = runTest {
        val tokenStore = PersistedTokenStore()
        val identityStore = InMemoryIdentityStore()
        val session = ClientSession(FakeRestoreControlPlane(), tokenStore, identityStore)

        tokenStore.write("refresh-token")
        identityStore.write("android-1", "Pixel test")

        assertTrue(session.restoreSession())
        assertEquals("android-1", session.state.value.deviceId)
        assertEquals("Pixel test", session.state.value.deviceName)
    }

    @Test
    fun signOutClearsIdentity() = runTest {
        val tokenStore = PersistedTokenStore()
        val identityStore = InMemoryIdentityStore()
        val session = ClientSession(FakeRestoreControlPlane(), tokenStore, identityStore)
        session.enroll("Pixel test")
        session.signOut()

        assertEquals(null, identityStore.readDeviceId())
        assertEquals(null, identityStore.readDeviceName())
    }
}

private class FakeRestoreControlPlane : ControlPlaneClient {
    override suspend fun enroll(deviceName: String) = DeviceEnrollment("android-1", deviceName, "refresh-token")
    override suspend fun snapshot(deviceId: String) = NetworkSnapshot(
        ConnectionState.ONLINE, 1, true, true, java.time.Instant.EPOCH,
    )
    override suspend fun analytics(deviceId: String) = AnalyticsSummary(1, 100.0, 10.0, 0.0)
    override suspend fun setPolicy(deviceId: String, policy: Policy) = policy
}
