CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TYPE "UserStatus" AS ENUM ('pending','active','suspended','deleted');
CREATE TYPE "TokenType" AS ENUM ('refresh','password_reset','email_verification');
CREATE TYPE "MembershipStatus" AS ENUM ('invited','active','suspended','removed');
-- Prisma owns the full table DDL from schema.prisma; this migration enables required PostgreSQL primitives for UUID and case-insensitive email support.
