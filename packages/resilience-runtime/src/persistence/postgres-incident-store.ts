/**
 * PostgreSQL-backed IncidentStore for durable incident persistence.
 *
 * Production hosts pass this store to ResilienceRuntime so that incident
 * records survive process restarts. Implements the IncidentStore port with
 * full ACID guarantees through PostgreSQL.
 *
 * Schema migration runs on initialize(): creates the `incidents` table and
 * supporting indexes.
 */

import type { Incident } from '../domain/types.js';
import type { IncidentStore } from '../ports/ports.js';
import type pg from 'pg';

export interface PostgresIncidentStoreConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly ssl?: boolean;
  readonly max?: number;
}

const MIGRATION_SQL = `
-- Migration 001: durable incident records
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  correlation_id TEXT,
  source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  root_cause TEXT NOT NULL,
  affected_components JSONB NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]',
  correlation_reason TEXT NOT NULL,
  classification TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_correlation_id ON incidents(correlation_id);
CREATE INDEX IF NOT EXISTS idx_incidents_classification ON incidents(classification);
`;

const INSERT_SQL = `
INSERT INTO incidents (
  id, schema_version, created_at, correlation_id, source, metadata,
  root_cause, affected_components, confidence, evidence, correlation_reason,
  classification, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
)
ON CONFLICT (id) DO UPDATE SET
  schema_version = EXCLUDED.schema_version,
  created_at = EXCLUDED.created_at,
  correlation_id = EXCLUDED.correlation_id,
  source = EXCLUDED.source,
  metadata = EXCLUDED.metadata,
  root_cause = EXCLUDED.root_cause,
  affected_components = EXCLUDED.affected_components,
  confidence = EXCLUDED.confidence,
  evidence = EXCLUDED.evidence,
  correlation_reason = EXCLUDED.correlation_reason,
  classification = EXCLUDED.classification,
  updated_at = NOW()
`;

const GET_SQL = `
SELECT * FROM incidents WHERE id = $1
`;

const LIST_SQL = `
SELECT * FROM incidents ORDER BY created_at DESC
`;

export class PostgresIncidentStore implements IncidentStore {
  private pool: unknown;

  constructor(private readonly config: PostgresIncidentStoreConfig) {}

  /**
   * Validates the configuration without touching the network.
   * Exposed separately from `initialize` so a host can fail closed on
   * malformed persistence settings before it constructs a store or starts
   * a cycle.
   */
  assertValidConfig(): void {
    if (!this.config.host.trim() || !this.config.database.trim() || !this.config.user.trim()) {
      throw new Error('PostgresIncidentStore requires host, database, and user');
    }
    if (!Number.isInteger(this.config.port) || this.config.port < 1 || this.config.port > 65_535) {
      throw new Error(`PostgresIncidentStore requires a valid port, received ${this.config.port}`);
    }
    if (
      this.config.max !== undefined &&
      (!Number.isInteger(this.config.max) || this.config.max < 1)
    ) {
      throw new Error(`PostgresIncidentStore requires max >= 1, received ${this.config.max}`);
    }
  }

  async initialize(): Promise<void> {
    this.assertValidConfig();
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
    (this.pool as InstanceType<typeof Pool>).on('error', (error: Error) => {
      process.stderr.write(
        `${JSON.stringify({ level: 'warn', msg: 'incident store idle client error', error: error.message })}\n`,
      );
    });
    await (this.pool as InstanceType<typeof Pool>).query(MIGRATION_SQL);
  }

  async put(incident: Incident): Promise<void> {
    const pool = this.pool as pg.Pool;
    await pool.query(INSERT_SQL, [
      incident.id,
      incident.schemaVersion,
      incident.createdAt,
      incident.correlationId ?? null,
      incident.source,
      JSON.stringify(incident.metadata),
      incident.rootCause,
      JSON.stringify(incident.affectedComponents),
      incident.confidence,
      JSON.stringify(incident.evidence),
      incident.correlationReason,
      incident.classification,
    ]);
  }

  async list(): Promise<readonly Incident[]> {
    const pool = this.pool as pg.Pool;
    const result = await pool.query(LIST_SQL);
    return Object.freeze(result.rows.map((row) => this.rowToIncident(row)));
  }

  async close(): Promise<void> {
    const pool = this.pool as pg.Pool;
    await pool.end();
  }

  status(): { readonly persistent: boolean; readonly store: string } {
    return Object.freeze({ persistent: true, store: 'postgresql' });
  }

  private rowToIncident(row: unknown): Incident {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      schemaVersion: r.schema_version as number,
      createdAt: r.created_at as string,
      correlationId: r.correlation_id as string | undefined,
      source: r.source as string,
      metadata: Object.freeze(r.metadata as Record<string, unknown>),
      rootCause: r.root_cause as string,
      affectedComponents: Object.freeze(r.affected_components as string[]),
      confidence: r.confidence as number,
      evidence: Object.freeze(r.evidence as string[]),
      correlationReason: r.correlation_reason as string,
      classification: r.classification as Incident['classification'],
    };
  }
}
