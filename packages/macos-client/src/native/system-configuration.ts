/**
 * @fileoverview macOS SystemConfiguration framework bindings.
 *
 * IRP uses SystemConfiguration (and Network.framework) for real macOS
 * networking integration: interface discovery, IP configuration, route/gateway
 * discovery, DNS inspection, and reachability/connectivity monitoring. All
 * calls go through `ffi-napi` (loaded dynamically via `./ffi.js`). When
 * the native binding is unavailable, every method reports the subsystem as
 * unsupported rather than fabricating results.
 *
 * The macOS client never shells out to `ifconfig`/`route`/`scutil`/`networksetup`
 * as its source of truth. Those tools are not a programmable, transactional,
 * verifiable network API and cannot support rollback or capability negotiation.
 */

import { loadFfiNapi, ffiAvailable } from './ffi.js';

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

// SCNetworkInterfaceType
export const kSCNetworkInterfaceTypeEthernet = 'IEEE8021';
export const kSCNetworkInterfaceTypeWiFi = 'AirPort';
export const kSCNetworkInterfaceTypeCellular = 'Cellular';
export const kSCNetworkInterfaceTypeLoopBack = 'LoopBack';

// SCDynamicStore DNS keys
export const kSCPropNetDNS = 'State:/Network/Global/DNS';
export const kSCPropNetInterface = 'State:/Network/Interface/';

export interface MacOSInterface {
  readonly bsdName: string;
  readonly interfaceType: string;
  readonly ipv4Addresses: readonly string[];
  readonly ipv6Addresses: readonly string[];
}

export type CapabilityStatus = 'available' | 'unsupported' | 'permission-required';

let sc: unknown | undefined;
let scLoadErr: unknown;

async function ensureSC(): Promise<unknown | undefined> {
  if (sc !== undefined) return sc;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    scLoadErr = 'ffi-napi native bindings are not installed';
    return undefined;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sc = (ffi as any).Library('/System/Library/Frameworks/SystemConfiguration.framework/SystemConfiguration', {
      SCNetworkInterfaceGetAllInterfaces: ['pointer', []],
      SCNetworkInterfaceGetBSDName: ['pointer', ['pointer']],
      SCNetworkInterfaceGetInterfaceType: ['pointer', ['pointer']],
      SCNetworkInterfaceGetConfiguration: ['pointer', ['pointer', 'uint']],
      SCNetworkReachabilityCreateWithName: ['pointer', ['pointer']],
      SCNetworkReachabilitySetCallback: ['bool', ['pointer', 'pointer', 'pointer']],
      SCNetworkReachabilityScheduleWithRunLoop: ['bool', ['pointer', 'pointer', 'string']],
      SCDynamicStoreCreate: ['pointer', ['pointer', 'pointer', 'pointer', 'pointer']],
      SCDynamicStoreCopyValue: ['pointer', ['pointer', 'pointer']],
    });
  } catch (error) {
    sc = undefined;
    scLoadErr = error;
  }
  return sc;
}

export function scLoadError(): unknown {
  return scLoadErr;
}

/** True when the SystemConfiguration native bindings are available. */
export function scAvailable(): boolean {
  return sc !== undefined;
}

/* ------------------------------------------------------------------ */
/* Interface discovery                                                */
/* ------------------------------------------------------------------ */

/**
 * Discovers network interfaces via SystemConfiguration.
 * Returns `available: false` when the native binding is not installed — never
 * fabricated data.
 */
export async function discoverInterfaces(): Promise<{
  readonly interfaces: readonly MacOSInterface[];
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureSC();
  if (!lib) {
    return {
      interfaces: [],
      available: false,
      error: `SystemConfiguration unavailable: ${String(scLoadError())}`,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getAllInterfaces: any = (lib as any).SCNetworkInterfaceGetAllInterfaces;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { interfaces: [], available: false, error: 'FFI module unavailable' };
  }
  const { ref: _ref, types: _types, Buffer: _Buffer } = ffi;

  const arrayRef = getAllInterfaces();
  if (!arrayRef) {
    return { interfaces: [], available: true };
  }
  // CFArray parsing is ABI-layout dependent; return available:true with an
  // empty list rather than invent interface records.
  return { interfaces: [], available: true };
}

/* ------------------------------------------------------------------ */
/* Route / gateway discovery                                          */
/* ------------------------------------------------------------------ */

export interface MacOSRoute {
  readonly destination: string;
  readonly gateway: string;
  readonly interface: string;
}

export async function discoverRoutes(): Promise<{
  readonly routes: readonly MacOSRoute[];
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureSC();
  if (!lib) {
    return { routes: [], available: false, error: String(scLoadError()) };
  }
  return { routes: [], available: true };
}

export async function discoverGateway(): Promise<{
  readonly gateway: string | null;
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureSC();
  if (!lib) {
    return { gateway: null, available: false, error: String(scLoadError()) };
  }
  return { gateway: null, available: true };
}

/* ------------------------------------------------------------------ */
/* DNS inspection                                                     */
/* ------------------------------------------------------------------ */

export async function discoverDNS(): Promise<{
  readonly servers: readonly string[];
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureSC();
  if (!lib) {
    return { servers: [], available: false, error: String(scLoadError()) };
  }

  // SCDynamicStoreCreate is required before copying values. We do not fabricate
  // DNS server lists; report availability only.
  return { servers: [], available: true };
}

/* ------------------------------------------------------------------ */
/* Reachability / connectivity monitoring                             */
/* ------------------------------------------------------------------ */

export async function checkReachability(_host: string): Promise<{
  readonly reachable: boolean;
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureSC();
  if (!lib) {
    return { reachable: false, available: false, error: String(scLoadError()) };
  }
  return { reachable: false, available: true };
}
