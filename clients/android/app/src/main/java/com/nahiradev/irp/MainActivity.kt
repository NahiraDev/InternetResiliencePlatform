package com.nahiradev.irp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.nahiradev.irp.ui.IrpDashboard
import com.nahiradev.irp.ui.IrpTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val diagnostics = AndroidNetworkDiagnosticsAdapter(this)
        val session = ClientSession(
            UnconfiguredControlPlaneClient(),
            AndroidKeyStoreTokenStore(this),
            AndroidIdentityStore(this),
        )
        session.restoreSession()

        setContent {
            var snapshot by remember { mutableStateOf<NetworkSnapshot?>(null) }
            var loading by remember { mutableStateOf(true) }
            var error by remember { mutableStateOf<String?>(null) }
            val state by session.state.collectAsStateCompat()
            val scope = rememberCoroutineScope()

            fun captureSnapshot() {
                loading = true
                runCatching { diagnostics.snapshot() }
                    .onSuccess {
                        snapshot = it
                        error = null
                    }
                    .onFailure { error = it.message ?: "Android could not read the network state." }
                loading = false
            }

            LaunchedEffect(Unit) { captureSnapshot() }

            IrpTheme {
                IrpDashboard(
                    state = state,
                    snapshot = snapshot,
                    loading = loading,
                    error = error,
                    onRefresh = { captureSnapshot() },
                    onSync = {
                        scope.launch {
                            loading = true
                            runCatching { session.refresh() }
                                .onSuccess { error = null }
                                .onFailure { error = it.message ?: "Sync with the Control Plane failed." }
                            loading = false
                        }
                    },
                    onAutonomousModeChange = { enabled ->
                        scope.launch {
                            runCatching { session.setAutonomousMode(enabled) }
                                .onFailure { error = it.message ?: "The policy change was not accepted." }
                        }
                    },
                    onSignOut = { session.signOut() },
                    onDismissError = { error = null },
                )
            }
        }
    }
}
