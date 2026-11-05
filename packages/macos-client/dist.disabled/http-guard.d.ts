import type { IncomingMessage } from 'node:http';
export declare const MAX_CONTROL_BODY_BYTES = 1024;
export interface GuardVerdict {
    readonly ok: boolean;
    readonly status: number;
    readonly reason: string;
}
export declare const isLoopbackPeer: (address: string | undefined) => boolean;
/** `host` must be `<loopback name>:<port>` (or the bare name when the port is the scheme default). */
export declare const isAllowedHost: (host: string | undefined, port: number) => boolean;
/** Checks that apply to every request, reads included. */
export declare const guardRequest: (request: IncomingMessage, port: number) => GuardVerdict;
export declare const tokenMatches: (presented: string | undefined, expected: string) => boolean;
/** Checks specific to state-changing requests. */
export declare const guardStateChange: (request: IncomingMessage, token: string | undefined) => GuardVerdict;
export declare const readBoundedBody: (request: IncomingMessage) => Promise<string | GuardVerdict>;
/** Accepts exactly `{"autonomousMode": boolean}`. */
export declare const parseAutonomyRequest: (body: string) => {
    enabled: boolean;
} | GuardVerdict;
/** Creates a fresh token and writes it (atomically, 0600) so only the file's owner can read it. */
export declare const issueControlToken: (path: string) => string;
