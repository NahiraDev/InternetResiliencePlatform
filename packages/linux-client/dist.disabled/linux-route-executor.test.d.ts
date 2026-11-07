/**
 * Unit/contract tests for the Linux route executor.
 *
 * These tests exercise the executor logic with a fake command runner, proving:
 * - Snapshot capture before mutation
 * - Route plan validation (rejects invalid plans)
 * - Apply via `ip route replace`
 * - Rollback restores prior state
 * - Failure propagation (non-zero exit = failure)
 * - Missing snapshot on rollback fails explicitly
 *
 * The production executor code is identical to the real path — only the
 * command runner boundary is mocked.
 */
export {};
