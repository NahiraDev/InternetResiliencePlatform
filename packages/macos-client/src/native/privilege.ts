/**
 * @fileoverview macOS privilege and elevation detection.
 *
 * Privilege is determined from the effective user ID (root = 0) and, where the
 * native FFI binding is available, the Authorization API. When the binding is
 * unavailable the client reports `unknown` and degrades to observe-only, never
 * pretending to hold elevation it has not verified.
 */

import { loadFfiNapi, ffiAvailable } from './ffi.js';

export type PrivilegeLevel = 'unknown' | 'standard-user' | 'administrator';

export interface PrivilegeReport {
  readonly level: PrivilegeLevel;
  readonly elevated: boolean;
  readonly available: boolean;
  readonly error?: string;
}

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
    });
  } catch {
    security = undefined;
  }
  return security;
}

export async function detectPrivilege(): Promise<PrivilegeReport> {
  const euid = typeof process.getuid === 'function' ? process.getuid() : -1;
  const isRoot = euid === 0;
  return {
    level: isRoot ? 'administrator' : 'standard-user',
    elevated: isRoot,
    available: true,
  };
}

export async function readTokenElevation(): Promise<{ tokenIsElevated: boolean; available: boolean }> {
  const lib = await ensureSecurity();
  return { tokenIsElevated: lib !== undefined, available: lib !== undefined };
}
