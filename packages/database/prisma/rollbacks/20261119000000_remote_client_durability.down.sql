-- Not executed by `prisma migrate deploy`. Used by the migration up/down/up test and by operators.
-- Drops only the tables created by 20261119000000_remote_client_durability; earlier data is untouched.
-- Rolling this back discards enrolled devices, refresh tokens and the remote-client audit trail,
-- so enrolled devices must be re-enrolled afterwards.
DROP TABLE IF EXISTS "PlatformSetting", "RemoteClientAuditEvent", "RemoteClientEnrollmentRequest",
  "RemoteClientRefreshToken", "RemoteClientCredential" CASCADE;
