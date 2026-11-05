/**
 * Platform capability negotiation for issue #280.
 * Each platform advertises exactly the capabilities its OS-specific adapter
 * implements and can verify locally. Anything else is denied with an
 * explicit reason, so no client can claim unsupported native capabilities
 * and privileged work always routes to the canonical runtime/adapters.
 */
const LINUX_CAPABILITIES = [
    'dns.write',
    'connectivity.failover',
    'route.write',
    'gateway.select',
    'tunnel.rotate',
    'tunnel.execute',
    'observability.read',
];
const DESKTOP_OBSERVE_CAPABILITIES = ['observability.read'];
const MOBILE_TUNNEL_CAPABILITIES = ['tunnel.execute', 'observability.read'];
const PLATFORM_CAPABILITIES = Object.freeze({
    // Full local adapter behind the canonical composition boundary.
    linux: LINUX_CAPABILITIES,
    // Snapshot/observe adapters only; mutation stays canonical.
    macos: DESKTOP_OBSERVE_CAPABILITIES,
    windows: DESKTOP_OBSERVE_CAPABILITIES,
    // OS tunnel adapters; selection/policy/failover remain canonical.
    ios: MOBILE_TUNNEL_CAPABILITIES,
    android: MOBILE_TUNNEL_CAPABILITIES,
});
export const platforms = Object.freeze(Object.keys(PLATFORM_CAPABILITIES));
/** Exact capability set a platform may advertise. Never broader. */
export const platformCapabilities = (platform) => PLATFORM_CAPABILITIES[platform];
export const negotiatePlatformCapabilities = (platform, requested) => {
    const offered = new Set(PLATFORM_CAPABILITIES[platform]);
    const granted = requested.filter((capability) => offered.has(capability));
    const denied = requested.filter((capability) => !offered.has(capability));
    return Object.freeze({
        platform,
        granted: Object.freeze([...granted]),
        denied: Object.freeze([...denied]),
        reasons: Object.freeze(denied.map((capability) => `${capability} is not supported on ${platform}; route through the canonical runtime/adapters`)),
    });
};
//# sourceMappingURL=capabilities.js.map