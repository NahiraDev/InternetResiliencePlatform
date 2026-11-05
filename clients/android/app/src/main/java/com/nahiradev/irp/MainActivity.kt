package com.nahiradev.irp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nahiradev.irp.ui.CheckRow
import com.nahiradev.irp.ui.EmptyState
import com.nahiradev.irp.ui.ErrorBanner
import com.nahiradev.irp.ui.IrpCard
import com.nahiradev.irp.ui.IrpTheme
import com.nahiradev.irp.ui.KeyValueRow
import com.nahiradev.irp.ui.SectionTitle
import com.nahiradev.irp.ui.StatusPill
import com.nahiradev.irp.ui.connectionPresentation
import com.nahiradev.irp.ui.checkPresentation
import com.nahiradev.irp.ui.formatCount
import com.nahiradev.irp.ui.formatLatency
import com.nahiradev.irp.ui.formatPercent
import com.nahiradev.irp.ui.performanceRows
import com.nahiradev.irp.ui.StatusTone
import com.nahiradev.irp.ui.StatusPresentation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val diagnostics = AndroidNetworkDiagnosticsAdapter(this)
        val tokenStore = AndroidKeyStoreTokenStore(this)
        // The Control Plane base URL is configured via res/values/strings.xml (or
        // build config). It is required: HttpControlPlaneClient.create fails fast
        // with a clear error when blank, so the app never silently connects to
        // localhost.
        val baseUrl = resources.getString(R.string.irp_control_plane_base_url).trim()
        val client = HttpControlPlaneClient.create(this, tokenStore, baseUrl)
        val session = ClientSession(
            client,
            tokenStore,
            AndroidIdentityStore(this),
        )
        session.restoreSession()

        setContent {
            IrpTheme {
                MainScreen(
                    client = client,
                    session = session,
                    diagnostics = diagnostics,
                )
            }
        }
    }
}

@Composable
fun MainScreen(
    client: HttpControlPlaneClient,
    session: ClientSession,
    diagnostics: AndroidNetworkDiagnosticsAdapter,
) {
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

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SectionTitle("Client")

        IrpCard {
            if (state.enrolled) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    KeyValueRow("Device name", state.deviceName ?: "")
                    CheckRow(
                        name = "Authenticated",
                        status = checkPresentation(
                            client.isAuthenticated(),
                            "Yes",
                            "No",
                            StatusTone.DANGER,
                        ),
                    )
                    CheckRow(
                        name = "Autonomous mode",
                        status = checkPresentation(
                            state.policy.autonomousMode,
                            "Enabled",
                            "Disabled",
                            StatusTone.WARN,
                        ),
                    )
                }
            } else {
                EmptyState(
                    title = "Not enrolled",
                    message = "Enroll this device to access the control plane.",
                )
            }
        }

        if (!state.enrolled) {
            IrpCard {
                Button(
                    onClick = { scope.launch { runCatching { client.refresh() } } },
                    enabled = true,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Refresh token")
                }
            }
        }

        // Network diagnostics
        snapshot?.let { snap ->
            SectionTitle("Network")
            IrpCard {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CheckRow(
                        name = "Connection",
                        status = connectionPresentation(snap.connection),
                    )
                    CheckRow(
                        name = "Default route",
                        status = checkPresentation(
                            snap.defaultRouteAvailable,
                            "Available",
                            "Missing",
                            StatusTone.DANGER,
                        ),
                    )
                    CheckRow(
                        name = "DNS reachable",
                        status = checkPresentation(
                            snap.dnsReachable,
                            "Reachable",
                            "Unreachable",
                            StatusTone.DANGER,
                        ),
                    )
                    if (snap.interfaceCount > 0) {
                        KeyValueRow("Interfaces", formatCount(snap.interfaceCount))
                    }
                }
            }
        }

        // Error banner
        error?.let { msg ->
            ErrorBanner(
                message = msg,
                onRetry = { captureSnapshot() },
                onDismiss = { error = null },
            )
        }
    }
}