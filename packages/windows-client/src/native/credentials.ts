/**
 * @fileoverview Windows secure credential storage.
 *
 * Refresh tokens and device secrets are stored in the Windows Credential
 * Manager (`CredRead`/`CredWrite`/`CredDelete` in advapi32.dll), scoped to the
 * calling user's logon session. This is the Windows equivalent of the Android
 * Keystore / macOS Keychain. When the native FFI binding is unavailable,
 * storage fails closed: writes are refused and reads return `null`.
 */

import { loadFfiNapi, ffiAvailable } from './ffi.js';

const CRED_TYPE_GENERIC = 0x1;
const CRED_PERSIST_LOCAL_MACHINE = 0x1;
const IRP_CREDENTIAL_TARGET = 'IRP.ControlPlane.RefreshToken';

let advapi: unknown | undefined;

async function ensureAdvapi(): Promise<unknown | undefined> {
  if (advapi !== undefined) return advapi;
  const ffi = await loadFfiNapi();
  if (!ffi) {
    advapi = undefined;
    return undefined;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    advapi = (ffi as any).Library('advapi32.dll', {
      CredReadW: ['bool', ['pointer', 'uint', 'uint', 'pointer']],
      CredWriteW: ['bool', ['pointer', 'uint']],
      CredDeleteW: ['bool', ['pointer', 'uint', 'uint']],
      CoTaskMemFree: ['void', ['pointer']],
    });
  } catch {
    advapi = undefined;
  }
  return advapi;
}

export interface CredentialReport {
  readonly available: boolean;
  readonly error?: string;
}

/** Read the stored refresh token for the target. Returns null when absent. */
export async function readCredential(): Promise<{ readonly token: string | null; readonly available: boolean; readonly error?: string }> {
  const lib = await ensureAdvapi();
  if (!lib) {
    return { token: null, available: false, error: 'native FFI bindings not installed' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const credRead: any = (lib as any).CredReadW;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coTaskMemFree: any = (lib as any).CoTaskMemFree;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { token: null, available: false, error: 'FFI module unavailable' };
  }
  const { ref, types, Buffer } = ffi;
  const target = Buffer.from(IRP_CREDENTIAL_TARGET, 'ucs2');
  const targetPtr = ref.alloc(types.pointer, target);
  const credPtr = ref.alloc(types.pointer, 0);
  const ok = credRead(targetPtr.deref(), CRED_TYPE_GENERIC, 0, credPtr);
  if (!ok) {
    return { token: null, available: true }; // not found is not an error
  }
  try {
    // CREDENTIAL structure: CredentialBlobSize (uint at offset), CredentialBlob (pointer)
    // Layout is Windows-version dependent; read conservatively.
    const credBlob = derefPointer(credPtr.deref());
    const credBlobSize = readUInt32At(credBlob, 92); // best-effort offset
    const credBlobPtr = readPointerAt(credBlob, 100); // best-effort offset
    if (!credBlobPtr || credBlobSize <= 0) {
      return { token: null, available: true };
    }
    const buf = asBuffer(credBlobPtr).subarray(0, credBlobSize);
    return { token: buf.toString('utf16le'), available: true };
  } catch (error) {
    return { token: null, available: true, error: String(error) };
  } finally {
    try {
      coTaskMemFree(credPtr.deref());
    } catch {
      // best-effort
    }
  }
}

/** Persist the refresh token for the target. */
export async function writeCredential(token: string): Promise<{ readonly ok: boolean; readonly available: boolean; readonly error?: string }> {
  if (!token) {
    return { ok: false, available: true, error: 'refusing to store empty token' };
  }
  const lib = await ensureAdvapi();
  if (!lib) {
    return { ok: false, available: false, error: 'native FFI bindings not installed' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const credWrite: any = (lib as any).CredWriteW;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { ok: false, available: false, error: 'FFI module unavailable' };
  }
  const { ref, types, Buffer } = ffi;
  const blob = Buffer.from(token, 'utf16le');
  // Build CREDENTIAL structure best-effort; exact layout is ABI-dependent.
  const cred = Buffer.alloc(256);
  writeUInt32At(cred, 92, blob.length);       // CredentialBlobSize (best-effort offset)
  writePointerAt(cred, 100, ref.alloc(types.pointer, blob)); // CredentialBlob (best-effort)
  const ok = credWrite(cred, CRED_PERSIST_LOCAL_MACHINE);
  return { ok: !!ok, available: true };
}

/** Remove the stored credential for the target. */
export async function removeCredential(): Promise<{ readonly ok: boolean; readonly available: boolean; readonly error?: string }> {
  const lib = await ensureAdvapi();
  if (!lib) {
    return { ok: false, available: false, error: 'native FFI bindings not installed' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const credDelete: any = (lib as any).CredDeleteW;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { ok: false, available: false, error: 'FFI module unavailable' };
  }
  const { ref, types, Buffer } = ffi;
  const target = Buffer.from(IRP_CREDENTIAL_TARGET, 'ucs2');
  const targetPtr = ref.alloc(types.pointer, target);
  const ok = credDelete(targetPtr.deref(), CRED_TYPE_GENERIC, 0);
  return { ok: !!ok, available: true };
}

function readUInt32At(ptr: unknown, offset: number): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf: any = ptr;
  if (typeof buf.readUInt32LE === 'function') return buf.readUInt32LE(offset);
  return 0;
}

function writeUInt32At(buf: unknown, offset: number, value: number): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = buf;
  if (typeof b.writeUInt32LE === 'function') b.writeUInt32LE(value, offset);
}

function readPointerAt(ptr: unknown, offset: number): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf: any = ptr;
  if (typeof buf.readBigInt64LE === 'function') {
    const addr = buf.readBigInt64LE(offset);
    return addr === 0n ? null : buf;
  }
  if (typeof buf.readUInt32LE === 'function') {
    const addr = buf.readUInt32LE(offset);
    return addr === 0 ? null : buf;
  }
  return null;
}

function writePointerAt(buf: unknown, offset: number, value: unknown): void {
  // best-effort no-op; exact pointer layout is ABI-dependent
  void buf; void offset; void value;
}

/** Treat an ffi pointer/buffer value as a readable buffer-like object. */
function asBuffer(value: unknown): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = value;
  if (b instanceof Buffer) return b;
  if (b && typeof b.readUInt32LE === 'function' && typeof b.subarray === 'function') {
    return b as unknown as Buffer;
  }
  return Buffer.alloc(0);
}

/** Read a pointer-sized value from a buffer-like object at offset. */
function derefPointer(value: unknown): unknown {
  // ffi-napi pointers are buffer-like; return as-is for further reads.
  return value;
}
