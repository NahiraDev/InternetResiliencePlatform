import type { Tunnel, TunnelConfiguration, TunnelHealth, TunnelProvider, TunnelState } from './index.js';
export type SecureTunnelOperation = 'connect' | 'disconnect' | 'healthCheck';
export interface SecureTunnelOperationContext {
    operation: SecureTunnelOperation;
    timeoutMs: number;
    signal: AbortSignal;
}
export interface SecureTunnelOperationResult<T> {
    value: T;
    elapsedMs: number;
}
/**
 * Phase 48 security boundary for provider-neutral tunnel operations.
 * It validates provider compatibility, enforces bounded operation time and
 * never stores credential material.
 */
export declare function validateProviderCompatibility(provider: TunnelProvider, config: TunnelConfiguration): void;
export declare function assertSecureLifecycleTransition(tunnel: Tunnel, next: TunnelState): Tunnel;
export declare function withSecureTunnelTimeout<T>(operation: (context: SecureTunnelOperationContext) => Promise<T>, operationType: SecureTunnelOperation, timeoutMs: number): Promise<SecureTunnelOperationResult<T>>;
export declare function validateTunnelHealthEvidence(health: TunnelHealth, nowMs?: number): void;
//# sourceMappingURL=secure.d.ts.map