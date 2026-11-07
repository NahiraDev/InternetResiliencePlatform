/**
 * Unified fabric capability registry with enforceable scope, authority, trust,
 * safety and platform compatibility (issue #275, task 5).
 *
 * The registry is the single place that answers "may this actor use this
 * capability, for this resource, on this platform, at this trust level?".
 * Selection paths must consult it rather than trusting resource-local claims.
 */
import type { FabricCapability } from './fabric.js';
export type FabricPlatform = 'linux' | 'macos' | 'windows' | 'ios' | 'android' | 'any';
export interface CapabilityRequest {
    readonly capabilityId: string;
    /** Resource the capability would act on. */
    readonly resourceId: string;
    /**
     * Scope the resource belongs to. When supplied it must match the capability's
     * declared scope, so a capability registered for one scope cannot be used
     * against a resource in another.
     */
    readonly scope?: string;
    readonly platform?: FabricPlatform;
    /** Minimum trust the caller must hold. */
    readonly minimumTrust?: number;
    /** Safety ceiling: a caller may not exceed the capability's declared safety. */
    readonly maximumSafety?: FabricCapability['safety'];
    /** When true, only runtime-authority capabilities are acceptable. */
    readonly requireRuntimeAuthority?: boolean;
}
export interface CapabilityDecision {
    readonly allowed: boolean;
    readonly capability?: FabricCapability;
    readonly reasons: readonly string[];
}
/**
 * Enforceable registry. `authorize` is the only supported way to decide whether
 * a capability may be used; resource-local capability claims are evidence, not
 * authorization.
 */
export declare class FabricCapabilityAuthority {
    private readonly capabilities;
    register(capability: FabricCapability): void;
    get(id: string): FabricCapability | undefined;
    list(): readonly FabricCapability[];
    listByScope(scope: string): readonly FabricCapability[];
    /** Resolves the single authoritative decision for a capability request. */
    authorize(request: CapabilityRequest): CapabilityDecision;
    /** Authorizes a set of capabilities, returning only the first failure. */
    authorizeAll(requests: readonly CapabilityRequest[]): CapabilityDecision;
    /** Highest authority declared for a capability, used for precedence. */
    authorityRank(id: string): number;
}
//# sourceMappingURL=fabric-authority.d.ts.map