export type IntentStatus = 'draft' | 'active' | 'completed' | 'superseded' | 'cancelled' | 'expired';
export type IntentPriority = 'low' | 'normal' | 'high' | 'critical';
export type IntentAutonomyLevel = 'OBSERVE_ONLY' | 'ADVISORY' | 'SAFE_AUTOMATION' | 'AUTONOMOUS' | 'HIGH_RISK_REQUIRES_APPROVAL';
export type IntentObjective = 'reachability' | 'latency' | 'jitter' | 'packetLoss' | 'throughput' | 'reliability' | 'privacy' | 'trust' | 'cost' | 'diversity';
export interface NetworkIntentSpec {
    readonly outcome: string;
    readonly objectives?: Readonly<Record<IntentObjective, number>>;
    readonly constraints?: Readonly<Record<string, string | number | boolean>>;
    readonly target?: Readonly<Record<string, string>>;
}
export interface NetworkIntent {
    readonly id: string;
    readonly version: number;
    readonly status: IntentStatus;
    readonly priority: IntentPriority;
    readonly spec: NetworkIntentSpec;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly effectiveFrom?: string;
    readonly expiresAt?: string;
    readonly supersedes?: string;
    readonly metadata?: Readonly<Record<string, string>>;
    readonly provenance?: string;
    readonly confidence?: number;
    readonly autonomy?: IntentAutonomyLevel;
}
export type IntentCommand = {
    readonly type: 'activate';
    readonly at?: string;
} | {
    readonly type: 'complete';
    readonly at?: string;
} | {
    readonly type: 'supersede';
    readonly at?: string;
    readonly replacementId: string;
} | {
    readonly type: 'cancel';
    readonly at?: string;
} | {
    readonly type: 'expire';
    readonly at?: string;
};
export declare const createNetworkIntent: (input: Omit<NetworkIntent, "version" | "status" | "createdAt" | "updatedAt"> & Partial<Pick<NetworkIntent, "createdAt" | "updatedAt">>) => NetworkIntent;
export declare const transitionIntent: (intent: NetworkIntent, command: IntentCommand) => NetworkIntent;
export declare const isIntentTerminal: (intent: NetworkIntent) => boolean;
export declare const isIntentEffective: (intent: NetworkIntent, at?: Date) => boolean;
/** Checks whether the intent's autonomy level permits the given action class. */
export declare const isAutonomyPermitted: (intent: {
    autonomy?: IntentAutonomyLevel;
}, actionClass: "read" | "advise" | "safe_mutate" | "autonomous" | "high_risk") => boolean;
//# sourceMappingURL=intent.d.ts.map