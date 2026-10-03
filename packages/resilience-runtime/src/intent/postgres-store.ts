/**
 * PostgreSQL-backed intent store for durable intent persistence (Phase 2).
 * Implements the IntentStore interface for production deployments.
 */

import type { CompiledIntent, IntentStore } from './index.js';

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number;
}

export interface IntentRow {
  intent_id: string;
  version: number;
  priority: string;
  desired_outcome: string;
  target: Record<string, unknown>;
  constraints: Record<string, unknown>;
  objectives: Record<string, unknown>;
  confidence: number;
  provenance: string;
  autonomy: string;
  scope: Record<string, unknown>;
  effective_from: string | null;
  expires_at: string | null;
  compiled_at: string;
}

import pg from 'pg';

const MIGRATION_SQL = `
-- Migration 001: Create intents table
CREATE TABLE IF NOT EXISTS intents (
  intent_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  priority TEXT NOT NULL,
  desired_outcome TEXT NOT NULL,
  target JSONB NOT NULL DEFAULT '{}',
  constraints JSONB NOT NULL DEFAULT '{}',
  objectives JSONB NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 1.0,
  provenance TEXT NOT NULL DEFAULT 'network-intent',
  autonomy TEXT NOT NULL DEFAULT 'ADVISORY',
  scope JSONB NOT NULL DEFAULT '{}',
  effective_from TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  compiled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intents_effective_from ON intents(effective_from);
CREATE INDEX IF NOT EXISTS idx_intents_expires_at ON intents(expires_at);
CREATE INDEX IF NOT EXISTS idx_intents_priority ON intents(priority);
`;

const UPSERT_SQL = `
INSERT INTO intents (
  intent_id, version, priority, desired_outcome, target, constraints, objectives,
  confidence, provenance, autonomy, scope, effective_from, expires_at, compiled_at,
  updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
ON CONFLICT (intent_id) DO UPDATE SET
  version = EXCLUDED.version + 1,
  priority = EXCLUDED.priority,
  desired_outcome = EXCLUDED.desired_outcome,
  target = EXCLUDED.target,
  constraints = EXCLUDED.constraints,
  objectives = EXCLUDED.objectives,
  confidence = EXCLUDED.confidence,
  provenance = EXCLUDED.provenance,
  autonomy = EXCLUDED.autonomy,
  scope = EXCLUDED.scope,
  effective_from = EXCLUDED.effective_from,
  expires_at = EXCLUDED.expires_at,
  compiled_at = EXCLUDED.compiled_at,
  updated_at = NOW()
`;

const GET_SQL = `
SELECT * FROM intents WHERE intent_id = $1
`;

const GET_ACTIVE_SQL = `
SELECT * FROM intents
WHERE (effective_from IS NULL OR effective_from <= $1)
  AND (expires_at IS NULL OR expires_at > $1)
ORDER BY compiled_at DESC
`;

const DELETE_SQL = `
DELETE FROM intents WHERE intent_id = $1
`;

export class PostgresIntentStore implements IntentStore {
  private pool: unknown;

  constructor(private readonly config: PostgresConfig) {}

  async initialize(): Promise<void> {
    // Dynamic import to avoid requiring pg as a hard dependency
    const pg = await import('pg');
    const { Pool } = pg;
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl,
      max: this.config.max ?? 10,
    });

    // Run migration
    await (this.pool as InstanceType<typeof Pool>).query(MIGRATION_SQL);
  }

  async get(id: string): Promise<CompiledIntent | undefined> {
    const pool = this.pool as pg.Pool;
    const result = await pool.query(GET_SQL, [id]);
    if (result.rows.length === 0) return undefined;
    return this.rowToIntent(result.rows[0]);
  }

  async getActive(at = new Date()): Promise<readonly CompiledIntent[]> {
    const pool = this.pool as pg.Pool;
    const result = await pool.query(GET_ACTIVE_SQL, [at.toISOString()]);
    return Object.freeze(result.rows.map((row) => this.rowToIntent(row)));
  }

  async put(intent: CompiledIntent): Promise<void> {
    const pool = this.pool as pg.Pool;
    await pool.query(UPSERT_SQL, [
      intent.intentId,
      intent.version,
      intent.priority,
      intent.desiredOutcome,
      JSON.stringify(intent.target),
      JSON.stringify(intent.constraints),
      JSON.stringify(intent.objectives),
      intent.confidence,
      intent.provenance,
      intent.autonomy,
      JSON.stringify(intent.scope),
      intent.effectiveFrom ?? null,
      intent.expiresAt ?? null,
      intent.compiledAt,
    ]);
  }

  async delete(id: string): Promise<void> {
    const pool = this.pool as pg.Pool;
    await pool.query(DELETE_SQL, [id]);
  }

  async close(): Promise<void> {
    const pool = this.pool as pg.Pool;
    await pool.end();
  }

  private rowToIntent(row: IntentRow): CompiledIntent {
    return Object.freeze({
      intentId: row.intent_id as string,
      version: row.version as number,
      priority: row.priority as CompiledIntent['priority'],
      desiredOutcome: row.desired_outcome as string,
      target: row.target as CompiledIntent['target'],
      constraints: row.constraints as CompiledIntent['constraints'],
      objectives: row.objectives as CompiledIntent['objectives'],
      confidence: row.confidence as number,
      provenance: row.provenance as string,
      autonomy: row.autonomy as CompiledIntent['autonomy'],
      scope: row.scope as CompiledIntent['scope'],
      effectiveFrom: row.effective_from ? new Date(row.effective_from as string).toISOString() : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at as string).toISOString() : undefined,
      compiledAt: row.compiled_at as string,
    });
  }
}