/**
 * Platform capability negotiation for issue #280.
 * Each platform advertises exactly the capabilities its OS-specific adapter
 * implements and can verify locally. Anything else is denied with an
 * explicit reason, so no client can claim unsupported native capabilities
 * and privileged work always routes to the canonical runtime/adapters.
 */
export type ClientPlatform = 'linux' | 'macos' | 'windows' | 'ios' | 'android';
export declare const platforms: readonly ClientPlatform[];
/** Exact capability set a platform may advertise. Never broader. */
export declare const platformCapabilities: (platform: ClientPlatform) => readonly string[];
export interface CapabilityNegotiation {
    readonly platform: ClientPlatform;
    readonly granted: readonly string[];
    readonly denied: readonly string[];
    readonly reasons: readonly string[];
}
export declare const negotiatePlatformCapabilities: (platform: ClientPlatform, requested: readonly string[]) => CapabilityNegotiation;
//# sourceMappingURL=capabilities.d.ts.map