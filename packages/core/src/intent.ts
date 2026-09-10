export type IntentStatus = 'draft' | 'active' | 'completed' | 'superseded' | 'cancelled' | 'expired';
export type IntentPriority = 'low' | 'normal' | 'high' | 'critical';
export interface NetworkIntentSpec { readonly outcome: string; readonly constraints?: Readonly<Record<string, string | number | boolean>>; readonly target?: Readonly<Record<string, string>>; }
export interface NetworkIntent { readonly id: string; readonly version: number; readonly status: IntentStatus; readonly priority: IntentPriority; readonly spec: NetworkIntentSpec; readonly createdAt: string; readonly updatedAt: string; readonly effectiveFrom?: string; readonly expiresAt?: string; readonly supersedes?: string; readonly metadata?: Readonly<Record<string, string>>; }
export type IntentCommand =
  | { readonly type: 'activate'; readonly at?: string }
  | { readonly type: 'complete'; readonly at?: string }
  | { readonly type: 'supersede'; readonly at?: string; readonly replacementId: string }
  | { readonly type: 'cancel'; readonly at?: string }
  | { readonly type: 'expire'; readonly at?: string };
const TERMINAL: ReadonlySet<IntentStatus> = new Set(['completed', 'superseded', 'cancelled', 'expired']);
const TRANSITIONS: Readonly<Record<IntentStatus, readonly IntentStatus[]>> = { draft: ['active', 'cancelled', 'expired'], active: ['completed', 'superseded', 'cancelled', 'expired'], completed: [], superseded: [], cancelled: [], expired: [] };
const iso = (value: string | undefined, field: string): string | undefined => { if (value === undefined) return undefined; const date = new Date(value); if (Number.isNaN(date.getTime())) throw new RangeError(`${field} must be a valid ISO-8601 timestamp`); return date.toISOString(); };
const requireId = (value: string, field: string): void => { if (!value.trim()) throw new TypeError(`${field} must not be empty`); };
export const createNetworkIntent = (input: Omit<NetworkIntent, 'version' | 'status' | 'createdAt' | 'updatedAt'> & Partial<Pick<NetworkIntent, 'createdAt' | 'updatedAt'>>): NetworkIntent => {
  requireId(input.id, 'id');
  if (!input.spec.outcome.trim()) throw new TypeError('spec.outcome must not be empty');
  const createdAt = iso(input.createdAt, 'createdAt') ?? new Date().toISOString();
  const updatedAt = iso(input.updatedAt, 'updatedAt') ?? createdAt;
  const effectiveFrom = iso(input.effectiveFrom, 'effectiveFrom');
  const expiresAt = iso(input.expiresAt, 'expiresAt');
  if (effectiveFrom && expiresAt && effectiveFrom >= expiresAt) throw new RangeError('effectiveFrom must be earlier than expiresAt');
  return Object.freeze({ ...input, version: 1, status: 'draft' as const, createdAt, updatedAt, ...(effectiveFrom ? { effectiveFrom } : {}), ...(expiresAt ? { expiresAt } : {}) });
};
export const transitionIntent = (intent: NetworkIntent, command: IntentCommand): NetworkIntent => {
  const target: IntentStatus = command.type === 'activate' ? 'active' : command.type === 'complete' ? 'completed' : command.type === 'supersede' ? 'superseded' : command.type === 'cancel' ? 'cancelled' : 'expired';
  if (TERMINAL.has(intent.status)) throw new Error(`Cannot transition terminal intent ${intent.id} from ${intent.status}`);
  if (!TRANSITIONS[intent.status].includes(target)) throw new Error(`Invalid intent transition ${intent.status} -> ${target}`);
  if (command.type === 'supersede') requireId(command.replacementId, 'replacementId');
  const updatedAt = iso(command.at, 'at') ?? new Date().toISOString();
  return Object.freeze({ ...intent, version: intent.version + 1, status: target, updatedAt, ...(command.type === 'supersede' ? { supersedes: command.replacementId } : {}) });
};
export const isIntentTerminal = (intent: NetworkIntent): boolean => TERMINAL.has(intent.status);
export const isIntentEffective = (intent: NetworkIntent, at = new Date()): boolean => { if (intent.status !== 'active') return false; const timestamp = at.getTime(); const from = intent.effectiveFrom ? Date.parse(intent.effectiveFrom) : Number.NEGATIVE_INFINITY; const expires = intent.expiresAt ? Date.parse(intent.expiresAt) : Number.POSITIVE_INFINITY; return timestamp >= from && timestamp < expires; };
