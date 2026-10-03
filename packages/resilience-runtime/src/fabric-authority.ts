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

const SAFETY_ORDER: Readonly<Record<FabricCapability['safety'], number>> = Object.freeze({
  'read-only': 0,
  safe: 1,
  governed: 2,
});

const AUTHORITY_ORDER: Readonly<Record<FabricCapability['authority'], number>> = Object.freeze({
  external: 0,
  provider: 1,
  adapter: 2,
  runtime: 3,
});

const platformMatches = (
  declared: readonly string[],
  platform: FabricPlatform | undefined,
): boolean => {
  if (!platform || platform === 'any') return true;
  return declared.some((entry) => entry === platform || entry === 'any');
};

/**
 * Enforceable registry. `authorize` is the only supported way to decide whether
 * a capability may be used; resource-local capability claims are evidence, not
 * authorization.
 */
export class FabricCapabilityAuthority {
  private readonly capabilities = new Map<string, FabricCapability>();

  register(capability: FabricCapability): void {
    if (!capability.id.trim()) throw new Error('fabric capability id is required');
    if (!capability.scope.trim())
      throw new Error(`fabric capability ${capability.id} requires scope`);
    if (!Number.isFinite(capability.trust) || capability.trust < 0 || capability.trust > 1) {
      throw new Error(`fabric capability ${capability.id} trust must be between 0 and 1`);
    }
    if (this.capabilities.has(capability.id)) {
      throw new Error(`fabric capability already registered: ${capability.id}`);
    }
    const scopeCollision = [...this.capabilities.values()].find(
      (existing) => existing.scope === capability.scope && existing.id !== capability.id,
    );
    if (scopeCollision) {
      throw new Error(
        `fabric capability scope ${capability.scope} is already claimed by ${scopeCollision.id}`,
      );
    }
    this.capabilities.set(capability.id, Object.freeze({ ...capability }));
  }

  get(id: string): FabricCapability | undefined {
    return this.capabilities.get(id);
  }

  list(): readonly FabricCapability[] {
    return Object.freeze([...this.capabilities.values()]);
  }

  listByScope(scope: string): readonly FabricCapability[] {
    return Object.freeze(
      [...this.capabilities.values()].filter((capability) => capability.scope === scope),
    );
  }

  /** Resolves the single authoritative decision for a capability request. */
  authorize(request: CapabilityRequest): CapabilityDecision {
    const reasons: string[] = [];
    const capability = this.capabilities.get(request.capabilityId);
    if (!capability) {
      return Object.freeze({
        allowed: false,
        reasons: Object.freeze([`capability-not-registered:${request.capabilityId}`]),
      });
    }
    if (!platformMatches(capability.platforms, request.platform)) {
      reasons.push(`platform-unsupported:${request.platform ?? 'any'}`);
    }
    if (request.minimumTrust !== undefined && capability.trust < request.minimumTrust) {
      reasons.push(`insufficient-trust:${capability.trust}<${request.minimumTrust}`);
    }
    if (
      request.maximumSafety !== undefined &&
      SAFETY_ORDER[capability.safety] > SAFETY_ORDER[request.maximumSafety]
    ) {
      reasons.push(`safety-exceeds-ceiling:${capability.safety}`);
    }
    if (request.requireRuntimeAuthority && capability.authority !== 'runtime') {
      reasons.push(`authority-insufficient:${capability.authority}`);
    }
    return Object.freeze({
      allowed: reasons.length === 0,
      capability,
      reasons: Object.freeze(reasons),
    });
  }

  /** Authorizes a set of capabilities, returning only the first failure. */
  authorizeAll(requests: readonly CapabilityRequest[]): CapabilityDecision {
    const denied = requests
      .map((request) => this.authorize(request))
      .filter((decision) => !decision.allowed);
    if (denied.length === 0) {
      const [first] = requests.map((request) => this.authorize(request));
      return Object.freeze({
        allowed: true,
        ...(first?.capability ? { capability: first.capability } : {}),
        reasons: Object.freeze([]),
      });
    }
    const [firstDenied] = denied;
    return Object.freeze({
      allowed: false,
      ...(firstDenied?.capability ? { capability: firstDenied.capability } : {}),
      reasons: firstDenied?.reasons ?? Object.freeze(['capability-denied']),
    });
  }

  /** Highest authority declared for a capability, used for precedence. */
  authorityRank(id: string): number {
    const capability = this.capabilities.get(id);
    return capability ? AUTHORITY_ORDER[capability.authority] : -1;
  }
}
