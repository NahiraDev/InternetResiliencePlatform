package com.nahiradev.irp

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class SessionError(message: String) : Exception(message) {
    data object NotEnrolled : SessionError("Client is not enrolled")
    data object InvalidEnrollment : SessionError("Control Plane returned invalid enrollment")
}

class ClientSession(
    private val client: ControlPlaneClient,
    private val tokenStore: SecureTokenStore,
    private val identityStore: IdentityStore = InMemoryIdentityStore(),
) {
    private val _state = MutableStateFlow(ClientState())
    val state: StateFlow<ClientState> = _state.asStateFlow()

    fun restoreSession(): Boolean {
        val token = tokenStore.read()
        val deviceId = identityStore.readDeviceId()
        val deviceName = identityStore.readDeviceName()
        if (token.isNullOrEmpty() || deviceId.isNullOrEmpty() || deviceName.isNullOrEmpty()) return false
        _state.value = _state.value.copy(
            enrolled = true,
            deviceId = deviceId,
            deviceName = deviceName,
            revision = _state.value.revision + 1,
        )
        return true
    }

    suspend fun enroll(deviceName: String) {
        val enrollment = client.enroll(deviceName)
        if (enrollment.deviceId.isBlank() || enrollment.deviceName.isBlank() || enrollment.refreshToken.isBlank()) {
            throw SessionError.InvalidEnrollment
        }
        tokenStore.write(enrollment.refreshToken)
        identityStore.write(enrollment.deviceId, enrollment.deviceName)
        _state.value = ClientState(
            enrolled = true,
            deviceId = enrollment.deviceId,
            deviceName = enrollment.deviceName,
            revision = _state.value.revision + 1,
        )
    }

    suspend fun refresh() {
        val deviceId = _state.value.deviceId ?: throw SessionError.NotEnrolled
        val snapshot = client.snapshot(deviceId)
        val analytics = client.analytics(deviceId)
        _state.value = _state.value.copy(
            connection = snapshot.connection,
            snapshot = snapshot,
            analytics = analytics,
            revision = _state.value.revision + 1,
        )
    }

    suspend fun setAutonomousMode(enabled: Boolean) {
        val deviceId = _state.value.deviceId ?: throw SessionError.NotEnrolled
        val policy = client.setPolicy(deviceId, Policy(enabled))
        _state.value = _state.value.copy(policy = policy, revision = _state.value.revision + 1)
    }

    fun signOut() {
        tokenStore.remove()
        identityStore.remove()
        _state.value = ClientState(revision = _state.value.revision + 1)
    }
}

class ClientViewModel(private val session: ClientSession) : ViewModel() {
    val state: StateFlow<ClientState> = session.state
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun refresh() = viewModelScope.launch {
        runCatching { session.refresh() }.onFailure { _error.value = it.message }
    }

    fun setAutonomousMode(enabled: Boolean) = viewModelScope.launch {
        runCatching { session.setAutonomousMode(enabled) }.onFailure { _error.value = it.message }
    }

    fun clearError() { _error.value = null }
}
