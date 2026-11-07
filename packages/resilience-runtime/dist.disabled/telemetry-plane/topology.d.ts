/**
 * Phase 103 — Topology & Dependency Intelligence.
 *
 * Builds an immutable dependency graph from a fabric snapshot and answers
 * blast-radius, shared-failure-domain and single-point-of-failure questions.
 * Edges follow the fabric's `from -> to` relation, read as "from depends on to".
 */
import type { FabricResource, FabricSnapshot } from '../fabric.js';
export interface DependencyImpact {
    readonly resourceId: string;
    readonly directDependents: readonly string[];
    readonly transitiveDependents: readonly string[];
    readonly affectedDestinations: readonly string[];
}
export interface SinglePointOfFailure {
    readonly resourceId: string;
    readonly kind: FabricResource['kind'];
    readonly strandedDependents: readonly string[];
}
export declare class DependencyCycleError extends Error {
    readonly cycle: readonly string[];
    constructor(cycle: readonly string[]);
}
export declare class DependencyGraph {
    private readonly dependsOn;
    private readonly dependents;
    private readonly resources;
    constructor(snapshot: Pick<FabricSnapshot, 'resources' | 'edges'>);
    resource(id: string): FabricResource | undefined;
    dependenciesOf(id: string): readonly string[];
    private closure;
    impactOf(resourceId: string): DependencyImpact;
    /** Topological order, dependencies before dependents. Throws on cycles with the offending cycle. */
    topologicalOrder(): readonly string[];
    /**
     * A resource is a single point of failure when at least one dependent has it as its
     * only dependency of that kind, i.e. no alternative of the same kind exists.
     */
    singlePointsOfFailure(): readonly SinglePointOfFailure[];
    /** Failure domains shared by more than one resource, with the members of each. */
    sharedFailureDomains(): Readonly<Record<string, readonly string[]>>;
}
//# sourceMappingURL=topology.d.ts.map