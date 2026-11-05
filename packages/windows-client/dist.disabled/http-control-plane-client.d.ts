/**
 * Production HTTP transport for the IRP Control Plane on Windows.
 */
export declare class HttpControlPlaneClient {
    private readonly baseUrl;
    private readonly tokenStore;
    private accessToken;
    private refreshToken;
    constructor(baseUrl: string, stateDirectory: string);
    getCurrentAccessToken(): string | null;
    isAuthenticated(): boolean;
    signOut(): void;
    requestEnrollment(deviceName: string): Promise<{
        requestId: string;
        status: 'pending';
    }>;
    /**
     * Polls for enrollment request approval and returns device credentials.
     * Should be called after requestEnrollment() once admin has approved.
     */
    getEnrollmentCredentials(requestId: string): Promise<{
        credentialId: string;
        deviceId: string;
        secret: string;
        expiresAt: string;
    } | null>;
    snapshot(deviceId: string): Promise<{
        connection: string;
        interfaceCount: number;
        defaultRouteAvailable: boolean;
        dnsReachable: boolean;
        capturedAt: string;
    }>;
    analytics(deviceId: string): Promise<{
        sampleCount: number;
        availabilityPercent: number;
        medianLatencyMs: number | null;
        packetLossPercent: number | null;
    }>;
    setPolicy(deviceId: string, autonomousMode: boolean): Promise<{
        autonomousMode: boolean;
    }>;
    authenticateWithCredentials(credentialId: string, secret: string): Promise<void>;
    refresh(): Promise<boolean>;
    private request;
}
export declare const createHttpControlPlaneClient: (baseUrl: string, stateDirectory: string) => HttpControlPlaneClient;
