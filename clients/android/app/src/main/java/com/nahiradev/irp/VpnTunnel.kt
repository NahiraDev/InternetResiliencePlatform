package com.nahiradev.irp

import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Android execution adapter. Gateway selection, routing policy and failover remain in Core/Control Plane. */
data class VpnTunnelConfig(
    val address: String,
    val prefixLength: Int,
    val route: String,
    val routePrefixLength: Int,
    val remoteEndpoint: String,
    val mtu: Int = 1500,
    val dnsServer: String? = null,
) {
    init {
        require(address.isNotBlank()) { "virtual address is required" }
        require(prefixLength in 1..32) { "IPv4 prefix must be 1..32" }
        require(route.isNotBlank()) { "route is required" }
        require(routePrefixLength in 0..32) { "route prefix must be 0..32" }
        require(remoteEndpoint.isNotBlank()) { "remote endpoint is required" }
        require(mtu in 576..1500) { "MTU must be between 576 and 1500" }
    }
}

enum class VpnTunnelState { STOPPED, STARTING, RUNNING, FAILED }

/**
 * Concrete packet forwarding is deliberately injected. Android must never
 * establish a black-hole VPN when no authorized transport is available.
 */
interface PacketForwardingTransport {
    fun start(tun: ParcelFileDescriptor, config: VpnTunnelConfig): Boolean
    fun stop()
}

class UnavailablePacketForwardingTransport : PacketForwardingTransport {
    override fun start(tun: ParcelFileDescriptor, config: VpnTunnelConfig): Boolean = false
    override fun stop() = Unit
}

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
        context.startService(
            Intent(context, IrpVpnService::class.java)
                .setAction(IrpVpnService.ACTION_START)
                .putExtra(IrpVpnService.EXTRA_ADDRESS, config.address)
                .putExtra(IrpVpnService.EXTRA_PREFIX, config.prefixLength)
                .putExtra(IrpVpnService.EXTRA_ROUTE, config.route)
                .putExtra(IrpVpnService.EXTRA_ROUTE_PREFIX, config.routePrefixLength)
                .putExtra(IrpVpnService.EXTRA_ENDPOINT, config.remoteEndpoint)
                .putExtra(IrpVpnService.EXTRA_MTU, config.mtu)
                .putExtra(IrpVpnService.EXTRA_DNS, config.dnsServer),
        )
    }

    override fun stop(context: Context) {
        context.startService(Intent(context, IrpVpnService::class.java).setAction(IrpVpnService.ACTION_STOP))
        _state.value = VpnTunnelState.STOPPED
    }
}

class IrpVpnService(
    private val transport: PacketForwardingTransport = UnavailablePacketForwardingTransport(),
) : VpnService() {
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
        val config = runCatching {
            VpnTunnelConfig(
                address = intent.getStringExtra(EXTRA_ADDRESS).orEmpty(),
                prefixLength = intent.getIntExtra(EXTRA_PREFIX, 0),
                route = intent.getStringExtra(EXTRA_ROUTE).orEmpty(),
                routePrefixLength = intent.getIntExtra(EXTRA_ROUTE_PREFIX, -1),
                remoteEndpoint = intent.getStringExtra(EXTRA_ENDPOINT).orEmpty(),
                mtu = intent.getIntExtra(EXTRA_MTU, 1500),
                dnsServer = intent.getStringExtra(EXTRA_DNS),
            )
        }.getOrNull() ?: return

        runCatching {
            val builder = Builder()
                .setSession("IRP")
                .setMtu(config.mtu)
                .addAddress(config.address, config.prefixLength)
                .addRoute(config.route, config.routePrefixLength)
            if (!config.dnsServer.isNullOrBlank()) builder.addDnsServer(config.dnsServer)
            val established = builder.establish() ?: error("Android refused VPN establishment")
            if (!transport.start(established, config)) {
                established.close()
                return
            }
            tunnel = established
        }
    }

    private fun stopTunnel() {
        transport.stop()
        tunnel?.close()
        tunnel = null
        stopSelf()
    }

    override fun onDestroy() {
        transport.stop()
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
        const val EXTRA_ENDPOINT = "endpoint"
        const val EXTRA_MTU = "mtu"
        const val EXTRA_DNS = "dns"
    }
}
