/**
 * Phase 149 — Backup, Disaster Recovery & Regional Recovery.
 *
 * Authenticated encrypted snapshots (AES-256-GCM with HKDF-derived per-backup
 * keys and bound metadata), chunked manifests with per-chunk digests,
 * restore verification, RPO/RTO evaluation, and a deterministic regional
 * failover plan that refuses to promote a region whose replica is too stale.
 */
export interface BackupManifest {
    readonly backupId: string;
    readonly createdAtMs: number;
    readonly region: string;
    readonly plaintextDigest: string;
    readonly chunkDigests: readonly string[];
    readonly chunkSize: number;
    readonly byteLength: number;
    readonly salt: string;
    readonly iv: string;
    readonly tag: string;
}
export interface EncryptedBackup {
    readonly manifest: BackupManifest;
    readonly ciphertext: Buffer;
}
export declare const createBackup: (plaintext: Buffer, master: Buffer | string, meta: {
    readonly backupId: string;
    readonly createdAtMs: number;
    readonly region: string;
}, chunkSize?: number) => EncryptedBackup;
/** Checks stored bytes against the manifest without needing the key: finds corrupted chunks. */
export declare const verifyChunks: (b: EncryptedBackup) => {
    readonly ok: boolean;
    readonly corruptChunks: readonly number[];
};
export declare class RestoreError extends Error {
    readonly code: 'corrupt-chunks' | 'authentication-failed' | 'digest-mismatch';
    constructor(code: 'corrupt-chunks' | 'authentication-failed' | 'digest-mismatch', message?: string);
}
export declare const restoreBackup: (b: EncryptedBackup, master: Buffer | string) => Buffer;
export interface RecoveryObjectives {
    readonly rpoMs: number;
    readonly rtoMs: number;
}
export interface RecoveryEvaluation {
    readonly rpoMet: boolean;
    readonly rtoMet: boolean;
    readonly dataLossMs: number;
    readonly recoveryMs: number;
}
export declare const evaluateRecovery: (obj: RecoveryObjectives, lastBackupAtMs: number, incidentAtMs: number, restoredAtMs: number) => RecoveryEvaluation;
export interface RegionState {
    readonly region: string;
    readonly healthy: boolean;
    readonly replicaLagMs: number;
    readonly capacityHeadroom: number;
    readonly priority: number;
}
export interface FailoverPlan {
    readonly action: 'stay' | 'failover' | 'blocked';
    readonly target?: string;
    readonly reasons: readonly string[];
}
/** Chooses a failover target without ever promoting a replica beyond the RPO or lacking headroom for the load. */
export declare const planRegionalFailover: (primary: string, regions: readonly RegionState[], objectives: RecoveryObjectives, requiredHeadroom: number) => FailoverPlan;
//# sourceMappingURL=disaster-recovery.d.ts.map