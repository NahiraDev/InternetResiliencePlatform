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

import { SecretSentry } from '../security/secrets.js';
import { enforceAiAdvisoryBoundary, type SanitisedAction } from '../security/trust-boundaries.js';
import type { ActionIntent, CandidateAction } from '../domain/types.js';

export interface AdvisoryModelPort {
  advise(context: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown>;
}

export interface AdvisoryReply {
  readonly ranking: readonly { readonly candidateId: string; readonly weight: number }[];
  readonly rationale: string;
}

export type AdvisoryOutcome =
  | { readonly status: 'applied'; readonly ordered: readonly CandidateAction[]; readonly rationale: string; readonly ignored: readonly string[] }
  | { readonly status: 'no-advice'; readonly ordered: readonly CandidateAction[]; readonly reason: 'timeout' | 'model-error' | 'invalid-reply' | 'empty' };

export const AI_CONTEXT_ALLOW_LIST = ['incidentClass', 'affectedComponents', 'candidateSummaries', 'objectives', 'recentOutcomes'] as const;

const sentry = new SecretSentry();

/** Allow-listed and redacted; raw configuration, hostnames and secrets never reach the model. */
export const buildAdvisoryContext = (raw: Readonly<Record<string, unknown>>, candidates: readonly CandidateAction[]): Readonly<Record<string, unknown>> =>
  Object.freeze(sentry.aiContext({
    ...raw,
    candidateSummaries: candidates.map((c) => ({ id: c.id, intent: c.intent, expectedBenefit: c.expectedBenefit, risk: c.risk, confidence: c.confidence })),
  }, AI_CONTEXT_ALLOW_LIST));

/** Closed-schema validation; unknown fields or out-of-range weights invalidate the whole reply. */
export const parseAdvisoryReply = (value: unknown): AdvisoryReply | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (keys.some((k) => k !== 'ranking' && k !== 'rationale')) return undefined;
  if (!Array.isArray(v.ranking) || typeof v.rationale !== 'string' || v.rationale.length > 2_000) return undefined;
  if (v.ranking.length > 50) return undefined;
  const ranking: { candidateId: string; weight: number }[] = [];
  for (const item of v.ranking) {
    if (typeof item !== 'object' || item === null) return undefined;
    const r = item as Record<string, unknown>;
    if (Object.keys(r).some((k) => k !== 'candidateId' && k !== 'weight')) return undefined;
    if (typeof r.candidateId !== 'string' || typeof r.weight !== 'number' || !Number.isFinite(r.weight) || r.weight < 0 || r.weight > 1) return undefined;
    ranking.push({ candidateId: r.candidateId, weight: r.weight });
  }
  return Object.freeze({ ranking: Object.freeze(ranking), rationale: sentry.redact(v.rationale, 'ai-context').value as string });
};

/** Canonical score used when the model has no opinion; AI weight only adjusts, bounded by `maxInfluence`. */
export const canonicalScore = (c: CandidateAction): number => c.expectedBenefit * c.confidence - c.risk * 0.5;

export const applyAdvisory = (candidates: readonly CandidateAction[], reply: AdvisoryReply, maxInfluence = 0.25): AdvisoryOutcome => {
  const known = new Map(candidates.map((c) => [c.id, c]));
  const weights = new Map<string, number>();
  const ignored: string[] = [];
  for (const r of reply.ranking) { if (known.has(r.candidateId)) weights.set(r.candidateId, r.weight); else ignored.push(r.candidateId); }
  const infl = Math.max(0, Math.min(0.5, maxInfluence));
  const scored = candidates.map((c) => ({ c, s: canonicalScore(c) + infl * (weights.get(c.id) ?? 0) }));
  // Candidates with rejection reasons or unsafe canonical scores can never be promoted above acceptable ones.
  const ordered = scored.sort((a, b) => (a.c.rejectionReasons.length > 0 ? 1 : 0) - (b.c.rejectionReasons.length > 0 ? 1 : 0) || b.s - a.s || a.c.id.localeCompare(b.c.id)).map((x) => x.c);
  return Object.freeze({ status: 'applied' as const, ordered: Object.freeze(ordered), rationale: reply.rationale, ignored: Object.freeze(ignored) });
};

export const consultAdvisoryModel = async (
  port: AdvisoryModelPort | undefined, rawContext: Readonly<Record<string, unknown>>, candidates: readonly CandidateAction[],
  options: { readonly timeoutMs?: number; readonly maxInfluence?: number } = {},
): Promise<AdvisoryOutcome> => {
  const fallback = (reason: 'timeout' | 'model-error' | 'invalid-reply' | 'empty'): AdvisoryOutcome =>
    Object.freeze({ status: 'no-advice' as const, ordered: Object.freeze([...candidates].sort((a, b) => canonicalScore(b) - canonicalScore(a) || a.id.localeCompare(b.id))), reason });
  if (!port || candidates.length === 0) return fallback('empty');
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => { ctl.abort(); resolve('timeout'); }, options.timeoutMs ?? 2_000); });
    const result = await Promise.race([port.advise(buildAdvisoryContext(rawContext, candidates), ctl.signal), timeout]);
    if (result === 'timeout') return fallback('timeout');
    const reply = parseAdvisoryReply(result);
    return reply ? applyAdvisory(candidates, reply, options.maxInfluence) : fallback('invalid-reply');
  } catch { return fallback('model-error'); } finally { if (timer) clearTimeout(timer); }
};

/** The single form in which an AI-influenced choice may advance: canonical intent and capabilities only. */
export const sanitizeChosenCandidate = (chosen: CandidateAction, rationale?: string): SanitisedAction =>
  enforceAiAdvisoryBoundary({ canonicalIntent: chosen.intent as ActionIntent, canonicalCapabilities: chosen.requiredCapabilities, ...(rationale ? { ai: { rationale } } : {}) });
