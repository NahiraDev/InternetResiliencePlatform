/**
 * @fileoverview Windows privilege and elevation detection.
 *
 * Privilege is determined from the process access token (advapi32.dll +
 * shell32.dll), not assumed. When the native FFI binding is unavailable the
 * client reports `unknown` and degrades to observe-only, never pretending to
 * hold elevation it has not verified.
 */

import { loadFfiNapi, ffiAvailable } from './ffi.js';

export type PrivilegeLevel = 'unknown' | 'standard-user' | 'administrator';

export interface PrivilegeReport {
  readonly level: PrivilegeLevel;
  readonly elevated: boolean;
 readonly available: boolean;
  readonly error?: string;
}

let advapi: unknown | undefined;
let shell32: unknown | undefined;

async function ensureLibs(): Promise<{ advapi: unknown | undefined; shell32: unknown | undefined }> {
  const ffi = await loadFfiNapi();
  if (!ffi) {
    return { advapi: undefined, shell32: undefined };
  }
  if (advapi === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      advapi = (ffi as any).Library('advapi32.dll', {
        OpenProcessToken: ['bool', ['pointer', 'uint', 'pointer']],
        GetTokenInformation: ['bool', ['pointer', 'uint', 'pointer', 'uint', 'pointer']],
        CloseHandle: ['bool', ['pointer']],
      });
    } catch {
      advapi = undefined;
    }
  }
  if (shell32 === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shell32 = (ffi as any).Library('shell32.dll', {
        IsUserAnAdmin: ['bool', []],
      });
    } catch {
      shell32 = undefined;
    }
  }
  return { advapi, shell32 };
}

export async function detectPrivilege(): Promise<PrivilegeReport> {
  const { advapi, shell32 } = await ensureLibs();
  if (!shell32) {
    return {
      level: 'unknown',
      elevated: false,
      available: false,
      error: 'native FFI bindings not installed; privilege cannot be verified',
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isUserAnAdmin: any = (shell32 as any).IsUserAnAdmin;
  try {
    const admin = isUserAnAdmin();
    return {
      level: admin ? 'administrator' : 'standard-user',
      elevated: !!admin,
      available: true,
    };
  } catch (error) {
    return {
      level: 'unknown',
      elevated: false,
      available: false,
      error: String(error ?? 'IsUserAnAdmin failed'),
    };
  }
}

export type TokenElevation = { tokenIsElevated: boolean; available: boolean };

export async function readTokenElevation(): Promise<TokenElevation> {
  const { advapi } = await ensureLibs();
  if (!advapi) {
    return { tokenIsElevated: false, available: false };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openProcessToken: any = (advapi as any).OpenProcessToken;
  const getTokenInformation: any = (advapi as any).GetTokenInformation;
  const closeHandle: any = (advapi as any).CloseHandle;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { tokenIsElevated: false, available: false };
  }
  const { ref, types, Buffer } = ffi;
  if (!ref || !types || !Buffer) {
    return { tokenIsElevated: false, available: false };
  }
  // TOKEN_QUERY = 0x0008; TokenElevation = 20
  const currentProcess = 0xffffffff; // pseudo-handle
  const tokenHandle = ref.alloc(types.pointer, 0);
  const opened = openProcessToken(currentProcess, 0x0008, tokenHandle);
  if (!opened) {
    return { tokenIsElevated: false, available: true };
  }
  try {
    const size = ref.alloc(types.uint, 0);
    // First call to get required size.
    getTokenInformation(tokenHandle.deref(), 20, 0, 0, size);
    const bufSize = readUInt32Ptr(size.deref());
    const buf = Buffer.alloc(bufSize);
    const ok = getTokenInformation(tokenHandle.deref(), 20, buf, bufSize, size);
    if (!ok) {
      return { tokenIsElevated: false, available: true };
    }
    const elevated = readUInt32Ptr(buf) !== 0;
    return { tokenIsElevated: elevated, available: true };
  } catch {
    return { tokenIsElevated: false, available: true };
  } finally {
    try {
      closeHandle(tokenHandle.deref());
    } catch {
      // best-effort
    }
  }
}

function readUInt32Ptr(ptr: unknown): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf: any = ptr;
  if (typeof buf.readUInt32LE === 'function') return buf.readUInt32LE(0);
  return 0;
}
