-- Not executed by `prisma migrate deploy`. Used by the migration up/down/up test and by operators.
DROP TABLE IF EXISTS "RateLimitBucket", "CacheEntry", "OutboxEvent", "AuditLog", "Token", "Session",
  "Membership", "RolePermission", "Permission", "Role", "Workspace", "Project", "Organization", "User" CASCADE;
