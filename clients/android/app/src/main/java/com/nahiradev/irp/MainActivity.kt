package com.nahiradev.irp

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val diagnostics = AndroidNetworkDiagnosticsAdapter(this)
        val session = ClientSession(UnconfiguredControlPlaneClient(), AndroidKeyStoreTokenStore(this))

        setContent {
            var snapshot by remember { mutableStateOf(diagnostics.snapshot()) }
            val state by session.state.collectAsStateCompat()

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
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Autonomous mode")
                                Switch(
                                    checked = state.policy.autonomousMode,
                                    enabled = state.enrolled,
                                    onCheckedChange = { enabled ->
                                        // Policy authority remains the Control Plane; this call is intentionally explicit.
                                        kotlinx.coroutines.MainScope().launch { session.setAutonomousMode(enabled) }
                                    },
                                )
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

@Composable
private fun <T> androidx.compose.runtime.State<T>.collectAsStateCompat(): androidx.compose.runtime.State<T> = this
