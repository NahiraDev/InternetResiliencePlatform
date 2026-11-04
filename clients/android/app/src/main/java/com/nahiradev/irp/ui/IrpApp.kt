package com.nahiradev.irp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nahiradev.irp.ClientState
import com.nahiradev.irp.NetworkSnapshot

enum class IrpTab(val title: String, val glyph: String) {
    OVERVIEW("Overview", "◈"),
    NETWORK("Network", "⌁"),
    SECURITY("Security", "⬡"),
    DIAGNOSTICS("Diagnostics", "▦"),
}

/**
 * The Android dashboard. It renders only what [ClientState] and the on-device [NetworkSnapshot]
 * contain, and every control calls an existing action: refresh diagnostics, sync (when enrolled),
 * toggle autonomous mode (when enrolled) and sign out (when enrolled).
 */
@Composable
fun IrpDashboard(
    state: ClientState,
    snapshot: NetworkSnapshot?,
    loading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    onSync: () -> Unit,
    onAutonomousModeChange: (Boolean) -> Unit,
    onSignOut: () -> Unit,
    onDismissError: () -> Unit,
) {
    var tabIndex by rememberSaveable { mutableIntStateOf(0) }
    val tabs = IrpTab.values()
    val tab = tabs[tabIndex.coerceIn(0, tabs.size - 1)]

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                tabs.forEachIndexed { index, item ->
                    NavigationBarItem(
                        selected = index == tabIndex,
                        onClick = { tabIndex = index },
                        icon = { Text(item.glyph) },
                        label = { Text(item.title) },
                    )
                }
            }
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.TopCenter) {
            Column(
                modifier = Modifier
                    .widthIn(max = 640.dp)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Header(tab = tab, loading = loading, onRefresh = onRefresh)
                if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                if (error != null) ErrorBanner(message = error, onRetry = onRefresh, onDismiss = onDismissError)
                when (tab) {
                    IrpTab.OVERVIEW -> OverviewTab(state, snapshot, loading, onRefresh, onSync)
                    IrpTab.NETWORK -> NetworkTab(state, snapshot)
                    IrpTab.SECURITY -> SecurityTab(state, onAutonomousModeChange, onSignOut)
                    IrpTab.DIAGNOSTICS -> DiagnosticsTab(state, snapshot)
                }
            }
        }
    }
}

@Composable
private fun Header(tab: IrpTab, loading: Boolean, onRefresh: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Eyebrow("Internet Resilience")
            Text(tab.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
        }
        TextButton(onClick = onRefresh, enabled = !loading, modifier = Modifier.heightIn(min = 48.dp)) { Text("Refresh") }
    }
}

@Composable
private fun OverviewTab(state: ClientState, snapshot: NetworkSnapshot?, loading: Boolean, onRefresh: () -> Unit, onSync: () -> Unit) {
    if (snapshot == null) {
        EmptyState(
            title = if (loading) "Reading network state…" else "No network snapshot",
            message = if (loading) "Asking Android for the current connection." else "Android did not return network information. Refresh to try again.",
        )
        if (!loading) Button(onClick = onRefresh, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Refresh diagnostics") }
        return
    }
    val connection = connectionPresentation(snapshot.connection)
    IrpCard {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("CONNECTION", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            StatusPill(connection)
        }
        Text(connection.label, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        Text(
            "Captured ${formatCaptured(snapshot.capturedAt)} (${formatAge(snapshot.capturedAt)})",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        MetricCard("Interfaces", formatCount(snapshot.interfaceCount), "Networks Android sees", Modifier.weight(1f))
        MetricCard("Default route", if (snapshot.defaultRouteAvailable) "Available" else "Unavailable", "Active network", Modifier.weight(1f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        MetricCard("DNS validated", if (snapshot.dnsReachable) "Yes" else "No", "Android's connectivity check", Modifier.weight(1f))
        MetricCard("Device", if (state.enrolled) "Enrolled" else "Not enrolled", state.deviceName ?: "No Control Plane identity", Modifier.weight(1f))
    }
    if (state.enrolled) {
        OutlinedButton(onClick = onSync, enabled = !loading, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text("Sync with Control Plane")
        }
    }
}

@Composable
private fun NetworkTab(state: ClientState, snapshot: NetworkSnapshot?) {
    SectionTitle("Connectivity")
    if (snapshot == null) {
        EmptyState("No network snapshot", "Refresh to read the current connection from Android.")
    } else {
        IrpCard {
            CheckRow("Connection", connectionPresentation(snapshot.connection))
            CheckRow("Default route", checkPresentation(snapshot.defaultRouteAvailable, "Available", "Unavailable", StatusTone.DANGER))
            CheckRow("DNS validated", checkPresentation(snapshot.dnsReachable, "Validated", "Not validated"))
            KeyValueRow("Interfaces", formatCount(snapshot.interfaceCount))
        }
    }

    SectionTitle("Performance")
    val analytics = state.analytics
    if (analytics == null) {
        EmptyState(
            title = "No performance data",
            message = "Availability, latency and packet loss are reported by the IRP Control Plane after this device syncs. None has been received.",
        )
    } else {
        IrpCard { performanceRows(analytics).forEach { KeyValueRow(it.name, it.value) } }
    }

    SectionTitle("Tunnel")
    IrpCard {
        CheckRow("VPN tunnel", StatusPresentation(StatusTone.UNKNOWN, "Not configured"))
        Text(
            "No tunnel is configured on this device. Tunnel setup, gateway selection and failover are provided by the IRP Control Plane.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SecurityTab(state: ClientState, onAutonomousModeChange: (Boolean) -> Unit, onSignOut: () -> Unit) {
    SectionTitle("Device")
    IrpCard {
        CheckRow("Enrollment", if (state.enrolled) StatusPresentation(StatusTone.OK, "Enrolled") else StatusPresentation(StatusTone.UNKNOWN, "Not enrolled"))
        KeyValueRow("Device name", state.deviceName ?: NOT_REPORTED)
        KeyValueRow("Device ID", state.deviceId ?: NOT_REPORTED)
    }

    SectionTitle("Automation")
    IrpCard {
        val enabled = state.policy.autonomousMode
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .toggleable(
                    value = enabled,
                    enabled = state.enrolled,
                    role = Role.Switch,
                    onValueChange = onAutonomousModeChange,
                ),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Autonomous mode", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    if (!state.enrolled) "Enroll this device to change policy." else if (enabled) "The Control Plane may act on this device." else "Observe and advise only.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = enabled, onCheckedChange = null, enabled = state.enrolled)
        }
    }

    SectionTitle("Security boundary")
    IrpCard {
        Text(
            "Routing, DNS, gateway selection and failover decisions remain in the IRP Control Plane. This app reads Android's connection state and requests policy changes explicitly.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    if (state.enrolled) {
        OutlinedButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Sign out of this device") }
    }
}

@Composable
private fun DiagnosticsTab(state: ClientState, snapshot: NetworkSnapshot?) {
    SectionTitle("Snapshot")
    if (snapshot == null) {
        EmptyState("No network snapshot", "Refresh to read the current connection from Android.")
    } else {
        IrpCard {
            KeyValueRow("Connection", connectionPresentation(snapshot.connection).label)
            KeyValueRow("Interfaces", formatCount(snapshot.interfaceCount))
            KeyValueRow("Default route", if (snapshot.defaultRouteAvailable) "Available" else "Unavailable")
            KeyValueRow("DNS validated", if (snapshot.dnsReachable) "Yes" else "No")
            KeyValueRow("Captured", formatCaptured(snapshot.capturedAt))
            KeyValueRow("Age", formatAge(snapshot.capturedAt))
        }
    }
    SectionTitle("Client")
    IrpCard {
        KeyValueRow("Session revision", state.revision.toString())
        KeyValueRow("Control Plane connection", connectionPresentation(state.connection).label)
        KeyValueRow("Last synced analytics", if (state.analytics == null) "Never" else "Received")
    }
}
