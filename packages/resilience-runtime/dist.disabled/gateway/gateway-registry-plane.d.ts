import type { ConnectivityManager, ConnectivitySource } from '@irp/connectivity';
import { type GatewayAddressFamily, type GatewayCapabilities, type GatewayHealthProbe, type GatewayMetadata, type GatewaySelectionPolicy, type GatewaySecurityVerifier, type GatewayIdentityAttestation, type GatewayArtifactAttestation, type GatewayTunnelDeclaration } from '@irp/gateway-registry';
import type { RoutingDestination, RoutingEngine } from '@irp/routing';
import type { CanonicalDestinationOutcome, CanonicalGatewayApplyResult, CanonicalGatewaySelectionDecision, CanonicalGatewaySelectionPlane, CanonicalTunnelControlPlane } from '../canonical-network-adapter.js';
import type { RuntimeContext } from '../domain/types.js';
/**
 * A real, addressable tunnel endpoint for a connectivity source.
 *
 * The resolver is the only place where a gateway's host and port may come from. When it returns
 * `undefined` the source is not addressable as a gateway and is not registered at all: the
 * selection plane never invents a host, a port or an address family.
 */
export interface GatewayEndpointResolution {
    readonly host: string;
    readonly port: number;
    readonly family: GatewayAddressFamily;
    /** How traffic reaches the gateway. Required for the gateway to be tunnel-addressable. */
    readonly tunnel?: GatewayTunnelDeclaration;
    readonly capabilities?: Partial<GatewayCapabilities>;
    readonly providerId?: string;
    readonly region?: string;
    readonly name?: string;
    readonly tags?: readonly string[];
}
export type GatewayEndpointResolver = (source: ConnectivitySource) => GatewayEndpointResolution | undefined;
/** The attestation material used to establish a gateway's trust. */
export interface GatewayTrustAttestation {
    readonly identity: GatewayIdentityAttestation;
    readonly artifact?: {
        readonly attestation: GatewayArtifactAttestation;
        readonly bytes: Uint8Array;
    };
}
export interface GatewayRegistrySelectionPlaneOptions {
    enabled?: boolean;
    policy?: Partial<GatewaySelectionPolicy>;
    probe?: GatewayHealthProbe;
    tunnelControlPlane?: CanonicalTunnelControlPlane;
    /** The canonical routing engine used to install the route through the tunnel. */
    routing?: RoutingEngine;
    /** The canonical destination probe used to prove that traffic leaves through the tunnel. */
    verifyDestination?: (destination: RoutingDestination, context: RuntimeContext) => Promise<CanonicalDestinationOutcome>;
    /** The external destination that must be reached through the selected gateway. */
    destination?: RoutingDestination;
    /** Resolves the real endpoint of a connectivity source. */
    endpointResolver?: GatewayEndpointResolver;
    /** Gateways an operator explicitly trusts, by id. */
    trustedGatewayIds?: readonly string[];
    /** The canonical verifier used to establish trust from an attestation. */
    securityVerifier?: GatewaySecurityVerifier;
    /** Resolves the attestation material for a gateway. */
    attestations?: (gatewayId: string) => GatewayTrustAttestation | undefined;
}
/**
 * The gateway selection data plane.
 *
 * It sits behind the canonical runtime: it holds no decision authority, it only turns gateway
 * evidence into a selection and carries out the resulting data-plane transition inside the
 * runtime's transaction boundary.
 *
 * The invariants it enforces:
 *
 * - a gateway is registered only when a real host and port are known;
 * - a newly registered gateway is `pending` and becomes `trusted` only through a canonical
 *   attestation or an explicit operator allow-list;
 * - transport evidence alone never makes a gateway operational;
 * - a gateway is only reported as established after the tunnel is up, the route is installed and
 *   an external destination has actually been reached through the tunnel;
 * - any failure after the first mutation is rolled back.
 */
export declare class GatewayRegistrySelectionPlane implements CanonicalGatewaySelectionPlane {
    private readonly connectivity;
    private readonly options;
    private readonly registry;
    private readonly policy;
    private readonly applications;
    private readonly unaddressable;
    constructor(connectivity: ConnectivityManager, options?: GatewayRegistrySelectionPlaneOptions);
    get configured(): boolean;
    get currentGatewayId(): string | undefined;
    gateways(): readonly GatewayMetadata[];
    /** Sources that could not be registered because no real endpoint is known for them. */
    unaddressableSources(): Readonly<Record<string, string>>;
    synchronize(): Promise<void>;
    private assertResolution;
    private refreshLifecycle;
    /**
     * Establishes a gateway's trust.
     *
     * A gateway is trusted only when the canonical verifier accepts its attestation, or when an
     * operator explicitly allow-listed it. A failed attestation marks the gateway `untrusted`.
     */
    private establishTrust;
    /**
     * Probes the registered gateways and ranks them.
     *
     * The probe only produces transport evidence. That evidence is enough to reject dead endpoints
     * and to rank candidates, but it never makes a gateway operational: the operational proof is
     * the tunnel establishment, the route installation and the external destination verification
     * performed by {@link apply}.
     */
    probeAndEvaluate(): Promise<CanonicalGatewaySelectionDecision>;
    /** True when the configured probe can speak the gateway's declared transport. */
    private probeApplies;
    /**
     * Explains why no gateway could be selected, including the evidence that was missing.
     *
     * The explanation must name the reason, because "nothing was selected" and "something was
     * selected but could not be proven" are different operational outcomes.
     */
    private selectionFailureReason;
    private noGatewayReason;
    evaluate(): Promise<CanonicalGatewaySelectionDecision>;
    /**
     * Establishes the selected gateway: tunnel, route, destination verification and source switch.
     *
     * The steps run in order and are compensated in reverse order when a later step fails, so a
     * failed establishment never leaves a switched source, an installed route or a live tunnel
     * behind.
     */
    apply(gatewayId: string, context?: RuntimeContext): Promise<CanonicalGatewayApplyResult>;
    private runtimeContext;
    private receipt;
    private buildTunnelConfiguration;
    private buildTunnelRoutePlan;
    /**
     * Compensates a failed establishment: the source switch is reverted, the route is rolled back
     * and the tunnel is torn down. Compensation never hides the original failure.
     */
    private compensate;
    /**
     * Rolls a gateway's established state back: the source switch is reverted, the route is rolled
     * back and the tunnel is torn down. Returns `true` only when every step succeeded.
     */
    rollback(gatewayId: string): Promise<boolean>;
    private rollbackGateway;
}
//# sourceMappingURL=gateway-registry-plane.d.ts.map