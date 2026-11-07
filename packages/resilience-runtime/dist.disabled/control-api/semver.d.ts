/** Minimal strict semantic-version helpers shared by the control-API phases. */
export interface SemVer {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
}
export declare const parseSemVer: (text: string) => SemVer;
export declare const compareSemVer: (a: SemVer, b: SemVer) => number;
/** Supports `^x.y.z` (same major, >=), `~x.y.z` (same minor, >=), `>=x.y.z`, and exact `x.y.z`. */
export declare const satisfies: (version: string, range: string) => boolean;
//# sourceMappingURL=semver.d.ts.map