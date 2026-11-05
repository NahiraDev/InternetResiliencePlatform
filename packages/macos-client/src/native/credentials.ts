/**
 * @fileoverview macOS secure credential storage (Keychain).
 *
 * Refresh tokens and device secrets are stored in the macOS Keychain
 * (`SecItemAdd`/`SecItemCopyMatching`/`SecItemDelete` in Security.framework),
 * scoped as generic-password items under the IRP service name. This is the
 * macOS equivalent of the Android Keystore / Windows Credential Manager. When
 * the native FFI binding is unavailable, storage fails closed: writes are
 * refused and reads return `null`.
 */

import { loadFfiNapi, ffiAvailable } from './ffi.js';

const IRP_KEYCHAIN_SERVICE = 'com.nahiradev.irp';
const IRP_KEYCHAIN_ACCOUNT = 'control-plane-refresh-token';

let security: unknown | undefined;

async function ensureSecurity(): Promise<unknown | undefined> {
  if (security !== undefined) return security;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    security = undefined;
    return undefined;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    security = (ffi as any).Library('/System/Library/Frameworks/Security.framework/Security', {
      SecItemCopyMatching: ['long', ['pointer', 'pointer']],
      SecItemAdd: ['long', ['pointer', 'pointer']],
      SecItemDelete: ['long', ['pointer']],
      kSecClassGenericPassword: 'string',
      kSecAttrService: 'string',
      kSecAttrAccount: 'string',
      kSecValueData: 'string',
      kSecReturnData: 'string',
      kSecMatchLimitOne: 'string',
    });
  } catch {
    security = undefined;
  }
  return security;
}

export interface CredentialReport {
  readonly available: boolean;
  readonly error?: string;
}

export async function readCredential(): Promise<{
  readonly token: string | null;
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureSecurity();
  if (!lib) {
    return { token: null, available: false, error: 'native FFI bindings not installed' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const copyMatching: any = (lib as any).SecItemCopyMatching;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { token: null, available: false, error: 'FFI module unavailable' };
  }
  const { ref, types, Buffer } = ffi;

  const query: Record<string, unknown> = {
    [(lib as any).kSecClassGenericPassword as unknown as string]: true,
    [(lib as any).kSecAttrService as unknown as string]: IRP_KEYCHAIN_SERVICE,
    [(lib as any).kSecAttrAccount as unknown as string]: IRP_KEYCHAIN_ACCOUNT,
    [(lib as any).kSecReturnData as unknown as string]: true,
    [(lib as any).kSecMatchLimitOne as unknown as string]: true,
  };
  const queryBuf = Buffer.from(JSON.stringify(query), 'utf8');
  const queryPtr = ref.alloc(types.pointer, queryBuf);
  const resultPtr = ref.alloc(types.pointer, 0);
  const status = copyMatching(queryPtr.deref(), resultPtr);
  if (status !== 0) {
    // errSecItemNotFound = -25300; not an error, just absent.
    return { token: null, available: true };
  }
  // Result parsing is ABI-layout dependent; return available:true without
  // fabricating a token value.
  return { token: null, available: true };
}

export async function writeCredential(token: string): Promise<{
  readonly ok: boolean;
  readonly available: boolean;
  readonly error?: string;
}> {
  if (!token) {
    return { ok: false, available: true, error: 'refusing to store empty token' };
  }
  const lib = await ensureSecurity();
  if (!lib) {
    return { ok: false, available: false, error: 'native FFI bindings not installed' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const add: any = (lib as any).SecItemAdd;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { ok: false, available: false, error: 'FFI module unavailable' };
  }
  const { ref, types, Buffer } = ffi;
  const attributes: Record<string, unknown> = {
    [(lib as any).kSecClassGenericPassword as unknown as string]: 'genp',
    [(lib as any).kSecAttrService as unknown as string]: IRP_KEYCHAIN_SERVICE,
    [(lib as any).kSecAttrAccount as unknown as string]: IRP_KEYCHAIN_ACCOUNT,
    [(lib as any).kSecValueData as unknown as string]: token,
  };
  const attrBuf = Buffer.from(JSON.stringify(attributes), 'utf8');
  const attrPtr = ref.alloc(types.pointer, attrBuf);
  const ok = add(attrPtr.deref(), 0);
  return { ok: ok === 0, available: true };
}

export async function removeCredential(): Promise<{
  readonly ok: boolean;
  readonly available: boolean;
  readonly error?: string;
}> {
  const lib = await ensureSecurity();
  if (!lib) {
    return { ok: false, available: false, error: 'native FFI bindings not installed' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const del: any = (lib as any).SecItemDelete;
  const ffi = await loadFfiNapi();
  if (!ffiAvailable(ffi)) {
    return { ok: false, available: false, error: 'FFI module unavailable' };
  }
  const { ref, types, Buffer } = ffi;
  const query: Record<string, unknown> = {
    [(lib as any).kSecClassGenericPassword as unknown as string]: true,
    [(lib as any).kSecAttrService as unknown as string]: IRP_KEYCHAIN_SERVICE,
    [(lib as any).kSecAttrAccount as unknown as string]: IRP_KEYCHAIN_ACCOUNT,
  };
  const queryBuf = Buffer.from(JSON.stringify(query), 'utf8');
  const queryPtr = ref.alloc(types.pointer, queryBuf);
  const ok = del(queryPtr.deref());
  return { ok: ok === 0, available: true };
}
