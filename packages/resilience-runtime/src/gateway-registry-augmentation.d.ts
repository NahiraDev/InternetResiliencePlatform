// Type augmentations for @irp/gateway-registry to work around stale dist files
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in module augmentation below
import type { GatewayEndpoint } from '@irp/gateway-registry';

declare module '@irp/gateway-registry' {
  export type GatewayProbeEvidence = 'transport' | 'protocol' | 'egress';

  export interface GatewayHealthSample {
    gatewayId: string;
    checkedAt: string;
    reachable: boolean;
    evidence?: GatewayProbeEvidence;
    applicable?: boolean;
    latencyMs?: number;
    packetLossPercent?: number;
  }

  export interface GatewayHealth {
    gatewayId: string;
    status: 'healthy' | 'degraded' | 'unreachable' | 'stale' | 'unknown';
    score: number;
    checkedAt?: string;
    evidence?: GatewayProbeEvidence;
    latencyMs?: number;
    packetLossPercent?: number;
    reason: string;
  }

  export interface GatewayHealthProbe {
    readonly transport?: 'tcp' | 'udp' | 'any';
    probe(endpoint: GatewayEndpoint, timeoutMs: number): Promise<GatewayProbeResult>;
    probeGateways?(
      gateways: { id: string; endpoint: GatewayEndpoint }[],
    ): Promise<GatewayHealthSample[]>;
  }

  export interface GatewayProbeResult {
    reachable: boolean;
    evidence?: GatewayProbeEvidence;
    applicable?: boolean;
    latencyMs?: number;
    packetLossPercent?: number;
    error?: string;
    detail?: string;
  }

  export interface GatewayTunnelDeclaration {
    readonly protocol: string;
    readonly credentialRef: string;
    readonly routingMode: 'fullTunnel' | 'splitTunnel';
    readonly addressCidr?: string;
    readonly allowedDestinations?: readonly string[];
    readonly excludedDestinations?: readonly string[];
    readonly interfaceName?: string;
    readonly mtu?: number;
    readonly keepaliveSeconds?: number;
  }

  export interface GatewayMetadata {
    id: string;
    name: string;
    description?: string;
    region?: string;
    countryCode?: string;
    providerId?: string;
    endpoint: GatewayEndpoint;
    ownership: {
      ownerId: string;
      organizationId?: string;
      managedBy: 'local' | 'control-plane' | 'provider';
    };
    capabilities: {
      tunnelProtocols: string[];
      addressFamilies: ('ipv4' | 'ipv6' | 'dual')[];
      transports: string[];
      features: string[];
    };
    tunnel?: GatewayTunnelDeclaration;
    lifecycle: 'registered' | 'active' | 'draining' | 'disabled' | 'retired';
    trust: 'untrusted' | 'pending' | 'trusted' | 'revoked';
    tags: string[];
    createdAt: string;
    updatedAt: string;
    lastHealthCheckAt?: string;
    retiredAt?: string;
  }

  export interface GatewayFleetCapacity {
    readonly limit: number;
    readonly allocated: number;
    readonly reserved: number;
    readonly available: number;
    readonly checkedAt: string;
  }

  export interface GatewayFleetManager {
    getCapacity(gatewayId: string): GatewayFleetCapacity | undefined;
    reserveCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    releaseCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
  }

  export interface GatewayRegistrySelectionPlaneOptions {
    enabled?: boolean;
    policy?: Partial<GatewaySelectionPolicy>;
    probe?: GatewayHealthProbe;
    tunnelControlPlane?: import('@irp/resilience-runtime').CanonicalTunnelControlPlane;
    routing?: import('@irp/routing').RoutingEngine;
    verifyDestination?: (
      destination: import('@irp/routing').RoutingDestination,
      context: import('@irp/resilience-runtime').RuntimeContext,
    ) => Promise<import('@irp/resilience-runtime').CanonicalDestinationOutcome>;
    destination?: import('@irp/routing').RoutingDestination;
    endpointResolver?: (source: import('@irp/connectivity').ConnectivitySource) => GatewayEndpointResolution | undefined;
    trustedGatewayIds?: readonly string[];
    securityVerifier?: GatewaySecurityVerifier;
    attestations?: (gatewayId: string) => GatewayTrustAttestation | undefined;
    fleetManager?: GatewayFleetManager;
  }

  export interface GatewayEndpointResolution {
    readonly host: string;
    readonly port: number;
    readonly family: 'ipv4' | 'ipv6' | 'dual';
    readonly tunnel?: GatewayTunnelDeclaration;
    readonly capabilities?: Partial<GatewayCapabilities>;
    readonly providerId?: string;
    readonly region?: string;
    readonly name?: string;
    readonly tags?: readonly string[];
  }

  export interface GatewayTrustAttestation {
    readonly identity: GatewayIdentityAttestation;
    readonly artifact?: {
      readonly attestation: GatewayArtifactAttestation;
      readonly bytes: Uint8Array;
    };
  }

  export interface GatewayIdentityAttestation {
    payload: GatewayIdentityAttestationPayload;
    signature: string;
  }

  export interface GatewayIdentityAttestationPayload {
    gatewayId: string;
    providerId: string;
    keyId: string;
    algorithm: string;
    issuedAt: string;
    expiresAt: string;
    nonce: string;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- placeholder for future artifact attestation fields
  export interface GatewayArtifactAttestation {
    // artifact attestation details
  }

  export interface GatewaySecurityVerifier {
    assess(
      gateway: GatewayMetadata,
      identity: GatewayIdentityAttestation,
      artifact?: { attestation: GatewayArtifactAttestation; bytes: Uint8Array },
    ): {
      gatewayId: string;
      identityVerified: boolean;
      artifactVerified: boolean;
      assessedAt: string;
      identityKeyId?: string;
    };
  }

  export type GatewaySelectionPolicy = {
    allowedRegions: string[];
    allowedProviderIds: string[];
    requiredTags: string[];
    requiredTunnelProtocol?: string;
    requiredAddressFamily?: 'ipv4' | 'ipv6' | 'dual';
    minimumHealthScore: number;
    maximumLatencyMs: number;
    maximumPacketLossPercent: number;
    maximumUtilizationPercent: number;
    requireFreshHealth: boolean;
    maxHealthAgeMs: number;
    allowDegradedHealth: boolean;
    preferredRegions: string[];
    preferredProviderIds: string[];
    hysteresisScore: number;
  };

  export interface GatewaySelectionCandidate {
    gateway: GatewayMetadata;
    health: GatewayHealth;
    capacity?: GatewayCapacity;
    eligible: boolean;
    score: number;
    rejectionReason?: string;
    explanation: string[];
    scoreComponents: Record<string, number>;
  }

  export interface GatewaySelectionRequest {
    gateways: GatewayMetadata[];
    health: Map<string, GatewayHealth> | Record<string, GatewayHealth>;
    capacity?: Map<string, GatewayCapacity> | Record<string, GatewayCapacity>;
    currentGatewayId?: string;
    policy?: Partial<GatewaySelectionPolicy>;
    now?: Date;
  }

  export interface GatewaySelectionResult {
    selected?: GatewaySelectionCandidate;
    candidates: GatewaySelectionCandidate[];
    reason: string;
    switched: boolean;
  }

  export interface GatewayCapacity {
    utilizationPercent: number;
    availableCapacityPercent?: number;
    checkedAt: string;
  }

  export interface GatewayCapacityState {
    limit: number;
    allocated: number;
    reserved: number;
    checkedAt: string;
  }

  export interface GatewayFleetRecord {
    gateway: GatewayMetadata;
    desiredState: 'active' | 'draining' | 'disabled';
    provisioning: {
      requestedBy: string;
      source: 'manual' | 'control-plane' | 'provider';
      requestedAt: string;
      configurationVersion: string;
    };
    capacity: GatewayCapacityState;
    maintenanceWindow?: { startsAt: string; endsAt: string; reason: string };
    upgrade: { targetVersion: string; status: 'none' | 'scheduled' | 'in-progress' | 'succeeded' | 'failed'; requestedAt: string; startedAt?: string; completedAt?: string; reason?: string };
    updatedAt: string;
  }

  export type GatewayFleetDesiredState = 'active' | 'draining' | 'disabled';
  export type GatewayUpgradeStatus = 'none' | 'scheduled' | 'in-progress' | 'succeeded' | 'failed';
  export type GatewayFleetEventType =
    | 'gateway.fleet.provisioning.updated'
    | 'gateway.fleet.state.changed'
    | 'gateway.fleet.capacity.updated'
    | 'gateway.fleet.capacity.reserved'
    | 'gateway.fleet.capacity.released'
    | 'gateway.fleet.maintenance.scheduled'
    | 'gateway.fleet.maintenance.cleared'
    | 'gateway.fleet.upgrade.scheduled'
    | 'gateway.fleet.upgrade.started'
    | 'gateway.fleet.upgrade.completed'
    | 'gateway.fleet.upgrade.failed';

  export interface GatewayFleetEvent {
    type: GatewayFleetEventType;
    gatewayId: string;
    occurredAt: string;
    reason: string;
  }

  export interface GatewayFleetTelemetry {
    publish(event: GatewayFleetEvent): Promise<void> | void;
  }

  export interface GatewayFleetManager {
    register(gateway: GatewayMetadata, provisioning: GatewayProvisioningMetadata): GatewayFleetRecord;
    get(gatewayId: string): GatewayFleetRecord | undefined;
    list(): GatewayFleetRecord[];
    updateProvisioning(gatewayId: string, provisioning: GatewayProvisioningMetadata): GatewayFleetRecord;
    updateGateway(gatewayId: string, patch: GatewayPatch): GatewayFleetRecord;
    setDesiredState(gatewayId: string, desiredState: GatewayFleetDesiredState, reason: string): GatewayFleetRecord;
    setCapacityLimit(gatewayId: string, limit: number): GatewayFleetRecord;
    setAllocatedCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    reserveCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    releaseCapacity(gatewayId: string, amount: number): GatewayFleetRecord;
    scheduleMaintenance(gatewayId: string, window: GatewayMaintenanceWindow): GatewayFleetRecord;
    clearMaintenance(gatewayId: string): GatewayFleetRecord;
    isUnderMaintenance(gatewayId: string, at?: Date): boolean;
    scheduleUpgrade(gatewayId: string, targetVersion: string, reason?: string): GatewayFleetRecord;
    markUpgradeStarted(gatewayId: string): GatewayFleetRecord;
    markUpgradeCompleted(gatewayId: string, reason?: string): GatewayFleetRecord;
    markUpgradeFailed(gatewayId: string, reason: string): GatewayFleetRecord;
  }

  export interface GatewayProvisioningMetadata {
    requestedBy: string;
    source: 'manual' | 'control-plane' | 'provider';
    requestedAt: string;
    configurationVersion: string;
  }

  export interface GatewayMaintenanceWindow {
    startsAt: string;
    endsAt: string;
    reason: string;
  }

  export interface GatewayUpgradeState {
    targetVersion: string;
    status: GatewayUpgradeStatus;
    requestedAt: string;
    startedAt?: string;
    completedAt?: string;
    reason?: string;
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
    tunnel?: GatewayTunnelDeclaration;
    tags?: string[];
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

  export interface GatewayRegistry {
    register(gateway: GatewayMetadata): GatewayMetadata;
    get(id: string): GatewayMetadata | undefined;
    list(filter?: GatewayFilter): GatewayMetadata[];
    update(id: string, patch: GatewayPatch): GatewayMetadata;
    transition(id: string, lifecycle: GatewayLifecycle): GatewayMetadata;
    setTrust(id: string, trust: GatewayTrust): GatewayMetadata;
    remove(id: string): GatewayMetadata;
  }

  export type GatewayLifecycle = 'registered' | 'active' | 'draining' | 'disabled' | 'retired';
  export type GatewayTrust = 'untrusted' | 'pending' | 'trusted' | 'revoked';
  export type GatewayAddressFamily = 'ipv4' | 'ipv6' | 'dual';

  export interface GatewayOwnership {
    ownerId: string;
    organizationId?: string;
    managedBy: 'local' | 'control-plane' | 'provider';
  }

  export interface GatewayCapabilities {
    tunnelProtocols: string[];
    addressFamilies: GatewayAddressFamily[];
    transports: string[];
    features: string[];
  }

  export interface GatewayEndpoint {
    host: string;
    port: number;
    family: GatewayAddressFamily;
  }

  export type GatewayId = string;
}