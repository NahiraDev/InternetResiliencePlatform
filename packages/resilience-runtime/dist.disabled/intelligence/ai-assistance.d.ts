/**
 * Phase 123 — Decision Intelligence & AI Assistance.
 *
 * AI is strictly advisory. This module builds an allow-listed, redacted context
 * for an external advisory model, validates the model's reply against a closed
 * schema, and lets it only re-rank candidates the canonical planner already
 * produced. The model can never add an action, change an intent, supply
 * capabilities or lower a safety requirement, and a slow or failing model
 * degrades to "no advice" rather than blocking the loop.
 */
import { type SanitisedAction } from '../security/trust-boundaries.js';
import type { CandidateAction } from '../domain/types.js';
export interface AdvisoryModelPort {
    advise(context: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown>;
}
export interface AdvisoryReply {
    readonly ranking: readonly {
        readonly candidateId: string;
        readonly weight: number;
    }[];
    readonly rationale: string;
}
export type AdvisoryOutcome = {
    readonly status: 'applied';
    readonly ordered: readonly CandidateAction[];
    readonly rationale: string;
    readonly ignored: readonly string[];
} | {
    readonly status: 'no-advice';
    readonly ordered: readonly CandidateAction[];
    readonly reason: 'timeout' | 'model-error' | 'invalid-reply' | 'empty';
};
export declare const AI_CONTEXT_ALLOW_LIST: readonly ["incidentClass", "affectedComponents", "candidateSummaries", "objectives", "recentOutcomes"];
/** Allow-listed and redacted; raw configuration, hostnames and secrets never reach the model. */
export declare const buildAdvisoryContext: (raw: Readonly<Record<string, unknown>>, candidates: readonly CandidateAction[]) => Readonly<Record<string, unknown>>;
/** Closed-schema validation; unknown fields or out-of-range weights invalidate the whole reply. */
export declare const parseAdvisoryReply: (value: unknown) => AdvisoryReply | undefined;
/** Canonical score used when the model has no opinion; AI weight only adjusts, bounded by `maxInfluence`. */
export declare const canonicalScore: (c: CandidateAction) => number;
export declare const applyAdvisory: (candidates: readonly CandidateAction[], reply: AdvisoryReply, maxInfluence?: number) => AdvisoryOutcome;
export declare const consultAdvisoryModel: (port: AdvisoryModelPort | undefined, rawContext: Readonly<Record<string, unknown>>, candidates: readonly CandidateAction[], options?: {
    readonly timeoutMs?: number;
    readonly maxInfluence?: number;
}) => Promise<AdvisoryOutcome>;
/** The single form in which an AI-influenced choice may advance: canonical intent and capabilities only. */
export declare const sanitizeChosenCandidate: (chosen: CandidateAction, rationale?: string) => SanitisedAction;
//# sourceMappingURL=ai-assistance.d.ts.map