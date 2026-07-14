# Phase 5 Development Guide

Use `pnpm build` for workspace compilation and `pnpm --filter @irp/api test` for API integration coverage. API tests exercise registration, login, authorization failure, organization creation, project creation, and workspace creation.

Set `JWT_SECRET` to a production secret of at least 32 characters. Set `DATABASE_URL` before enabling generated Prisma clients in deployed environments.
