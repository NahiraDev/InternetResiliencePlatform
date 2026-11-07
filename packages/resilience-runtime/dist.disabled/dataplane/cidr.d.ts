/**
 * Shared IPv4/IPv6 address and CIDR primitives for the data-plane phases.
 * Pure BigInt arithmetic; no I/O and no platform dependencies.
 */
export type IpFamily = 4 | 6;
export interface ParsedAddress {
    readonly family: IpFamily;
    readonly value: bigint;
}
export interface ParsedCidr {
    readonly family: IpFamily;
    readonly network: bigint;
    readonly prefix: number;
    readonly bits: number;
}
export declare class AddressError extends Error {
    constructor(message: string);
}
export declare const parseAddress: (text: string) => ParsedAddress;
export declare const parseCidr: (text: string) => ParsedCidr;
export declare const cidrContains: (cidr: ParsedCidr, address: ParsedAddress) => boolean;
export declare const cidrOverlaps: (a: ParsedCidr, b: ParsedCidr) => boolean;
/** True when `inner` is wholly contained in `outer`. */
export declare const cidrWithin: (inner: ParsedCidr, outer: ParsedCidr) => boolean;
export declare const cidrSize: (c: ParsedCidr) => bigint;
export declare const formatAddress: (family: IpFamily, value: bigint) => string;
export declare const formatCidr: (c: ParsedCidr) => string;
//# sourceMappingURL=cidr.d.ts.map