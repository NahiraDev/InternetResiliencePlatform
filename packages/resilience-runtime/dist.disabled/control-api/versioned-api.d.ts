/**
 * Phase 135 — Versioned Control-Plane API.
 *
 * A transport-independent request dispatcher: versioned routes, closed-schema
 * input validation, capability-based authorization against a verified actor,
 * idempotency keys, and a uniform response envelope. Handlers receive an
 * authorized context and return data; mutating handlers must go through the
 * privileged mutation boundary themselves — the API itself holds no authority.
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';
export interface FieldSpec {
    readonly type: FieldType;
    readonly required?: boolean;
    readonly maxLength?: number;
    readonly min?: number;
    readonly max?: number;
    readonly pattern?: RegExp;
    readonly oneOf?: readonly (string | number)[];
}
export type ObjectSchema = Readonly<Record<string, FieldSpec>>;
export interface ApiActor {
    readonly id: string;
    readonly capabilities: readonly string[];
    readonly tenant?: string;
}
export interface ApiRequest {
    readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    readonly path: string;
    readonly version: string;
    readonly actor?: ApiActor;
    readonly body?: unknown;
    readonly query?: Readonly<Record<string, string>>;
    readonly idempotencyKey?: string;
    readonly requestId: string;
}
export interface ApiContext<TInput> {
    readonly actor: ApiActor;
    readonly input: TInput;
    readonly requestId: string;
    readonly params: Readonly<Record<string, string>>;
}
export interface ApiRoute<TInput = Record<string, unknown>, TOutput = unknown> {
    readonly method: ApiRequest['method'];
    readonly path: string;
    readonly since: string;
    readonly until?: string;
    readonly capability: string;
    readonly schema: ObjectSchema;
    readonly mutating?: boolean;
    handler(ctx: ApiContext<TInput>): Promise<TOutput> | TOutput;
}
export type ApiErrorCode = 'unauthenticated' | 'forbidden' | 'not-found' | 'invalid-request' | 'unsupported-version' | 'idempotency-conflict' | 'internal';
export interface ApiResponse<T = unknown> {
    readonly status: number;
    readonly requestId: string;
    readonly version: string;
    readonly data?: T;
    readonly error?: {
        readonly code: ApiErrorCode;
        readonly message: string;
        readonly details?: readonly string[];
    };
    readonly replayed?: boolean;
}
export declare const validateAgainstSchema: (value: unknown, schema: ObjectSchema) => {
    readonly ok: boolean;
    readonly errors: readonly string[];
    readonly value: Record<string, unknown>;
};
export interface ControlApiOptions {
    readonly supportedVersions: readonly string[];
    readonly idempotencyTtlMs?: number;
    readonly idempotencyCapacity?: number;
    readonly nowMs?: () => number;
}
export declare class ControlApi {
    private readonly options;
    private readonly routes;
    private readonly idem;
    private readonly now;
    constructor(options: ControlApiOptions);
    register<TIn, TOut>(route: ApiRoute<TIn, TOut>): void;
    describe(): readonly {
        method: string;
        path: string;
        since: string;
        until?: string;
        capability: string;
        mutating: boolean;
    }[];
    private fail;
    dispatch(req: ApiRequest): Promise<ApiResponse>;
    private evict;
}
//# sourceMappingURL=versioned-api.d.ts.map