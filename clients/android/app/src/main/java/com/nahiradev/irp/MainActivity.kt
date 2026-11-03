package com.nahiradev.irp

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
            var snapshot by remember { mutableStateOf(diagnostics.snapshot()) }
            val state by session.state.collectAsStateCompat()
            val scope = rememberCoroutineScope()

            MaterialTheme {
                Column(
                    modifier = Modifier.fillMaxSize().padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text("Internet Resilience Platform", style = MaterialTheme.typography.headlineSmall)
                    Text("Android Full Client", style = MaterialTheme.typography.titleMedium)

                    StatusCard(snapshot)

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
                    }

                    Button(onClick = { snapshot = diagnostics.snapshot() }, modifier = Modifier.fillMaxWidth()) {
                        Text("Refresh diagnostics")
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusCard(snapshot: NetworkSnapshot) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Network status", style = MaterialTheme.typography.titleMedium)
            Text("Connection: ${snapshot.connection}")
            Text("Interfaces: ${snapshot.interfaceCount}")
            Text("Default route: ${if (snapshot.defaultRouteAvailable) "available" else "unavailable"}")
            Text("DNS validated: ${if (snapshot.dnsReachable) "yes" else "no"}")
            Text("Captured: ${snapshot.capturedAt}")
        }
    }
}
