export type GatewayId = string;
export type GatewayLifecycle = 'registered' | 'active' | 'draining' | 'disabled' | 'retired';
export type GatewayTrust = 'untrusted' | 'pending' | 'trusted' | 'revoked';
export type GatewayAddressFamily = 'ipv4' | 'ipv6' | 'dual';

export interface GatewayEndpoint {
  host: string;
  port: number;
  family: GatewayAddressFamily;
}

export interface GatewayCapabilities {
  tunnelProtocols: string[];
  addressFamilies: GatewayAddressFamily[];
  transports: string[];
  features: string[];
}

export interface GatewayOwnership {
  ownerId: string;
  organizationId?: string;
  managedBy: 'local' | 'control-plane' | 'provider';
}

export interface GatewayMetadata {
  id: GatewayId;
  name: string;
  description?: string;
  region?: string;
  countryCode?: string;
  providerId?: string;
  endpoint: GatewayEndpoint;
  ownership: GatewayOwnership;
  capabilities: GatewayCapabilities;
  lifecycle: GatewayLifecycle;
  trust: GatewayTrust;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastHealthCheckAt?: string;
  retiredAt?: string;
}

export interface GatewayPatch {
  name?: string;
  description?: string;
  region?: string;
  countryCode?: string;
  providerId?: string;
  endpoint?: GatewayEndpoint;
  ownership?: GatewayOwnership;
  capabilities?: GatewayCapabilities;
  tags?: string[];
}

export interface GatewayRegistry {
  register(gateway: GatewayMetadata): GatewayMetadata;
  get(id: GatewayId): GatewayMetadata | undefined;
  list(filter?: GatewayFilter): GatewayMetadata[];
  update(id: GatewayId, patch: GatewayPatch): GatewayMetadata;
  transition(id: GatewayId, lifecycle: GatewayLifecycle): GatewayMetadata;
  setTrust(id: GatewayId, trust: GatewayTrust): GatewayMetadata;
  remove(id: GatewayId): GatewayMetadata;
}

export interface GatewayFilter {
  lifecycle?: GatewayLifecycle | GatewayLifecycle[];
  trust?: GatewayTrust | GatewayTrust[];
  region?: string;
  countryCode?: string;
  providerId?: string;
  ownerId?: string;
  tag?: string;
}

const lifecycleTransitions: Record<GatewayLifecycle, GatewayLifecycle[]> = {
  registered: ['active', 'disabled', 'retired'],
  active: ['draining', 'disabled', 'retired'],
  draining: ['active', 'disabled', 'retired'],
  disabled: ['active', 'retired'],
  retired: [],
};

const clone = <T>(value: T): T => structuredClone(value);

function assertGateway(gateway: GatewayMetadata): void {
  if (!gateway.id.trim()) throw new Error('gateway id is required');
  if (!gateway.name.trim()) throw new Error('gateway name is required');
  if (!gateway.ownerId?.trim() || !gateway.ownership.ownerId.trim()) {
    throw new Error('gateway ownership ownerId is required');
  }
  if (!Number.isInteger(gateway.endpoint.port) || gateway.endpoint.port < 1 || gateway.endpoint.port > 65535) {
    throw new Error('gateway endpoint port must be an integer between 1 and 65535');
  }
  if (gateway.endpoint.host.trim().length === 0) throw new Error('gateway endpoint host is required');
  if (gateway.tags.some((tag) => !tag.trim())) throw new Error('gateway tags must not be empty');
  if (new Set(gateway.tags).size !== gateway.tags.length) throw new Error('gateway tags must be unique');
  if (gateway.capabilities.addressFamilies.length === 0) throw new Error('gateway must declare address families');
}

export class InMemoryGatewayRegistry implements GatewayRegistry {
  private readonly gateways = new Map<GatewayId, GatewayMetadata>();

  register(input: GatewayMetadata): GatewayMetadata {
    assertGateway(input);
    if (this.gateways.has(input.id)) throw new Error(`gateway ${input.id} already exists`);
    const gateway = clone(input);
    this.gateways.set(gateway.id, gateway);
    return clone(gateway);
  }

  get(id: GatewayId): GatewayMetadata | undefined {
    const gateway = this.gateways.get(id);
    return gateway ? clone(gateway) : undefined;
  }

  list(filter: GatewayFilter = {}): GatewayMetadata[] {
    const matches = (value: GatewayLifecycle | GatewayTrust, expected?: string | string[]) =>
      expected === undefined || (Array.isArray(expected) ? expected.includes(value) : value === expected);

    return [...this.gateways.values()]
      .filter((gateway) => matches(gateway.lifecycle, filter.lifecycle))
      .filter((gateway) => matches(gateway.trust, filter.trust))
      .filter((gateway) => filter.region === undefined || gateway.region === filter.region)
      .filter((gateway) => filter.countryCode === undefined || gateway.countryCode === filter.countryCode)
      .filter((gateway) => filter.providerId === undefined || gateway.providerId === filter.providerId)
      .filter((gateway) => filter.ownerId === undefined || gateway.ownership.ownerId === filter.ownerId)
      .filter((gateway) => filter.tag === undefined || gateway.tags.includes(filter.tag))
      .map(clone);
  }

  update(id: GatewayId, patch: GatewayPatch): GatewayMetadata {
    const current = this.require(id);
    const updated: GatewayMetadata = {
      ...current,
      ...patch,
      endpoint: patch.endpoint ? { ...patch.endpoint } : current.endpoint,
      ownership: patch.ownership ? { ...patch.ownership } : current.ownership,
      capabilities: patch.capabilities ? { ...patch.capabilities } : current.capabilities,
      tags: patch.tags ? [...patch.tags] : [...current.tags],
      updatedAt: new Date().toISOString(),
    };
    assertGateway(updated);
    this.gateways.set(id, updated);
    return clone(updated);
  }

  transition(id: GatewayId, lifecycle: GatewayLifecycle): GatewayMetadata {
    const current = this.require(id);
    if (current.lifecycle === lifecycle) return clone(current);
    if (!lifecycleTransitions[current.lifecycle].includes(lifecycle)) {
      throw new Error(`invalid gateway lifecycle transition: ${current.lifecycle} -> ${lifecycle}`);
    }
    const now = new Date().toISOString();
    const updated = {
      ...current,
      lifecycle,
      updatedAt: now,
      retiredAt: lifecycle === 'retired' ? now : current.retiredAt,
    };
    this.gateways.set(id, updated);
    return clone(updated);
  }

  setTrust(id: GatewayId, trust: GatewayTrust): GatewayMetadata {
    const current = this.require(id);
    if (current.trust === 'revoked' && trust !== 'revoked') {
      throw new Error('revoked gateways require explicit re-registration');
    }
    const updated = { ...current, trust, updatedAt: new Date().toISOString() };
    this.gateways.set(id, updated);
    return clone(updated);
  }

  remove(id: GatewayId): GatewayMetadata {
    const current = this.require(id);
    if (current.lifecycle !== 'retired') throw new Error('only retired gateways can be removed');
    this.gateways.delete(id);
    return clone(current);
  }

  private require(id: GatewayId): GatewayMetadata {
    const gateway = this.gateways.get(id);
    if (!gateway) throw new Error(`gateway ${id} not found`);
    return gateway;
  }
}
