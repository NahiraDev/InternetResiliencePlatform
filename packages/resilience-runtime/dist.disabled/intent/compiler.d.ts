import { type IntentObjective, type NetworkIntent } from '@irp/core';
import type { CompiledIntent } from '../domain/types.js';
export type { IntentObjective };
/**
 * Converts a declarative, active NetworkIntent into bounded runtime inputs.
 * This function only compiles evidence/constraints; it cannot authorize or
 * execute a network mutation.
 */
export declare const compileNetworkIntent: (intent: NetworkIntent, at?: Date) => CompiledIntent;
/**
 * Revalidates a compiled intent at the point it is consumed. Compilation and
 * execution may be separated by a scheduler/queue, so checking only the
 * source NetworkIntent at compilation time would allow an expired intent to
 * remain executable.
 */
export declare const isCompiledIntentEffective: (intent: CompiledIntent, at?: Date) => boolean;
//# sourceMappingURL=compiler.d.ts.map