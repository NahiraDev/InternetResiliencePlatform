/**
 * Shared IPv4/IPv6 address and CIDR primitives for the data-plane phases.
 * Pure BigInt arithmetic; no I/O and no platform dependencies.
 */

export type IpFamily = 4 | 6;
export interface ParsedAddress { readonly family: IpFamily; readonly value: bigint }
export interface ParsedCidr { readonly family: IpFamily; readonly network: bigint; readonly prefix: number; readonly bits: number }

export class AddressError extends Error {
  constructor(message: string) { super(message); this.name = 'AddressError'; }
}

const parseV4 = (text: string): bigint => {
  const parts = text.split('.');
  if (parts.length !== 4) throw new AddressError(`invalid IPv4 address: ${text}`);
  let v = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) throw new AddressError(`invalid IPv4 address: ${text}`);
    const n = Number(p);
    if (n > 255) throw new AddressError(`invalid IPv4 address: ${text}`);
    v = (v << 8n) | BigInt(n);
  }
  return v;
};

const parseV6 = (text: string): bigint => {
  if (text.includes('%')) throw new AddressError('zone identifiers are not supported');
  const halves = text.split('::');
  if (halves.length > 2) throw new AddressError(`invalid IPv6 address: ${text}`);
  const toGroups = (s: string): number[] => s === '' ? [] : s.split(':').flatMap((g) => {
    if (g.includes('.')) { const v4 = parseV4(g); return [Number(v4 >> 16n), Number(v4 & 0xffffn)]; }
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) throw new AddressError(`invalid IPv6 address: ${text}`);
    return [Number.parseInt(g, 16)];
  });
  const head = toGroups(halves[0] as string);
  const tail = halves.length === 2 ? toGroups(halves[1] as string) : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && head.length !== 8) || (halves.length === 2 && missing < 1)) throw new AddressError(`invalid IPv6 address: ${text}`);
  const groups = halves.length === 2 ? [...head, ...Array(missing).fill(0) as number[], ...tail] : head;
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
};

export const parseAddress = (text: string): ParsedAddress => {
  const t = text.trim();
  return t.includes(':') ? { family: 6, value: parseV6(t) } : { family: 4, value: parseV4(t) };
};

export const parseCidr = (text: string): ParsedCidr => {
  const [addr, prefixText, extra] = text.trim().split('/');
  if (!addr || extra !== undefined) throw new AddressError(`invalid CIDR: ${text}`);
  const a = parseAddress(addr);
  const bits = a.family === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? bits : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits || (prefixText !== undefined && !/^\d+$/.test(prefixText))) throw new AddressError(`invalid prefix length in ${text}`);
  const hostBits = BigInt(bits - prefix);
  const network = (a.value >> hostBits) << hostBits;
  return Object.freeze({ family: a.family, network, prefix, bits });
};

export const cidrContains = (cidr: ParsedCidr, address: ParsedAddress): boolean =>
  cidr.family === address.family && (address.value >> BigInt(cidr.bits - cidr.prefix)) === (cidr.network >> BigInt(cidr.bits - cidr.prefix));

export const cidrOverlaps = (a: ParsedCidr, b: ParsedCidr): boolean => {
  if (a.family !== b.family) return false;
  const p = Math.min(a.prefix, b.prefix);
  const shift = BigInt(a.bits - p);
  return (a.network >> shift) === (b.network >> shift);
};

/** True when `inner` is wholly contained in `outer`. */
export const cidrWithin = (inner: ParsedCidr, outer: ParsedCidr): boolean => inner.family === outer.family && inner.prefix >= outer.prefix && cidrOverlaps(inner, outer);

export const cidrSize = (c: ParsedCidr): bigint => 1n << BigInt(c.bits - c.prefix);

export const formatAddress = (family: IpFamily, value: bigint): string => {
  if (family === 4) return [24n, 16n, 8n, 0n].map((s) => String((value >> s) & 0xffn)).join('.');
  const groups = Array.from({ length: 8 }, (_, i) => Number((value >> BigInt((7 - i) * 16)) & 0xffffn).toString(16));
  // Compress the longest run of zero groups.
  let bestStart = -1; let bestLen = 0;
  for (let i = 0; i < 8;) {
    if (groups[i] !== '0') { i += 1; continue; }
    let j = i; while (j < 8 && groups[j] === '0') j += 1;
    if (j - i > bestLen) { bestStart = i; bestLen = j - i; }
    i = j;
  }
  if (bestLen < 2) return groups.join(':');
  return `${groups.slice(0, bestStart).join(':')}::${groups.slice(bestStart + bestLen).join(':')}`;
};

export const formatCidr = (c: ParsedCidr): string => `${formatAddress(c.family, c.network)}/${c.prefix}`;
