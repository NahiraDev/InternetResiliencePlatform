/**
 * Phase 149 — Backup, Disaster Recovery & Regional Recovery.
 *
 * Authenticated encrypted snapshots (AES-256-GCM with HKDF-derived per-backup
 * keys and bound metadata), chunked manifests with per-chunk digests,
 * restore verification, RPO/RTO evaluation, and a deterministic regional
 * failover plan that refuses to promote a region whose replica is too stale.
 */

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

export interface BackupManifest {
  readonly backupId: string;
  readonly createdAtMs: number;
  readonly region: string;
  readonly plaintextDigest: string;
  readonly chunkDigests: readonly string[];
  readonly chunkSize: number;
  readonly byteLength: number;
  readonly salt: string;
  readonly iv: string;
  readonly tag: string;
}
export interface EncryptedBackup { readonly manifest: BackupManifest; readonly ciphertext: Buffer }

const deriveKey = (master: Buffer | string, salt: Buffer, backupId: string): Buffer => Buffer.from(hkdfSync('sha256', typeof master === 'string' ? Buffer.from(master) : master, salt, `irp-backup:${backupId}`, 32));
const aad = (m: Pick<BackupManifest, 'backupId' | 'createdAtMs' | 'region' | 'plaintextDigest'>): Buffer => Buffer.from(JSON.stringify([m.backupId, m.createdAtMs, m.region, m.plaintextDigest]));

export const createBackup = (plaintext: Buffer, master: Buffer | string, meta: { readonly backupId: string; readonly createdAtMs: number; readonly region: string }, chunkSize = 1 << 20): EncryptedBackup => {
  if (chunkSize < 1) throw new Error('chunkSize must be positive');
  const salt = randomBytes(16); const iv = randomBytes(12);
  const plaintextDigest = createHash('sha256').update(plaintext).digest('hex');
  const cipher = createCipheriv('aes-256-gcm', deriveKey(master, salt, meta.backupId), iv);
  cipher.setAAD(aad({ ...meta, plaintextDigest }));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const chunkDigests: string[] = [];
  for (let o = 0; o < ciphertext.length; o += chunkSize) chunkDigests.push(createHash('sha256').update(ciphertext.subarray(o, o + chunkSize)).digest('hex'));
  return { ciphertext, manifest: Object.freeze({ ...meta, plaintextDigest, chunkDigests: Object.freeze(chunkDigests), chunkSize, byteLength: ciphertext.length, salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') }) };
};

/** Checks stored bytes against the manifest without needing the key: finds corrupted chunks. */
export const verifyChunks = (b: EncryptedBackup): { readonly ok: boolean; readonly corruptChunks: readonly number[] } => {
  const bad: number[] = [];
  if (b.ciphertext.length !== b.manifest.byteLength) return { ok: false, corruptChunks: Object.freeze([-1]) };
  b.manifest.chunkDigests.forEach((d, i) => { if (createHash('sha256').update(b.ciphertext.subarray(i * b.manifest.chunkSize, (i + 1) * b.manifest.chunkSize)).digest('hex') !== d) bad.push(i); });
  return { ok: bad.length === 0, corruptChunks: Object.freeze(bad) };
};

export class RestoreError extends Error {
  constructor(readonly code: 'corrupt-chunks' | 'authentication-failed' | 'digest-mismatch', message?: string) { super(message ?? code); this.name = 'RestoreError'; }
}

export const restoreBackup = (b: EncryptedBackup, master: Buffer | string): Buffer => {
  const chunks = verifyChunks(b);
  if (!chunks.ok) throw new RestoreError('corrupt-chunks', `corrupt chunks: ${chunks.corruptChunks.join(',')}`);
  const m = b.manifest;
  let plain: Buffer;
  try {
    const d = createDecipheriv('aes-256-gcm', deriveKey(master, Buffer.from(m.salt, 'hex'), m.backupId), Buffer.from(m.iv, 'hex'));
    d.setAAD(aad(m)); d.setAuthTag(Buffer.from(m.tag, 'hex'));
    plain = Buffer.concat([d.update(b.ciphertext), d.final()]);
  } catch { throw new RestoreError('authentication-failed'); }
  if (createHash('sha256').update(plain).digest('hex') !== m.plaintextDigest) throw new RestoreError('digest-mismatch');
  return plain;
};

export interface RecoveryObjectives { readonly rpoMs: number; readonly rtoMs: number }
export interface RecoveryEvaluation { readonly rpoMet: boolean; readonly rtoMet: boolean; readonly dataLossMs: number; readonly recoveryMs: number }

export const evaluateRecovery = (obj: RecoveryObjectives, lastBackupAtMs: number, incidentAtMs: number, restoredAtMs: number): RecoveryEvaluation => {
  const dataLossMs = Math.max(0, incidentAtMs - lastBackupAtMs); const recoveryMs = Math.max(0, restoredAtMs - incidentAtMs);
  return Object.freeze({ rpoMet: dataLossMs <= obj.rpoMs, rtoMet: recoveryMs <= obj.rtoMs, dataLossMs, recoveryMs });
};

export interface RegionState { readonly region: string; readonly healthy: boolean; readonly replicaLagMs: number; readonly capacityHeadroom: number; readonly priority: number }
export interface FailoverPlan { readonly action: 'stay' | 'failover' | 'blocked'; readonly target?: string; readonly reasons: readonly string[] }

/** Chooses a failover target without ever promoting a replica beyond the RPO or lacking headroom for the load. */
export const planRegionalFailover = (primary: string, regions: readonly RegionState[], objectives: RecoveryObjectives, requiredHeadroom: number): FailoverPlan => {
  const cur = regions.find((r) => r.region === primary);
  if (cur?.healthy) return Object.freeze({ action: 'stay', reasons: Object.freeze(['primary-healthy']) });
  const reasons: string[] = [];
  const eligible = regions.filter((r) => r.region !== primary).filter((r) => {
    if (!r.healthy) { reasons.push(`${r.region}:unhealthy`); return false; }
    if (r.replicaLagMs > objectives.rpoMs) { reasons.push(`${r.region}:replica-lag-exceeds-rpo`); return false; }
    if (r.capacityHeadroom < requiredHeadroom) { reasons.push(`${r.region}:insufficient-headroom`); return false; }
    return true;
  }).sort((a, b) => a.replicaLagMs - b.replicaLagMs || a.priority - b.priority || a.region.localeCompare(b.region));
  const best = eligible[0];
  return best ? Object.freeze({ action: 'failover', target: best.region, reasons: Object.freeze(['primary-unhealthy', ...reasons]) }) : Object.freeze({ action: 'blocked', reasons: Object.freeze(['no-eligible-region', ...reasons]) });
};
