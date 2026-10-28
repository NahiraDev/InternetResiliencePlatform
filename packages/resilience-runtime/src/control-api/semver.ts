/** Minimal strict semantic-version helpers shared by the control-API phases. */
export interface SemVer { readonly major: number; readonly minor: number; readonly patch: number }

export const parseSemVer = (text: string): SemVer => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (!m) throw new Error(`invalid semantic version: ${text}`);
  return Object.freeze({ major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) });
};

export const compareSemVer = (a: SemVer, b: SemVer): number => a.major - b.major || a.minor - b.minor || a.patch - b.patch;

/** Supports `^x.y.z` (same major, >=), `~x.y.z` (same minor, >=), `>=x.y.z`, and exact `x.y.z`. */
export const satisfies = (version: string, range: string): boolean => {
  const v = parseSemVer(version); const r = range.trim();
  if (r.startsWith('^')) { const b = parseSemVer(r.slice(1)); return v.major === b.major && compareSemVer(v, b) >= 0; }
  if (r.startsWith('~')) { const b = parseSemVer(r.slice(1)); return v.major === b.major && v.minor === b.minor && compareSemVer(v, b) >= 0; }
  if (r.startsWith('>=')) return compareSemVer(v, parseSemVer(r.slice(2))) >= 0;
  return compareSemVer(v, parseSemVer(r)) === 0;
};
