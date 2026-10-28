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

export class DependencyCycleError extends Error {
  constructor(readonly cycle: readonly string[]) {
    super(`dependency cycle detected: ${cycle.join(' -> ')}`);
    this.name = 'DependencyCycleError';
  }
}

export class DependencyGraph {
  private readonly dependsOn = new Map<string, Set<string>>();
  private readonly dependents = new Map<string, Set<string>>();
  private readonly resources = new Map<string, FabricResource>();

  constructor(snapshot: Pick<FabricSnapshot, 'resources' | 'edges'>) {
    for (const r of snapshot.resources) { this.resources.set(r.id, r); this.dependsOn.set(r.id, new Set()); this.dependents.set(r.id, new Set()); }
    for (const e of snapshot.edges) {
      if (!this.resources.has(e.from) || !this.resources.has(e.to) || e.from === e.to) continue;
      this.dependsOn.get(e.from)?.add(e.to);
      this.dependents.get(e.to)?.add(e.from);
    }
  }

  resource(id: string): FabricResource | undefined { return this.resources.get(id); }
  dependenciesOf(id: string): readonly string[] { return Object.freeze([...(this.dependsOn.get(id) ?? [])].sort()); }

  private closure(start: string, edges: Map<string, Set<string>>): readonly string[] {
    const seen = new Set<string>();
    const stack = [...(edges.get(start) ?? [])];
    while (stack.length) {
      const n = stack.pop() as string;
      if (seen.has(n) || n === start) continue;
      seen.add(n);
      for (const next of edges.get(n) ?? []) stack.push(next);
    }
    return Object.freeze([...seen].sort());
  }

  impactOf(resourceId: string): DependencyImpact {
    const transitive = this.closure(resourceId, this.dependents);
    return Object.freeze({
      resourceId, directDependents: Object.freeze([...(this.dependents.get(resourceId) ?? [])].sort()), transitiveDependents: transitive,
      affectedDestinations: Object.freeze(transitive.filter((id) => this.resources.get(id)?.kind === 'Destination' || this.resources.get(id)?.kind === 'Service')),
    });
  }

  /** Topological order, dependencies before dependents. Throws on cycles with the offending cycle. */
  topologicalOrder(): readonly string[] {
    const state = new Map<string, 0 | 1 | 2>();
    const order: string[] = [];
    const path: string[] = [];
    const visit = (id: string): void => {
      const s = state.get(id) ?? 0;
      if (s === 2) return;
      if (s === 1) throw new DependencyCycleError([...path.slice(path.indexOf(id)), id]);
      state.set(id, 1); path.push(id);
      for (const dep of [...(this.dependsOn.get(id) ?? [])].sort()) visit(dep);
      path.pop(); state.set(id, 2); order.push(id);
    };
    for (const id of [...this.resources.keys()].sort()) visit(id);
    return Object.freeze(order);
  }

  /**
   * A resource is a single point of failure when at least one dependent has it as its
   * only dependency of that kind, i.e. no alternative of the same kind exists.
   */
  singlePointsOfFailure(): readonly SinglePointOfFailure[] {
    const spofs: SinglePointOfFailure[] = [];
    for (const [id, resource] of this.resources) {
      const stranded: string[] = [];
      for (const dependentId of this.dependents.get(id) ?? []) {
        const alternatives = [...(this.dependsOn.get(dependentId) ?? [])].filter((d) => d !== id && this.resources.get(d)?.kind === resource.kind);
        if (alternatives.length === 0) stranded.push(dependentId);
      }
      if (stranded.length > 0) spofs.push(Object.freeze({ resourceId: id, kind: resource.kind, strandedDependents: Object.freeze(stranded.sort()) }));
    }
    return Object.freeze(spofs.sort((a, b) => b.strandedDependents.length - a.strandedDependents.length || a.resourceId.localeCompare(b.resourceId)));
  }

  /** Failure domains shared by more than one resource, with the members of each. */
  sharedFailureDomains(): Readonly<Record<string, readonly string[]>> {
    const byDomain = new Map<string, string[]>();
    for (const r of this.resources.values()) for (const d of r.failureDomains) byDomain.set(d, [...(byDomain.get(d) ?? []), r.id]);
    return Object.freeze(Object.fromEntries([...byDomain.entries()].filter(([, m]) => m.length > 1).sort(([a], [b]) => a.localeCompare(b)).map(([d, m]) => [d, Object.freeze(m.sort())])));
  }
}
