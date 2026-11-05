/**
 * Phase 145 — Compliance & Operational Evidence Framework.
 *
 * Maps controls to evidence items with freshness requirements, flags missing,
 * stale and failing controls, and seals an evidence bundle with a content
 * digest and HMAC so it can be handed to an assessor and verified later.
 * It records evidence of what exists; it never asserts certification.
 */
export interface ControlDefinition {
    readonly id: string;
    readonly title: string;
    readonly requiredEvidence: readonly string[];
    readonly maxAgeMs: number;
}
export interface EvidenceItem {
    readonly id: string;
    readonly kind: string;
    readonly controlIds: readonly string[];
    readonly collectedAtMs: number;
    readonly result: 'pass' | 'fail' | 'informational';
    readonly digest: string;
    readonly source: string;
}
export type ControlStatus = 'satisfied' | 'missing-evidence' | 'stale-evidence' | 'failing';
export interface ControlAssessment {
    readonly controlId: string;
    readonly status: ControlStatus;
    readonly missingKinds: readonly string[];
    readonly staleKinds: readonly string[];
    readonly failingEvidence: readonly string[];
}
export declare const evidenceDigest: (content: string | Buffer) => string;
export declare const assessControls: (controls: readonly ControlDefinition[], evidence: readonly EvidenceItem[], nowMs: number) => readonly ControlAssessment[];
export interface EvidenceBundle {
    readonly generatedAtMs: number;
    readonly assessments: readonly ControlAssessment[];
    readonly evidence: readonly EvidenceItem[];
    readonly coverage: number;
    readonly digest: string;
    readonly seal: string;
}
export declare const sealEvidenceBundle: (controls: readonly ControlDefinition[], evidence: readonly EvidenceItem[], nowMs: number, key: Buffer | string) => EvidenceBundle;
export declare const verifyEvidenceBundle: (b: EvidenceBundle, key: Buffer | string) => boolean;
/** A plain-language gap list: what must be collected or fixed before the bundle can show full coverage. */
export declare const gapReport: (assessments: readonly ControlAssessment[]) => readonly string[];
//# sourceMappingURL=compliance-evidence.d.ts.map