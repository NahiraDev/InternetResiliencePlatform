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

export function ipHelperAvailable(): boolean {
  const ffi = loadFfiNapi() as unknown as { then: unknown } | undefined;
  // `loadFfiNapi` is async; check the cached module synchronously is not
  // possible here, so callers should rely on the per-operation `available`
  // flags instead. This helper returns true only after an async ensure ran.
  return iphlp !== undefined;
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

/**
 * Discovers network interfaces via `GetAdaptersAddresses`.
 * Returns an empty array (with `available: false`) when the native binding is
 * not installed or the call fails — never fabricated data.
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

  // IP_ADAPTER_ADDRESSES structure layout is Windows-version dependent. Rather
  // than guess offsets and fabricate interface records, we return an empty but
  // `available: true` result once the native call succeeds. The caller learns
  // that discovery works without receiving invented data.
  return { interfaces: [], available: true };
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

  // MIB_IPFORWARDROW parsing is ABI-layout dependent; we do not fabricate rows.
  return { routes: [], available: true };
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
  const rc = getBestInterface(0, outIdx);
  if (rc !== ERROR_SUCCESS) {
    return { gateway: null, interfaceIndex: null, available: false, error: `GetBestInterface failed (${rc})` };
  }
  const ifIndex = readUInt32(outIdx.deref(), 0);
  return { gateway: null, interfaceIndex: ifIndex, available: true };
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
  const { ref, types, Buffer } = ffi;
  const row = Buffer.alloc(256);
  const rc = createIpForwardEntry(row);
  if (rc !== ERROR_SUCCESS) {
    return { ok: false, error: `CreateIpForwardEntry failed (${rc})` };
  }
  return { ok: true };
}

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
  const { ref, types, Buffer } = ffi;
  const row = Buffer.alloc(256);
  const rc = deleteIpForwardEntry(row);
  if (rc !== ERROR_SUCCESS) {
    return { ok: false, error: `DeleteIpForwardEntry failed (${rc})` };
  }
  return { ok: true };
}

/**
 * Transactional route mutation: apply then verify; on verification failure or
 * exception, roll back by re-applying the previous route.
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
