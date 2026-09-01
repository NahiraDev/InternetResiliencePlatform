package com.nahiradev.irp

import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The network/tunnel boundary for Phase 68. The Control Plane remains the
 * authority for policy; this layer only owns Android VPN lifecycle.
 */
data class VpnTunnelConfig(
    val address: String,
    val prefixLength: Int,
    val route: String,
    val routePrefixLength: Int,
    val dnsServer: String? = null,
) {
    init {
        require(address.isNotBlank())
        require(prefixLength in 1..32)
        require(route.isNotBlank())
        require(routePrefixLength in 0..32)
    }
}

enum class VpnTunnelState { STOPPED, STARTING, RUNNING, FAILED }

interface VpnTunnelController {
    val state: StateFlow<VpnTunnelState>
    fun start(context: Context, config: VpnTunnelConfig)
    fun stop(context: Context)
}

class AndroidVpnTunnelController : VpnTunnelController {
    private val _state = MutableStateFlow(VpnTunnelState.STOPPED)
    override val state: StateFlow<VpnTunnelState> = _state.asStateFlow()

    override fun start(context: Context, config: VpnTunnelConfig) {
        _state.value = VpnTunnelState.STARTING
        val intent = Intent(context, IrpVpnService::class.java)
            .setAction(IrpVpnService.ACTION_START)
            .putExtra(IrpVpnService.EXTRA_ADDRESS, config.address)
            .putExtra(IrpVpnService.EXTRA_PREFIX, config.prefixLength)
            .putExtra(IrpVpnService.EXTRA_ROUTE, config.route)
            .putExtra(IrpVpnService.EXTRA_ROUTE_PREFIX, config.routePrefixLength)
            .putExtra(IrpVpnService.EXTRA_DNS, config.dnsServer)
        context.startService(intent)
    }

    override fun stop(context: Context) {
        context.startService(Intent(context, IrpVpnService::class.java).setAction(IrpVpnService.ACTION_STOP))
        _state.value = VpnTunnelState.STOPPED
    }

    internal fun markRunning() { _state.value = VpnTunnelState.RUNNING }
    internal fun markFailed() { _state.value = VpnTunnelState.FAILED }
}

class IrpVpnService : VpnService() {
    private var tunnel: ParcelFileDescriptor? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startTunnel(intent)
            ACTION_STOP -> stopTunnel()
        }
        return Service.START_NOT_STICKY
    }

    private fun startTunnel(intent: Intent) {
        stopTunnel()
        val address = intent.getStringExtra(EXTRA_ADDRESS) ?: return
        val prefix = intent.getIntExtra(EXTRA_PREFIX, 0)
        val route = intent.getStringExtra(EXTRA_ROUTE) ?: return
        val routePrefix = intent.getIntExtra(EXTRA_ROUTE_PREFIX, 0)
        val dns = intent.getStringExtra(EXTRA_DNS)

        runCatching {
            val builder = Builder()
                .setSession("IRP")
                .addAddress(address, prefix)
                .addRoute(route, routePrefix)
            if (!dns.isNullOrBlank()) builder.addDnsServer(dns)
            tunnel = builder.establish() ?: error("Android refused VPN establishment")
        }
    }

    private fun stopTunnel() {
        tunnel?.close()
        tunnel = null
        stopSelf()
    }

    override fun onDestroy() {
        tunnel?.close()
        tunnel = null
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "com.nahiradev.irp.action.START_VPN"
        const val ACTION_STOP = "com.nahiradev.irp.action.STOP_VPN"
        const val EXTRA_ADDRESS = "address"
        const val EXTRA_PREFIX = "prefix"
        const val EXTRA_ROUTE = "route"
        const val EXTRA_ROUTE_PREFIX = "routePrefix"
        const val EXTRA_DNS = "dns"
    }
}
