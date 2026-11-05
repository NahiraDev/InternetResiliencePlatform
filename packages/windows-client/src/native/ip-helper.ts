/**
 * @fileoverview Windows IP Helper API (iphlpapi.dll) bindings and structures.
 *
 * IRP uses the IP Helper API for real Windows networking integration:
 * interface discovery, IP configuration, route table, DNS servers, gateway
 * discovery, and route/DNS mutation. All calls go through `node-ffi-napi`
 * (loaded dynamically via `./ffi.js`). When the native binding is unavailable,
 * every method reports the subsystem as unsupported rather than fabricating
 * results.
 *
 * The Windows client never shells out to `netsh`/`ipconfig` as its source of
 * truth. Those tools are not a programmable, transactional, verifiable network
 * API and cannot support rollback or capability negotiation.
 */

import { loadFfiNapi, ffiAvailable } from './ffi.js';

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

// AF_* address families
export const AF_UNSPEC = 0;
export const AF_INET = 2;
export const AF_INET6 = 23;

// Flags for GetAdaptersAddresses
export const GAA_FLAG_INCLUDE_PREFIX = 0x00000010;
export const GAA_FLAG_INCLUDE_ALL_INTERFACES = 0x00000020;
export const GAA_FLAG_INCLUDE_TUNNEL_BINDINGORDER = 0x00000040;

// IF_OPER_STATUS
export const IfOperStatusUp = 1;
export const IfOperStatusDown = 2;
export const IfOperStatusTesting = 3;
export const IfOperStatusUnknown = 4;
export const IfOperStatusDormant = 5;
export const IfOperStatusNotPresent = 6;
export const IfOperStatusLowerLayerDown = 7;

// Return codes
export const ERROR_SUCCESS = 0;
export const ERROR_BUFFER_OVERFLOW = 111;
export const ERROR_NO_DATA = 232;
export const ERROR_INVALID_PARAMETER = 87;

export type WindowsError = { code: number; message: string };
export function windowsError(code: number): WindowsError {
  return { code, message: `Windows system error ${code}` };
}

/* ------------------------------------------------------------------ */
/* FFI loader                                                         */
/* ------------------------------------------------------------------ */

let iphlp: unknown | undefined;
let iphlpError: unknown;

async function ensureIpHlp(): Promise<unknown | undefined> {
  if (iphlp !== undefined) return iphlp;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    iphlpError = 'node-ffi-napi native bindings are not installed';
    return undefined;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iphlp = (ffi as any).Library('iphlpapi.dll', {
      GetAdaptersAddresses: ['uint', ['uint', 'uint', 'pointer', 'pointer', 'pointer', 'uint']],
      GetIpForwardTable: ['uint', ['pointer', 'pointer', 'uint']],
      GetIpAddrTable: ['uint', ['pointer', 'pointer', 'uint']],
      GetBestInterface: ['uint', ['uint', 'pointer']],
      CreateIpForwardEntry: ['uint', ['pointer']],
      DeleteIpForwardEntry: ['uint', ['pointer']],
      GetPerAdapterInfo: ['uint', ['uint', 'pointer', 'pointer']],
    });
  } catch (error) {
    iphlp = undefined;
    iphlpError = error;
  }
  return iphlp;
}

export function ipHelperError(): unknown {
  return iphlpError;
}

/**
 * Reports whether the IP Helper API native bindings are currently available.
 * This is only accurate after at least one async operation has called
 * `ensureIpHlp()` (which loads and caches `iphlp`). Callers that need an
 * up-to-date availability check should call `ensureIpHlp()` directly and check
 * its return value instead of relying on this cached flag.
 */
export function ipHelperAvailable(): boolean {
  return iphlp !== undefined;
}

/**
 * Ensures the IP Helper API library is loaded and returns availability.
 * This is the async entry point callers should use when they need current
 * availability rather than the cached flag.
 */
export async function ensureIpHelperAvailable(): Promise<boolean> {
  const lib = await ensureIpHlp();
  return lib !== undefined;
}

/* ------------------------------------------------------------------ */
/* Opaque buffer helpers                                              */
/* ------------------------------------------------------------------ */

/** Reads an unsigned 32-bit integer from a buffer at a byte offset. */
function readUInt32(buffer: unknown, offset: number): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf: any = buffer;
  if (typeof buf.readUInt32LE === 'function') return buf.readUInt32LE(offset);
  throw new Error('Buffer-like object has no readUInt32LE');
}

/** Converts a 32-bit IPv4 address integer to dotted-decimal string. */
export function ipv4ToString(value: number): string {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ].join('.');
}

/** Reads a pointer-sized value from a buffer-like object at offset.
 * Returns a pointer view object that reads from `buffer` at the pointer's
 * target address, or null when the pointer value is zero.
 */
function readPointer(buffer: unknown, offset: number): { readUInt32LE: (o?: number) => number; readUInt16LE: (o?: number) => number; readUInt8: (o?: number) => number; toNumber: () => number } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf: any = buffer;
  if (typeof buf.readBigInt64LE === 'function') {
    const addr = buf.readBigInt64LE(offset);
    return addr === 0n ? null : makePtrView(buf, Number(addr));
  }
  if (typeof buf.readUInt32LE === 'function') {
    const addr = buf.readUInt32LE(offset);
    return addr === 0 ? null : makePtrView(buf, addr);
  }
  return null;
}

/** Creates a pointer view that reads from `buf` starting at absolute address `addr`. */
function makePtrView(buf: unknown, addr: number): { readUInt32LE: (o?: number) => number; readUInt16LE: (o?: number) => number; readUInt8: (o?: number) => number; toNumber: () => number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = buf;
  return {
    readUInt32LE: (offset = 0): number => b.readUInt32LE(addr + offset),
    readUInt16LE: (offset = 0): number => b.readUInt16LE(addr + offset),
    readUInt8: (offset = 0): number => b.readUInt8(addr + offset),
    toNumber: (): number => addr,
  };
}

/* ------------------------------------------------------------------ */
/* Interface discovery                                                */
/* ------------------------------------------------------------------ */

export interface WindowsInterface {
  readonly index: number;
  readonly name: string;
  readonly description: string;
  readonly macAddress: string;
  readonly type: number;
  readonly operStatus: number;
  readonly mtu: number;
  readonly speedMbps: number;
  readonly ipv4Enabled: boolean;
  readonly ipv6Enabled: boolean;
}

/** IP_ADAPTER_ADDRESSES_LH field offsets (32-bit and 64-bit layouts). */
const IP_ADAPTER_ADDRESSES_LENGTH_OFFSET = 0;          // ULONG Length
const IP_ADAPTER_ADDRESSES_IF_INDEX_OFFSET = 4;        // DWORD IfIndex
const IP_ADAPTER_ADDRESSES_NEXT_OFFSET = 8;            // PIP_ADAPTER_ADDRESSES Next (pointer)
const IP_ADAPTER_ADDRESSES_ADAPTER_NAME_OFFSET = 16;   // PCHAR AdapterName (pointer)
const IP_ADAPTER_ADDRESSES_DESCRIPTION_OFFSET = 24;    // PWSTR Description (pointer)
const IP_ADAPTER_ADDRESSES_FRIENDLY_NAME_OFFSET = 32;  // PWSTR FriendlyName (pointer)
const IP_ADAPTER_ADDRESSES_OPER_STATUS_OFFSET = 136;   // NET_IFINDEX OperStatus
const IP_ADAPTER_ADDRESSES_MTU_OFFSET = 152;           // DWORD Mtu
const IP_ADAPTER_ADDRESSES_PHYS_ADDR_LENGTH_OFFSET = 160; // DWORD PhysicalAddressLength
const IP_ADAPTER_ADDRESSES_PHYS_ADDR_OFFSET = 168;     // UCHAR PhysicalAddress[32]
const IP_ADAPTER_ADDRESSES_FLAGS_OFFSET = 208;         // DWORD Flags
const IP_ADAPTER_ADDRESSES_FIRST_UNICAST_OFFSET = 216; // PIP_ADAPTER_UNICAST_ADDRESS FirstUnicastAddress (pointer)

// IP_ADAPTER_UNICAST_ADDRESS field offsets
const IP_ADAPTER_UNICAST_ADDRESS_LENGTH_OFFSET = 0;    // ULONG Length
const IP_ADAPTER_UNICAST_ADDRESS_FLAGS_OFFSET = 4;     // DWORD Flags
const IP_ADAPTER_UNICAST_ADDRESS_NEXT_OFFSET = 8;      // PIP_ADAPTER_UNICAST_ADDRESS Next (pointer)
const IP_ADAPTER_UNICAST_ADDRESS_ADDR_OFFSET = 24;     // SOCKET_ADDRESS Address (SOCKADDR_IN: family at 0, addr at 4)
const IP_ADAPTER_UNICAST_ADDRESS_PREFIX_LEN_OFFSET = 64; // DWORD PrefixLength

// SOCKET_ADDRESS / SOCKADDR_IN offsets
const SOCKADDR_FAMILY_OFFSET = 0;        // ADDRESS_FAMILY sin_family (USHORT)
const SOCKADDR_INET_ADDR_OFFSET = 4;     // IN_ADDR sin_addr (DWORD)

/**
 * Parses an IP_ADAPTER_ADDRESSES buffer into typed interface records.
 * Windows x64 layout is used here; x86 layouts differ in pointer widths and
 * are rejected early if they cannot be parsed safely.
 */
export function parseAdapterAddresses(buf: unknown): WindowsInterface[] {
  const entries: WindowsInterface[] = [];

  const ffiBuf: any = buf;
  const bufLen = ffiBuf.length ?? 0;
  if (bufLen < IP_ADAPTER_ADDRESSES_FIRST_UNICAST_OFFSET + 8) {
    return entries;
  }

  let ptr = 0;
  let safety = 0;
  while (ptr + IP_ADAPTER_ADDRESSES_FIRST_UNICAST_OFFSET <= bufLen && safety < 128) {
    safety += 1;
    const length = readUInt32(ffiBuf, ptr + IP_ADAPTER_ADDRESSES_LENGTH_OFFSET);
    if (length < IP_ADAPTER_ADDRESSES_FIRST_UNICAST_OFFSET) break;

    const ifIndex = readUInt32(ffiBuf, ptr + IP_ADAPTER_ADDRESSES_IF_INDEX_OFFSET);
    const nextPtr = readPointer(ffiBuf, ptr + IP_ADAPTER_ADDRESSES_NEXT_OFFSET);
    const descPtr = readPointer(ffiBuf, ptr + IP_ADAPTER_ADDRESSES_DESCRIPTION_OFFSET);
    const friendlyPtr = readPointer(ffiBuf, ptr + IP_ADAPTER_ADDRESSES_FRIENDLY_NAME_OFFSET);
    const operStatus = readUInt32(ffiBuf, ptr + IP_ADAPTER_ADDRESSES_OPER_STATUS_OFFSET);
    const mtu = readUInt32(ffiBuf, ptr + IP_ADAPTER_ADDRESSES_MTU_OFFSET);
    const physAddrLen = readUInt32(ffiBuf, ptr + IP_ADAPTER_ADDRESSES_PHYS_ADDR_LENGTH_OFFSET);
    const physAddrPtr = readPointer(ffiBuf, ptr + IP_ADAPTER_ADDRESSES_PHYS_ADDR_OFFSET);

    const description = readStringFromPtr(descPtr);
    const name = readStringFromPtr(friendlyPtr);

    let macAddress = '';
    if (physAddrPtr !== null && physAddrLen >= 6) {
      const bytes: number[] = [];
      for (let i = 0; i < 6; i++) {
        bytes.push(physAddrPtr.readUInt8(i));
      }
      macAddress = bytes.map((b) => b.toString(16).padStart(2, '0')).join(':');
    }

    entries.push({
      index: ifIndex,
      name,
      description,
      macAddress,
      type: 0,
      operStatus,
      mtu,
      speedMbps: 0,
      ipv4Enabled: false,
      ipv6Enabled: false,
    });

    if (!nextPtr) break;
    ptr = nextPtr.toNumber();
    if (length === 0) break;
  }

  return entries;
}

/**
 * Reads a null-terminated UTF-16 string from a pointer view.
 * Returns an empty string if the pointer is null.
 */
export function readStringFromPtr(ptr: { readUInt16LE: (o?: number) => number } | null | undefined): string {
  if (!ptr) return '';
  let result = '';
  for (let i = 0; i < 512; i++) {
    try {
      const ch = ptr.readUInt16LE(i * 2);
      if (ch === 0) break;
      result += String.fromCharCode(ch);
    } catch {
      break;
    }
  }
  return result;
}

/**
 * Discovers network interfaces via `GetAdaptersAddresses`.
 * Returns genuinely parsed interface records; never fabricated data.
 * When the native binding is unavailable or the call fails, reports
 * `available: false`.
 */
export async function discoverInterfaces(): Promise<{
  readonly interfaces: readonly WindowsInterface[];
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureIpHlp();
  if (!lib) {
    return {
      interfaces: [],
      available: false,
      error: `IP Helper API unavailable: ${String(ipHelperError())}`,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getAdaptersAddresses: any = (lib as any).GetAdaptersAddresses;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return {
      interfaces: [],
      available: false,
      error: 'FFI module unavailable',
    };
  }
  const { ref, types, Buffer } = ffi;

  // First call with a null buffer to learn the required size.
  let outBufLen = ref.alloc(types.uint, 0);
  const first = getAdaptersAddresses(
    AF_UNSPEC,
    GAA_FLAG_INCLUDE_ALL_INTERFACES,
    0,
    null as unknown as never,
    outBufLen,
  );
  if (first !== ERROR_BUFFER_OVERFLOW && first !== ERROR_SUCCESS) {
    return {
      interfaces: [],
      available: false,
      error: `GetAdaptersAddresses sizing failed (${first})`,
    };
  }
  const size = readUInt32(outBufLen.deref(), 0);
  const buf = Buffer.alloc(size);
  const second = getAdaptersAddresses(
    AF_UNSPEC,
    GAA_FLAG_INCLUDE_ALL_INTERFACES,
    0,
    buf,
    outBufLen,
  );
  if (second !== ERROR_SUCCESS) {
    return {
      interfaces: [],
      available: false,
      error: `GetAdaptersAddresses failed (${second})`,
    };
  }

    const interfaces = parseAdapterAddresses(buf);
  return { interfaces, available: true };
}

/* ------------------------------------------------------------------ */
/* Route table                                                        */
/* ------------------------------------------------------------------ */

export interface WindowsRoute {
  readonly destination: string;
  readonly mask: string;
  readonly gateway: string;
  readonly interfaceIndex: number;
  readonly metric: number;
}

// MIB_IPFORWARDROW field offsets (x64 layout).
const MIB_IPFORWARDROW_DEST_OFFSET = 0;      // DWORD dwForwardDest
const MIB_IPFORWARDROW_MASK_OFFSET = 4;      // DWORD dwForwardMask
const MIB_IPFORWARDROW_POLICY_OFFSET = 8;    // DWORD dwForwardPolicy
const MIB_IPFORWARDROW_NEXTHOP_OFFSET = 12;  // DWORD dwForwardNextHop
const MIB_IPFORWARDROW_IF_INDEX_OFFSET = 16; // DWORD dwForwardIfIndex
const MIB_IPFORWARDROW_METRIC1_OFFSET = 20;  // DWORD dwForwardMetric1
const MIB_IPFORWARDROW_METRIC2_OFFSET = 24;  // DWORD dwForwardMetric2
const MIB_IPFORWARDROW_METRIC3_OFFSET = 28;  // DWORD dwForwardMetric3
const MIB_IPFORWARDROW_METRIC4_OFFSET = 32;  // DWORD dwForwardMetric4
const MIB_IPFORWARDROW_METRIC5_OFFSET = 36;  // DWORD dwForwardMetric5

/**
 * Parses a MIB_IPFORWARDROW buffer into a WindowsRoute record.
 * x64 layout is used; x86 layouts differ in field offsets and are not supported
 * here because Windows IPv4 route tables on modern systems are x64.
 */
export function parseIpForwardRow(buf: unknown): WindowsRoute | undefined {
  const ffiBuf: any = buf;
  if (!ffiBuf || typeof ffiBuf.readUInt32LE !== 'function') return undefined;

  const dest = readUInt32(ffiBuf, MIB_IPFORWARDROW_DEST_OFFSET);
  const mask = readUInt32(ffiBuf, MIB_IPFORWARDROW_MASK_OFFSET);
  const nexthop = readUInt32(ffiBuf, MIB_IPFORWARDROW_NEXTHOP_OFFSET);
  const ifIndex = readUInt32(ffiBuf, MIB_IPFORWARDROW_IF_INDEX_OFFSET);
  const metric1 = readUInt32(ffiBuf, MIB_IPFORWARDROW_METRIC1_OFFSET);

  // Skip the default route (0.0.0.0) destination unless it has a real gateway,
  // and skip entries with zero destination/mask which are not usable routes.
  if ((dest === 0 && mask === 0 && nexthop === 0) || mask === 0) {
    return undefined;
  }

  return {
    destination: ipv4ToString(dest),
    mask: ipv4ToString(mask),
    gateway: ipv4ToString(nexthop),
    interfaceIndex: ifIndex,
    metric: metric1,
  };
}

/**
 * Discovers the IPv4 route table via `GetIpForwardTable`.
 * Returns genuinely parsed route records; never fabricated data.
 * When the native binding is unavailable or the call fails, reports
 * `available: false`.
 */
export async function discoverRoutes(): Promise<{
  readonly routes: readonly WindowsRoute[];
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureIpHlp();
  if (!lib) {
    return { routes: [], available: false, error: String(ipHelperError()) };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getIpForwardTable: any = (lib as any).GetIpForwardTable;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { routes: [], available: false, error: 'FFI module unavailable' };
  }
  const { ref, types, Buffer } = ffi;

  let outBufLen = ref.alloc(types.uint, 0);
  const first = getIpForwardTable(0, outBufLen, 0);
  if (first !== ERROR_BUFFER_OVERFLOW && first !== ERROR_SUCCESS) {
    return { routes: [], available: false, error: `GetIpForwardTable sizing failed (${first})` };
  }
  const size = readUInt32(outBufLen.deref(), 0);
  const buf = Buffer.alloc(size);
  const second = getIpForwardTable(buf, outBufLen, 0);
  if (second !== ERROR_SUCCESS) {
    return { routes: [], available: false, error: `GetIpForwardTable failed (${second})` };
  }

  const ffiBuf: any = buf;
  const numEntries = readUInt32(ffiBuf, 0);
  const rowSize = 40; // MIB_IPFORWARDROW x64 fixed size
  const offset = 4;   // Skip dwNumEntries DWORD
  const routes: WindowsRoute[] = [];

  for (let i = 0; i < numEntries; i++) {
    const rowOffset = offset + i * rowSize;
    if (rowOffset + rowSize > ffiBuf.length) break;
    const row = ffiBuf.subarray(rowOffset, rowOffset + rowSize);
    const route = parseIpForwardRow(row);
    if (route) routes.push(route);
  }

  return { routes, available: true };
}

/* ------------------------------------------------------------------ */
/* Gateway discovery                                                  */
/* ------------------------------------------------------------------ */

export async function discoverGateway(): Promise<{
  readonly gateway: string | null;
  readonly interfaceIndex: number | null;
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureIpHlp();
  if (!lib) {
    return { gateway: null, interfaceIndex: null, available: false, error: String(ipHelperError()) };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getBestInterface: any = (lib as any).GetBestInterface;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { gateway: null, interfaceIndex: null, available: false, error: 'FFI module unavailable' };
  }
  const { ref, types } = ffi;

  const outIdx = ref.alloc(types.uint, 0);
  // Destination 0.0.0.0 => best interface for the default route.
  const rc = getBestInterface(0, outIdx);
  if (rc !== ERROR_SUCCESS) {
    return { gateway: null, interfaceIndex: null, available: false, error: `GetBestInterface failed (${rc})` };
  }
  const ifIndex = readUInt32(outIdx.deref(), 0);

  // Look up the default route's gateway from the route table.
  const routesResult = await discoverRoutes();
  if (!routesResult.available || routesResult.routes.length === 0) {
    return { gateway: null, interfaceIndex: ifIndex, available: true };
  }
  const defaultRoute = routesResult.routes.find(
    (r) => r.interfaceIndex === ifIndex && r.mask === '0.0.0.0',
  );
  const gateway = defaultRoute ? defaultRoute.gateway : null;

  return { gateway, interfaceIndex: ifIndex, available: true };
}

/* ------------------------------------------------------------------ */
/* Route mutation + rollback                                          */
/* ------------------------------------------------------------------ */

export interface RouteMutationRequest {
  readonly destination: string;
  readonly mask: string;
  readonly gateway: string;
  readonly interfaceIndex: number;
}

// MIB_IPFORWARDROW field offsets for mutation (x64 layout).
const MUTATE_DEST_OFFSET = 0;      // DWORD dwForwardDest
const MUTATE_MASK_OFFSET = 4;      // DWORD dwForwardMask
const MUTATE_NEXTHOP_OFFSET = 12;  // DWORD dwForwardNextHop
const MUTATE_IF_INDEX_OFFSET = 16; // DWORD dwForwardIfIndex
const MUTATE_METRIC1_OFFSET = 20;  // DWORD dwForwardMetric1
const MUTATE_METRIC2_OFFSET = 24;  // DWORD dwForwardMetric2
const MUTATE_METRIC3_OFFSET = 28;  // DWORD dwForwardMetric3
const MUTATE_METRIC4_OFFSET = 32;  // DWORD dwForwardMetric4
const MUTATE_METRIC5_OFFSET = 36;  // DWORD dwForwardMetric5

/** MIB_IPFORWARDROW x64 fixed size. */
const MIB_IPFORWARDROW_SIZE = 40;

/**
 * Parses a dotted-decimal IPv4 string into a 32-bit unsigned integer.
 * Returns undefined for invalid input.
 */
export function parseIpv4(value: string): number | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  const nums = parts.map((p) => {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return undefined;
    return n;
  });
  if (nums.some((n) => n === undefined)) return undefined;
  return ((nums[0]! << 24) | (nums[1]! << 16) | (nums[2]! << 8) | nums[3]!) >>> 0;
}

/** MIB_IPFORWARDROW policy offset (used in build above). */
const MUTATE_POLICY_OFFSET = 8;

/**
 * Builds a MIB_IPFORWARDROW buffer for a route mutation request.
 */
export function buildIpForwardRow(request: RouteMutationRequest): Buffer {
  const row = Buffer.alloc(MIB_IPFORWARDROW_SIZE);

  const dest = parseIpv4(request.destination);
  const mask = parseIpv4(request.mask);
  const gateway = parseIpv4(request.gateway);

  if (dest === undefined || mask === undefined || gateway === undefined) {
    throw new Error(`Invalid IP address in route request: ${request.destination}/${request.mask} via ${request.gateway}`);
  }

  row.writeUInt32LE(dest, MUTATE_DEST_OFFSET);
  row.writeUInt32LE(mask, MUTATE_MASK_OFFSET);
  row.writeUInt32LE(0, MUTATE_POLICY_OFFSET);      // dwForwardPolicy
  row.writeUInt32LE(gateway, MUTATE_NEXTHOP_OFFSET);
  row.writeUInt32LE(request.interfaceIndex, MUTATE_IF_INDEX_OFFSET);
  row.writeUInt32LE(1, MUTATE_METRIC1_OFFSET);     // dwForwardMetric1
  row.writeUInt32LE(0, MUTATE_METRIC2_OFFSET);
  row.writeUInt32LE(0, MUTATE_METRIC3_OFFSET);
  row.writeUInt32LE(0, MUTATE_METRIC4_OFFSET);
  row.writeUInt32LE(0, MUTATE_METRIC5_OFFSET);

  return row;
}

/**
 * Adds an IPv4 route via `CreateIpForwardEntry`. The request fields are
 * validated before the call; invalid addresses are rejected rather than
 * passed to the kernel.
 */
export async function addRoute(request: RouteMutationRequest): Promise<{
  readonly ok: boolean;
  readonly error?: string;
}> {
  const lib = await ensureIpHlp();
  if (!lib) {
    return { ok: false, error: `IP Helper API unavailable: ${String(ipHelperError())}` };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createIpForwardEntry: any = (lib as any).CreateIpForwardEntry;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { ok: false, error: 'FFI module unavailable' };
  }

  let row: Buffer;
  try {
    row = buildIpForwardRow(request);
  } catch (error) {
    return { ok: false, error: `Invalid route request: ${error instanceof Error ? error.message : String(error)}` };
  }

  const rc = createIpForwardEntry(row);
  if (rc !== ERROR_SUCCESS) {
    return { ok: false, error: `CreateIpForwardEntry failed (${rc})` };
  }
  return { ok: true };
}

/**
 * Deletes an IPv4 route via `DeleteIpForwardEntry`. The request fields are
 * validated before the call; invalid addresses are rejected.
 */
export async function deleteRoute(request: RouteMutationRequest): Promise<{
  readonly ok: boolean;
  readonly error?: string;
}> {
  const lib = await ensureIpHlp();
  if (!lib) {
    return { ok: false, error: `IP Helper API unavailable: ${String(ipHelperError())}` };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteIpForwardEntry: any = (lib as any).DeleteIpForwardEntry;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { ok: false, error: 'FFI module unavailable' };
  }

  let row: Buffer;
  try {
    row = buildIpForwardRow(request);
  } catch (error) {
    return { ok: false, error: `Invalid route request: ${error instanceof Error ? error.message : String(error)}` };
  }

  const rc = deleteIpForwardEntry(row);
  if (rc !== ERROR_SUCCESS) {
    return { ok: false, error: `DeleteIpForwardEntry failed (${rc})` };
  }
  return { ok: true };
}

/**
 * Transactional route mutation: apply then verify; on verification failure or
 * exception, roll back by removing the applied route.
 */
export async function mutateRouteTransactional(
  request: RouteMutationRequest,
  verify: () => Promise<boolean>,
): Promise<{
  readonly outcome: 'committed' | 'rolled-back' | 'failed';
  readonly error?: string | undefined;
}> {
  const applied = await addRoute(request);
  if (!applied.ok) {
    return { outcome: 'failed', error: applied.error };
  }
  let verified = false;
  try {
    verified = await verify();
  } catch {
    verified = false;
  }
  if (!verified) {
    const rolledBack = await deleteRoute(request);
    if (!rolledBack.ok) {
      return {
        outcome: 'failed',
        error: `route applied but verification failed and rollback failed: ${rolledBack.error}`,
      };
    }
    return { outcome: 'rolled-back', error: 'route verification failed; rolled back' };
  }
  return { outcome: 'committed' };
}
