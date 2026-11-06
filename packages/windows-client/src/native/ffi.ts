/**
 * @fileoverview Dynamic loader for the `ffi-napi` native bindings module.
 *
 * IRP's Windows and macOS clients call real operating-system networking APIs
 * (IP Helper API on Windows, SystemConfiguration / Network.framework on macOS)
 * through foreign-function interfaces. `ffi-napi` is an *optional* native
 * dependency: it is required for production privileged mutation, but the
 * clients must never crash or fake success when it is unavailable.
 *
 * This module resolves the binding once and reports availability so callers can
 * degrade to observe-only mode and surface "permission required" / "unsupported"
 * to the operator instead of inventing results.
 */

export type FfiNapiModule = {
  Library: unknown;
  types: {
    readonly void: unknown;
    readonly int: unknown;
    readonly uint: unknown;
    readonly long: unknown;
    readonly ulong: unknown;
    readonly longlong: unknown;
    readonly ulonglong: unknown;
    readonly float: unknown;
    readonly double: unknown;
    readonly pointer: unknown;
    readonly string: unknown;
    readonly wstring: unknown;
    readonly buffer: unknown;
    readonly int8: unknown;
    readonly uint8: unknown;
    readonly int16: unknown;
    readonly uint16: unknown;
    readonly int32: unknown;
    readonly uint32: unknown;
    readonly int64: unknown;
    readonly uint64: unknown;
  };
  readonly ref: { alloc: (type: unknown, value: unknown) => { deref: () => unknown } };
  readonly Struct: unknown;
  readonly ArrayType: unknown;
  readonly Callback: unknown;
  readonly Buffer: {
    alloc: (size: number) => Buffer;
    from: (data: unknown, encoding?: string) => Buffer;
  };
};

let loaded: FfiNapiModule | undefined;
let loadError: unknown;

/**
 * Attempts to load `ffi-napi`. Safe to call repeatedly; the result is
 * cached. When the module is not installed (development/CI without the native
 * dependency), returns `undefined` and records the error for diagnostics.
 */
export async function loadFfiNapi(): Promise<FfiNapiModule | undefined> {
  if (loaded !== undefined) return loaded;
  try {
    // Dynamic import so the package does not hard-require a native build in
    // environments where it is not installed (e.g. this Linux build host).
    loaded = (await import('ffi-napi')) as FfiNapiModule;
  } catch (error) {
    loadError = error;
    loaded = undefined;
  }
  return loaded;
}

/**
 * The last error encountered while loading `ffi-napi`, if any.
 */
export function ffiLoadError(): unknown {
  return loadError;
}

/**
 * Type guard: true when the native FFI bindings are available and can be used
 * for privileged OS API calls.
 */
export function ffiAvailable(module: FfiNapiModule | undefined): module is FfiNapiModule {
  return module !== undefined;
}