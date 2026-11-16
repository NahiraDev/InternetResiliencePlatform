declare module 'node-ffi-napi' {
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
    readonly ref: {
      alloc: (type: unknown, value: unknown) => { deref: () => unknown };
    };
    readonly Struct: unknown;
    readonly ArrayType: unknown;
    readonly Callback: unknown;
    readonly Buffer: {
      alloc: (size: number) => Buffer;
      from: (data: unknown, encoding?: string) => Buffer;
    };
  }

  const ffi: FfiNapiModule;
  export = ffi;
  export default ffi;
}
