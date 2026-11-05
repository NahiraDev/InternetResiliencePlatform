/**
 * @fileoverview Dynamic loader for the `node-ffi-napi` native bindings module.
 *
 * IRP's macOS client calls real operating-system networking APIs
 * (SystemConfiguration, Network.framework) through foreign-function interfaces.
 * `node-ffi-napi` is an *optional* native dependency: required for production
 * privileged mutation, but the client must never crash or fake success when it
 * is unavailable.
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

export async function loadFfiNapi(): Promise<FfiNapiModule | undefined> {
  if (loaded !== undefined) return loaded;
  try {
    loaded = (await import('node-ffi-napi')) as FfiNapiModule;
  } catch (error) {
    loadError = error;
    loaded = undefined;
  }
  return loaded;
}

export function ffiLoadError(): unknown {
  return loadError;
}

export function ffiAvailable(module: FfiNapiModule | undefined): module is FfiNapiModule {
  return module !== undefined;
}
