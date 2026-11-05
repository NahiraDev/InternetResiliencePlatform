export type { BuiltinCapability, Capability, ContractNamespace, KernelContract, KernelContext, KernelMessage, Principal, WorkflowDefinition, WorkflowResult, } from '@irp/kernel';
export { CapabilityError, KernelError, KernelRuntime, createContract, createKernel, } from '@irp/kernel';
export declare const PRODUCT_API_VERSION: "1";
export declare const PRODUCT_API_PATH: "/api/v1";
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
export interface SdkOptions {
    baseUrl: string;
    fetch?: typeof fetch;
    accessToken?: string;
    apiVersion?: typeof PRODUCT_API_VERSION;
}
export declare class ProductApiError extends Error {
    readonly status: number;
    readonly code?: string | undefined;
    constructor(message: string, status: number, code?: string | undefined);
}
export declare class InternetResilienceClient {
    private readonly options;
    private readonly fetcher;
    private readonly baseUrl;
    private readonly accessToken;
    private readonly apiVersion;
    constructor(options: SdkOptions);
    private request;
    health(): Promise<unknown>;
    version(): Promise<unknown>;
    capabilities(): Promise<ProductApiManifest>;
    context(): Promise<ProductApiContext>;
    requestCapability<T>(path: string, init?: RequestInit): Promise<T>;
    deviceSnapshot(deviceId: string): Promise<{
        connection: string;
        interfaceCount: number;
        defaultRouteAvailable: boolean;
        dnsReachable: boolean;
        capturedAt: string;
    }>;
    deviceAnalytics(deviceId: string): Promise<{
        sampleCount: number;
        availabilityPercent: number;
        medianLatencyMs: number | null;
        packetLossPercent: number | null;
    }>;
    devicePolicy(deviceId: string): Promise<{
        autonomousMode: boolean;
    }>;
    setDevicePolicy(deviceId: string, autonomousMode: boolean): Promise<{
        autonomousMode: boolean;
    }>;
    remoteClientToken(credentialId: string, secret: string): Promise<{
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        expiresIn: number;
        refreshExpiresAt: string;
        scopes: readonly string[];
        device: {
            credentialId: string;
            deviceId: string;
            platform: string;
            label?: string;
        };
    }>;
    remoteClientRefresh(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        expiresIn: number;
        refreshExpiresAt: string;
        scopes: readonly string[];
    }>;
}
//# sourceMappingURL=index.d.ts.map