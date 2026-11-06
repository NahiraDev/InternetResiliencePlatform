declare module 'ref-napi' {
  export interface RefType {
    size: number;
    indirection: number;
    name: string;
    alignment: number;
  }

  export type Type = string | RefType;

  export interface AllocResult {
    deref(): any;
  }

  export interface Ref {
    alloc: (type: Type, value?: any) => AllocResult;
    allocCString: (str: string, encoding?: string) => AllocResult;
    readPointer: (buf: Buffer, offset?: number) => AllocResult;
    writePointer: (buf: Buffer, offset: number, ptr: AllocResult) => void;
    readInt8: (buf: Buffer, offset?: number) => number;
    writeInt8: (buf: Buffer, val: number, offset?: number) => void;
    readUInt8: (buf: Buffer, offset?: number) => number;
    writeUInt8: (buf: Buffer, val: number, offset?: number) => void;
    readInt16LE: (buf: Buffer, offset?: number) => number;
    writeInt16LE: (buf: Buffer, val: number, offset?: number) => void;
    readUInt16LE: (buf: Buffer, offset?: number) => number;
    writeUInt16LE: (buf: Buffer, val: number, offset?: number) => void;
    readInt32LE: (buf: Buffer, offset?: number) => number;
    writeInt32LE: (buf: Buffer, val: number, offset?: number) => void;
    readUInt32LE: (buf: Buffer, offset?: number) => number;
    writeUInt32LE: (buf: Buffer, val: number, offset?: number) => void;
    readFloatLE: (buf: Buffer, offset?: number) => number;
    writeFloatLE: (buf: Buffer, val: number, offset?: number) => void;
    readDoubleLE: (buf: Buffer, offset?: number) => number;
    writeDoubleLE: (buf: Buffer, val: number, offset?: number) => void;
    readInt64LE: (buf: Buffer, offset?: number) => bigint;
    writeInt64LE: (buf: Buffer, val: bigint | number, offset?: number) => void;
    readUInt64LE: (buf: Buffer, offset?: number) => bigint;
    writeUInt64LE: (buf: Buffer, val: bigint | number, offset?: number) => void;
    readPointer: (buf: Buffer, offset?: number) => AllocResult;
    writePointer: (buf: Buffer, offset: number, ptr: AllocResult) => void;
    readInt8: (buf: Buffer, offset?: number) => number;
    writeInt8: (buf: Buffer, val: number, offset?: number) => void;
    readUInt8: (buf: Buffer, offset?: number) => number;
    writeUInt8: (buf: Buffer, val: number, offset?: number) => void;
    readInt16LE: (buf: Buffer, offset?: number) => number;
    writeInt16LE: (buf: Buffer, val: number, offset?: number) => void;
    readUInt16LE: (buf: Buffer, offset?: number) => number;
    writeUInt16LE: (buf: Buffer, val: number, offset?: number) => void;
    readInt32LE: (buf: Buffer, offset?: number) => number;
    writeInt32LE: (buf: Buffer, val: number, offset?: number) => void;
    readUInt32LE: (buf: Buffer, offset?: number) => number;
    writeUInt32LE: (buf: Buffer, val: number, offset?: number) => void;
    readFloatLE: (buf: Buffer, offset?: number) => number;
    writeFloatLE: (buf: Buffer, val: number, offset?: number) => void;
    readDoubleLE: (buf: Buffer, offset?: number) => number;
    writeDoubleLE: (buf: Buffer, val: number, offset?: number) => void;
    readInt64LE: (buf: Buffer, offset?: number) => bigint;
    writeInt64LE: (buf: Buffer, val: bigint | number, offset?: number) => void;
    readUInt64LE: (buf: Buffer, offset?: number) => bigint;
    writeUInt64LE: (buf: Buffer, val: bigint | number, offset?: number) => void;
    ref: (buf: Buffer) => AllocResult;
    deref: (buf: Buffer) => any;
    refType: (type: Type, size?: number) => RefType;
    coerceType: (type: Type) => RefType;
    isNull: (ptr: AllocResult) => boolean;
    isNullPtr: (ptr: AllocResult) => boolean;
    NULL: AllocResult;
    types: {
      void: RefType;
      int8: RefType;
      uint8: RefType;
      int16: RefType;
      uint16: RefType;
      int32: RefType;
      uint32: RefType;
      int64: RefType;
      uint64: RefType;
      float: RefType;
      double: RefType;
      cstring: RefType;
    };
  }

  const ref: Ref;
  export = ref;
  export default ref;
}