package com.nahiradev.irp

import android.content.Context
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
        val tokenStore = AndroidKeyStoreTokenStore(this)
        val client = HttpControlPlaneClient.create(this, tokenStore)
        val session = ClientSession(
            client,
            tokenStore,
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

                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Client", style = MaterialTheme.typography.titleMedium)
                            Text(if (state.enrolled) "Enrolled: ${state.deviceName}" else "Not enrolled")

                            // Auth status row
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Authenticated")
                                Switch(
                                    checked = client.isAuthenticated(),
                                    enabled = false,
                                    onCheckedChange = {},
                                )
                            }

                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Autonomous mode")
                                Switch(
                                    checked = state.policy.autonomousMode,
                                    enabled = state.enrolled && client.isAuthenticated(),
                                    onCheckedChange = { enabled ->
                                        scope.launch { runCatching { session.setAutonomousMode(enabled) } }
                                    },
                                )
                            }

                            Button(
                                onClick = { scope.launch { runCatching { client.refresh() } } },
                                enabled = !state.enrolled,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Refresh token")
                            }
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
