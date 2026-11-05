/**
 * PostgreSQL-backed DecisionStore for durable decision persistence.
 *
 * Production hosts pass this store to ResilienceRuntime so that decision
 * records survive process restarts. Implements the DecisionStore port with
 * full ACID guarantees through PostgreSQL.
 *
 * Schema migration runs on initialize(): creates the `decisions` table and
 * supporting indexes.
 */

import type { DecisionRecord } from '../domain/types.js';
import type { DecisionStore } from '../ports/ports.js';
import type pg from 'pg';

export interface PostgresDecisionStoreConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly ssl?: boolean;
  readonly max?: number;
}

const MIGRATION_SQL = `
-- Migration 001: durable decision records
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  correlation_id TEXT,
  source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  runtime_state_before TEXT NOT NULL,
  runtime_state_after TEXT NOT NULL,
  runtime_context JSONB NOT NULL DEFAULT '{}',
  observations JSONB NOT NULL DEFAULT '[]',
  incidents JSONB NOT NULL DEFAULT '[]',
  policy_evaluation JSONB NOT NULL DEFAULT '{}',
  candidates JSONB NOT NULL DEFAULT '[]',
  selected_plan JSONB,
  validation JSONB,
  execution_result JSONB,
  verification_result JSONB,
  recovery_result JSONB,
  outcome TEXT NOT NULL,
  confidence REAL NOT NULL,
  duration_ms INTEGER NOT NULL,
  explanation JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_decision_id ON decisions(decision_id);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_correlation_id ON decisions(correlation_id);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON decisions(outcome);
`;

const INSERT_SQL = `
INSERT INTO decisions (
  id, decision_id, schema_version, created_at, correlation_id, source, metadata,
  runtime_state_before, runtime_state_after, runtime_context, observations,
  incidents, policy_evaluation, candidates, selected_plan, validation,
  execution_result, verification_result, recovery_result, outcome,
  confidence, duration_ms, explanation, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
  $17, $18, $19, $20, $21, $22, $23, NOW()
)
ON CONFLICT (id) DO UPDATE SET
  decision_id = EXCLUDED.decision_id,
  schema_version = EXCLUDED.schema_version,
  created_at = EXCLUDED.created_at,
  correlation_id = EXCLUDED.correlation_id,
  source = EXCLUDED.source,
  metadata = EXCLUDED.metadata,
  runtime_state_before = EXCLUDED.runtime_state_before,
  runtime_state_after = EXCLUDED.runtime_state_after,
  runtime_context = EXCLUDED.runtime_context,
  observations = EXCLUDED.observations,
  incidents = EXCLUDED.incidents,
  policy_evaluation = EXCLUDED.policy_evaluation,
  candidates = EXCLUDED.candidates,
  selected_plan = EXCLUDED.selected_plan,
  validation = EXCLUDED.validation,
  execution_result = EXCLUDED.execution_result,
  verification_result = EXCLUDED.verification_result,
  recovery_result = EXCLUDED.recovery_result,
  outcome = EXCLUDED.outcome,
  confidence = EXCLUDED.confidence,
  duration_ms = EXCLUDED.duration_ms,
  explanation = EXCLUDED.explanation,
  updated_at = NOW()
`;

const GET_SQL = `
SELECT * FROM decisions WHERE id = $1
`;

const LIST_SQL = `
SELECT * FROM decisions ORDER BY created_at DESC
`;

export class PostgresDecisionStore implements DecisionStore {
  private pool: unknown;

  constructor(private readonly config: PostgresDecisionStoreConfig) {}

  /**
   * Validates the configuration without touching the network.
   * Exposed separately from `initialize` so a host can fail closed on
   * malformed persistence settings before it constructs a store or starts
   * a cycle.
   */
  assertValidConfig(): void {
    if (!this.config.host.trim() || !this.config.database.trim() || !this.config.user.trim()) {
      throw new Error('PostgresDecisionStore requires host, database, and user');
    }
    if (!Number.isInteger(this.config.port) || this.config.port < 1 || this.config.port > 65_535) {
      throw new Error(`PostgresDecisionStore requires a valid port, received ${this.config.port}`);
    }
    if (
      this.config.max !== undefined &&
      (!Number.isInteger(this.config.max) || this.config.max < 1)
    ) {
      throw new Error(`PostgresDecisionStore requires max >= 1, received ${this.config.max}`);
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
        `${JSON.stringify({ level: 'warn', msg: 'decision store idle client error', error: error.message })}\n`,
      );
    });
    await (this.pool as InstanceType<typeof Pool>).query(MIGRATION_SQL);
  }

  async put(record: DecisionRecord): Promise<void> {
    const pool = this.pool as pg.Pool;
    await pool.query(INSERT_SQL, [
      record.id,
      record.decisionId,
      record.schemaVersion,
      record.createdAt,
      record.correlationId ?? null,
      record.source,
      JSON.stringify(record.metadata),
      record.runtimeStateBefore,
      record.runtimeStateAfter,
      JSON.stringify(record.runtimeContext),
      JSON.stringify(record.observations),
      JSON.stringify(record.incidents),
      JSON.stringify(record.policyEvaluation),
      JSON.stringify(record.candidates),
      record.selectedPlan ? JSON.stringify(record.selectedPlan) : null,
      record.validation ? JSON.stringify(record.validation) : null,
      record.executionResult ? JSON.stringify(record.executionResult) : null,
      record.verificationResult ? JSON.stringify(record.verificationResult) : null,
      record.recoveryResult ? JSON.stringify(record.recoveryResult) : null,
      record.outcome,
      record.confidence,
      record.durationMs,
      JSON.stringify(record.explanation),
    ]);
  }

  async list(): Promise<readonly DecisionRecord[]> {
    const pool = this.pool as pg.Pool;
    const result = await pool.query(LIST_SQL);
    return Object.freeze(result.rows.map((row) => this.rowToRecord(row)));
  }

  async get(id: string): Promise<DecisionRecord | undefined> {
    const pool = this.pool as pg.Pool;
    const result = await pool.query(GET_SQL, [id]);
    if (result.rows.length === 0) return undefined;
    return this.rowToRecord(result.rows[0]);
  }

  async close(): Promise<void> {
    const pool = this.pool as pg.Pool;
    await pool.end();
  }

  status(): { readonly persistent: boolean; readonly store: string } {
    return Object.freeze({ persistent: true, store: 'postgresql' });
  }

  private rowToRecord(row: unknown): DecisionRecord {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      decisionId: r.decision_id as string,
      schemaVersion: r.schema_version as number,
      createdAt: r.created_at as string,
      correlationId: r.correlation_id as string | undefined,
      source: r.source as string,
      metadata: Object.freeze(r.metadata as Record<string, unknown>),
      runtimeStateBefore: r.runtime_state_before as DecisionRecord['runtimeStateBefore'],
      runtimeStateAfter: r.runtime_state_after as DecisionRecord['runtimeStateAfter'],
      runtimeContext: Object.freeze(r.runtime_context as unknown as DecisionRecord['runtimeContext']),
      observations: Object.freeze(r.observations as unknown as DecisionRecord['observations']),
      incidents: Object.freeze(r.incidents as unknown as DecisionRecord['incidents']),
      policyEvaluation: Object.freeze(r.policy_evaluation) as unknown as DecisionRecord['policyEvaluation'],
      candidates: Object.freeze(r.candidates as unknown as DecisionRecord['candidates']),
      ...(r.selected_plan !== null
        ? { selectedPlan: r.selected_plan as DecisionRecord['selectedPlan'] }
        : {}),
      ...(r.validation !== null ? { validation: r.validation } : {}),
      ...(r.execution_result !== null ? { executionResult: r.execution_result } : {}),
      ...(r.verification_result !== null ? { verificationResult: r.verification_result } : {}),
      ...(r.recovery_result !== null ? { recoveryResult: r.recovery_result } : {}),
      outcome: r.outcome as DecisionRecord['outcome'],
      confidence: r.confidence as number,
      durationMs: r.duration_ms as number,
      explanation: Object.freeze(r.explanation as string[]),
    } as DecisionRecord;
  }
}
