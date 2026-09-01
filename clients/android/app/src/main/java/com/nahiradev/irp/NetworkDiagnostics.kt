package com.nahiradev.irp

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import java.time.Instant

interface NetworkDiagnosticsAdapter {
    fun snapshot(): NetworkSnapshot
}

class AndroidNetworkDiagnosticsAdapter(context: Context) : NetworkDiagnosticsAdapter {
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)

    override fun snapshot(): NetworkSnapshot {
        val networks = connectivity.allNetworks
        val active = connectivity.activeNetwork
        val capabilities = active?.let(connectivity::getNetworkCapabilities)
        val hasInternet = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        val validated = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
        val connection = when {
            validated -> ConnectionState.ONLINE
            hasInternet -> ConnectionState.DEGRADED
            else -> ConnectionState.OFFLINE
        }
        return NetworkSnapshot(
            connection = connection,
            interfaceCount = networks.size,
            defaultRouteAvailable = active != null,
            dnsReachable = validated,
            capturedAt = Instant.now(),
        )
    }
}
