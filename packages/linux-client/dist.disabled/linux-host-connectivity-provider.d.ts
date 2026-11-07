/**
 * Real Linux host connectivity provider.
 *
 * Discovers real network interfaces from the host via `ip -j addr show` and
 * converts them into {@link ConnectivityResource}[] for the
 * {@link ConnectivityManager}. This is the production connectivity provider
 * that exposes the host's real network interfaces as canonical connectivity
 * resources — not diagnostics, not simulation.
 *
 * This provider has NO mutation authority. It only observes and reports.
 */
import type { ConnectivityCapability, ConnectivityHealth, ConnectivityOperationResult, ConnectivityProvider, ConnectivityResource, ConnectivityState } from '@irp/connectivity';
export declare const IP_BINARY = "ip";
export declare const DEFAULT_TIMEOUT_MS = 5000;
/**
 * Real Linux host connectivity provider.
 *
 * Reads `ip -j addr show` and `ip -j route show` to build canonical
 * connectivity resources from the host's actual network interfaces.
 */
export declare class LinuxHostConnectivityProvider implements ConnectivityProvider {
    readonly id = "linux-host";
    readonly type: "ethernet";
    private readonly timeoutMs;
    private readonly netns;
    private readonly commandRunner;
    constructor(options?: {
        readonly netns?: string;
        readonly timeoutMs?: number;
        readonly commandRunner?: {
            run(binary: string, args: readonly string[], options: {
                timeoutMs: number;
            }): Promise<{
                stdout: string;
                stderr: string;
                exitCode: number;
            }>;
        };
    });
    private run;
    discover(): Promise<ConnectivityResource[]>;
    getState(resourceId?: string): Promise<ConnectivityState>;
    getHealth(resourceId?: string): Promise<ConnectivityHealth>;
    connect(resourceId: string): Promise<ConnectivityOperationResult>;
    disconnect(resourceId: string): Promise<ConnectivityOperationResult>;
    activate(resourceId: string): Promise<ConnectivityOperationResult>;
    deactivate(resourceId: string): Promise<ConnectivityOperationResult>;
    capabilities(): ConnectivityCapability[];
}
