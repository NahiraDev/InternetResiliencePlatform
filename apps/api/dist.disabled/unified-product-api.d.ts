import type { FastifyInstance } from 'fastify';
import { SharedRateLimitStore } from './security/rate-limit.js';
export declare const PRODUCT_API_VERSION: "1";
export declare const PRODUCT_API_PATH: "/api/v1";
export declare const PRODUCT_API_VERSION_HEADER = "x-api-version";
export declare const PRODUCT_API_ACCEPT_VERSION_HEADER = "accept-version";
export type ProductApiClient = 'web' | 'desktop' | 'ios' | 'android';
export type ProductCapabilityStatus = 'implemented' | 'pending-verification' | 'planned';
export type ProductCapabilityKind = 'read' | 'mutate' | 'stream' | 'read-write';
export type ProductCapabilityAuthentication = 'none' | 'bearer' | 'device-credential';
export interface ProductCapability {
    id: string;
    status: ProductCapabilityStatus;
    kind: ProductCapabilityKind;
    methods: readonly string[];
    paths: readonly string[];
    authentication: ProductCapabilityAuthentication;
    requiredPermissions: readonly string[];
    description: string;
}
export interface ProductApiManifest {
    api: {
        name: string;
        version: typeof PRODUCT_API_VERSION;
        pathPrefix: typeof PRODUCT_API_PATH;
        compatibility: 'backward-compatible-within-major';
    };
    clients: readonly ProductApiClient[];
    capabilities: readonly ProductCapability[];
}
export interface ProductApiContext {
    apiVersion: typeof PRODUCT_API_VERSION;
    principal: {
        id: string;
        roles: readonly string[];
        scopes: readonly string[];
        organizationId?: string;
    };
    capabilities: readonly string[];
}
export declare const PRODUCT_API_MANIFEST: Readonly<{
    readonly api: {
        readonly name: "InternetResiliencePlatform Product API";
        readonly version: "1";
        readonly pathPrefix: "/api/v1";
        readonly compatibility: "backward-compatible-within-major";
    };
    readonly clients: readonly ["web", "desktop", "ios", "android"];
    readonly capabilities: readonly [{
        readonly id: "product.capabilities.read";
        readonly status: "implemented";
        readonly kind: "read";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/product/capabilities"];
        readonly authentication: "none";
        readonly requiredPermissions: readonly [];
        readonly description: "Versioned capability discovery for all supported clients.";
    }, {
        readonly id: "product.context.read";
        readonly status: "implemented";
        readonly kind: "read";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/product/context"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly [];
        readonly description: "Authenticated client context and server-authoritative capability availability.";
    }, {
        readonly id: "network.status.read";
        readonly status: "implemented";
        readonly kind: "read";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/platform/status", "/api/v1/health/network"];
        readonly authentication: "none";
        readonly requiredPermissions: readonly [];
        readonly description: "Current network, DNS, routing, recovery and security observations.";
    }, {
        readonly id: "network.metrics.read";
        readonly status: "implemented";
        readonly kind: "stream";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/platform/metrics/stream", "/api/v1/metrics"];
        readonly authentication: "none";
        readonly requiredPermissions: readonly [];
        readonly description: "Canonical bounded telemetry and live metric observations.";
    }, {
        readonly id: "runtime.autopilot.read";
        readonly status: "implemented";
        readonly kind: "read";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/autopilot/status", "/api/v1/autopilot/runs", "/api/v1/autopilot/runs/:id"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["autopilot.read"];
        readonly description: "Authoritative resilience/autopilot state and run inspection.";
    }, {
        readonly id: "runtime.autopilot.execute";
        readonly status: "implemented";
        readonly kind: "mutate";
        readonly methods: readonly ["POST"];
        readonly paths: readonly ["/api/v1/autopilot/runs"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["autopilot.execute"];
        readonly description: "Controlled autopilot execution through the authoritative runtime.";
    }, {
        readonly id: "runtime.autopilot.approve";
        readonly status: "implemented";
        readonly kind: "mutate";
        readonly methods: readonly ["POST"];
        readonly paths: readonly ["/api/v1/autopilot/actions/:id/approve"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["autopilot.approve"];
        readonly description: "Explicit approval of a pending autopilot action.";
    }, {
        readonly id: "runtime.autopilot.admin";
        readonly status: "implemented";
        readonly kind: "mutate";
        readonly methods: readonly ["POST"];
        readonly paths: readonly ["/api/v1/autopilot/runs/:id/cancel"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["autopilot.admin"];
        readonly description: "Administrative cancellation of a runtime operation.";
    }, {
        readonly id: "federation.probes.read";
        readonly status: "implemented";
        readonly kind: "read";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/federation/probes", "/api/v1/federation/evidence", "/api/v1/federation/compare/:destination", "/api/v1/federation/stats"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.inspect"];
        readonly description: "Inspection of signed regional probe evidence.";
    }, {
        readonly id: "federation.probes.admin";
        readonly status: "implemented";
        readonly kind: "mutate";
        readonly methods: readonly ["POST"];
        readonly paths: readonly ["/api/v1/federation/probes", "/api/v1/federation/probes/:probeId/revoke"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.admin"];
        readonly description: "Administrative probe registration and revocation.";
    }, {
        readonly id: "federation.evidence.ingest";
        readonly status: "implemented";
        readonly kind: "mutate";
        readonly methods: readonly ["POST"];
        readonly paths: readonly ["/api/v1/federation/evidence"];
        readonly authentication: "none";
        readonly requiredPermissions: readonly [];
        readonly description: "Signed probe-evidence ingestion; evidence authenticity remains server-validated.";
    }, {
        readonly id: "devices.enrollment";
        readonly status: "implemented";
        readonly kind: "mutate";
        readonly methods: readonly ["GET", "POST"];
        readonly paths: readonly ["/api/v1/auth/remote/devices", "/api/v1/auth/remote/devices/enroll"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.admin"];
        readonly description: "Cross-platform remote-client enrollment and administrative device inventory.";
    }, {
        readonly id: "devices.session";
        readonly status: "implemented";
        readonly kind: "mutate";
        readonly methods: readonly ["POST"];
        readonly paths: readonly ["/api/v1/auth/remote/token", "/api/v1/auth/remote/refresh"];
        readonly authentication: "device-credential";
        readonly requiredPermissions: readonly [];
        readonly description: "Credential exchange and rotating remote-client sessions.";
    }, {
        readonly id: "devices.snapshot";
        readonly status: "implemented";
        readonly kind: "read";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/remote/devices/:deviceId/snapshot"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.inspect"];
        readonly description: "Per-device network snapshot (connection, interfaces, DNS, default route).";
    }, {
        readonly id: "devices.analytics";
        readonly status: "implemented";
        readonly kind: "read";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/remote/devices/:deviceId/analytics"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.inspect"];
        readonly description: "Per-device network analytics (availability, latency, packet loss).";
    }, {
        readonly id: "devices.policy";
        readonly status: "implemented";
        readonly kind: "read-write";
        readonly methods: readonly ["GET", "POST"];
        readonly paths: readonly ["/api/v1/remote/devices/:deviceId/policy"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.inspect"];
        readonly description: "Per-device autonomous mode policy (read and update).";
    }, {
        readonly id: "gateway.inventory";
        readonly status: "planned";
        readonly kind: "read";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/gateways", "/api/v1/gateways/:id"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.inspect"];
        readonly description: "Managed gateway inventory for fleet API (planned).";
    }, {
        readonly id: "tunnel.lifecycle";
        readonly status: "planned";
        readonly kind: "mutate";
        readonly methods: readonly ["GET", "POST", "DELETE"];
        readonly paths: readonly ["/api/v1/tunnels", "/api/v1/tunnels/:id"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.inspect"];
        readonly description: "Provider-neutral tunnel lifecycle contract (planned).";
    }, {
        readonly id: "policies.control";
        readonly status: "planned";
        readonly kind: "mutate";
        readonly methods: readonly ["GET", "PUT", "PATCH"];
        readonly paths: readonly ["/api/v1/policies", "/api/v1/policies/:id"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.admin"];
        readonly description: "Server-authoritative policy configuration without client-side policy duplication.";
    }, {
        readonly id: "analytics.network";
        readonly status: "planned";
        readonly kind: "read";
        readonly methods: readonly ["GET"];
        readonly paths: readonly ["/api/v1/analytics", "/api/v1/analytics/network"];
        readonly authentication: "bearer";
        readonly requiredPermissions: readonly ["runtime.inspect"];
        readonly description: "Historical and aggregate network intelligence over retained evidence.";
    }];
}>;
export interface UnifiedProductApiHandle {
    manifest: ProductApiManifest;
}
export interface UnifiedProductRouteOptions {
    /** Shared rate-limit store (PostgreSQL-backed in production). When omitted the endpoint
     *  degrades to a process-local limiter, which is not shared across API instances. */
    rateLimitStore?: SharedRateLimitStore;
}
export declare const registerUnifiedProductRoutes: (app: FastifyInstance, options?: UnifiedProductRouteOptions) => UnifiedProductApiHandle;
//# sourceMappingURL=unified-product-api.d.ts.map