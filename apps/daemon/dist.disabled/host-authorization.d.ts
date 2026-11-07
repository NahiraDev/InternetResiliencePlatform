import type { HostTrust } from '@irp/resilience-runtime';
import type { DaemonModeResolution } from './daemon-config.js';
/** Linux capability bit numbers (include/uapi/linux/capability.h). */
export declare const CAP_NET_ADMIN = 12n;
export interface HostFacts {
    readonly platform: NodeJS.Platform;
    readonly euid: number | undefined;
    /** Effective capability bitmask of this process; undefined when it cannot be read. */
    readonly effectiveCapabilities: bigint | undefined;
    readonly hasIp: boolean;
    readonly hasResolvectl: boolean;
}
export interface HostAuthorization {
    readonly requestedMode: DaemonModeResolution['mode'];
    /** What the runtime actually runs as. Live requests that the host cannot honour fall back to safe. */
    readonly effectiveMode: DaemonModeResolution['mode'];
    readonly liveActive: boolean;
    readonly trust: HostTrust;
    /** Why live (or individual live capabilities) are not authorized. Empty when nothing is blocked. */
    readonly blockers: readonly string[];
    readonly evidence: {
        readonly platform: string;
        readonly euid: number | null;
        readonly capNetAdmin: boolean | null;
        readonly ipBinary: boolean;
        readonly resolvectl: boolean;
    };
}
export declare const readEffectiveCapabilities: (statusText: string) => bigint | undefined;
/** True when an executable called `name` is on PATH. Looks only; never runs anything. */
export declare const onPath: (name: string, pathVariable?: string) => boolean;
export declare const probeHostFacts: () => HostFacts;
export declare const authorizeHost: (request: DaemonModeResolution, facts: HostFacts) => HostAuthorization;
export interface AdapterAuthorization {
    readonly adapterId: string;
    readonly subsystem: string;
    /** What the adapter's own descriptor claims. A claim, not evidence. */
    readonly declaresLive: boolean;
    /** What this daemon will actually let it do right now. */
    readonly effective: 'live-authorized' | 'host-blocked' | 'safe-only';
    readonly missingHostCapabilities: readonly string[];
}
/**
 * An adapter declaring `supportsLive` is not operational by itself: live is only effective when the
 * daemon's host authorization is live-active and covers every privileged capability it needs.
 */
export declare const classifyAdapters: (adapters: readonly {
    adapterId: string;
    subsystem: string;
    capabilities: readonly string[];
    supportsLive: boolean;
}[], authorization: HostAuthorization) => readonly AdapterAuthorization[];
//# sourceMappingURL=host-authorization.d.ts.map