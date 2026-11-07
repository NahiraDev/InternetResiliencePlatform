/**
 * Phase 142 — Data Classification, Retention & Deletion.
 *
 * Classification levels with per-class retention, legal holds, a deletion
 * planner that never deletes held or still-retained records, and tamper-evident
 * deletion receipts. The planner is pure; executing a plan is the store's job.
 */
export type DataClass = 'public' | 'internal' | 'confidential' | 'restricted';
export interface RetentionRule {
    readonly dataClass: DataClass;
    readonly retainMs: number;
    readonly maxRetainMs: number;
}
export interface DataRecordMeta {
    readonly id: string;
    readonly dataClass: DataClass;
    readonly createdAtMs: number;
    readonly subject?: string;
    readonly tenant?: string;
}
export interface LegalHold {
    readonly id: string;
    readonly reason: string;
    readonly tenant?: string;
    readonly subject?: string;
    readonly releasedAtMs?: number;
}
export declare const DEFAULT_RETENTION: readonly RetentionRule[];
export declare const validateRetention: (rules: readonly RetentionRule[]) => readonly string[];
export interface DeletionPlan {
    readonly delete: readonly string[];
    readonly retained: readonly string[];
    readonly held: readonly {
        readonly id: string;
        readonly holdId: string;
    }[];
    readonly overdue: readonly string[];
}
export declare const planDeletion: (records: readonly DataRecordMeta[], rules: readonly RetentionRule[], holds: readonly LegalHold[], nowMs: number, erasureSubjects?: readonly string[]) => DeletionPlan;
export interface DeletionReceipt {
    readonly recordId: string;
    readonly dataClass: DataClass;
    readonly deletedAtMs: number;
    readonly basis: 'retention-expired' | 'subject-erasure';
    readonly digest: string;
}
/** A receipt proves a record was deleted without retaining its content: only a digest of its metadata. */
export declare const deletionReceipt: (r: DataRecordMeta, deletedAtMs: number, basis: DeletionReceipt["basis"]) => DeletionReceipt;
/** The strictest class wins when data of several classes is combined. */
export declare const combineClasses: (classes: readonly DataClass[]) => DataClass;
export declare const canFlow: (from: DataClass, to: DataClass) => boolean;
//# sourceMappingURL=data-lifecycle.d.ts.map