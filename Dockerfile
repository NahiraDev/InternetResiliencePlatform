# syntax=docker/dockerfile:1.7
FROM node:26-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm/bin:/pnpm:$PATH
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global --prefix /pnpm --no-audit --no-fund pnpm@11.21.0

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY .husky/install.mjs ./.husky/install.mjs
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @irp/database prisma:generate
RUN pnpm build

# WP2.2b: production dependency closure. Dependency installation happens only
# here, at image-build time: every node_modules tree from the build stage is
# discarded and a fresh production-only tree is installed from the frozen
# lockfile and the already-populated store (--offline fails closed if anything
# would be fetched). A fresh tree avoids pnpm's orphan retention
# (modulesCacheMaxAge) and stale .bin shims that an in-place prune leaves
# behind. NODE_ENV=production matches the runtime environment and makes the
# root `prepare` hook skip husky (a dev-only tool). The runtime image receives
# only this tree; dev/test tooling (vitest, vite, esbuild, eslint, turbo, ...)
# is excluded. The Prisma CLI is a root production dependency so
# `prisma migrate deploy` keeps working at startup without any install.
FROM build AS prod-deps
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  find /app -name node_modules -type d -prune -exec rm -rf {} + \
  && pnpm install --frozen-lockfile --prod --offline

FROM node:26-slim AS runtime
ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm/bin:/pnpm:$PATH \
    IRP_CONFIG_DIR=/app/config
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 irp \
  && useradd --system --uid 1001 --gid irp --home-dir /app --shell /usr/sbin/nologin irp \
  && mkdir -p /app/.local/share/pnpm /app/tmp \
  && chown -R irp:irp /app/.local /app/tmp
COPY --from=base --chown=irp:irp /pnpm /pnpm
COPY --from=prod-deps --chown=irp:irp /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/turbo.json ./
COPY --from=prod-deps --chown=irp:irp /app/node_modules ./node_modules
COPY --from=prod-deps --chown=irp:irp /app/apps ./apps
COPY --from=prod-deps --chown=irp:irp /app/packages ./packages
COPY --from=build --chown=irp:irp /app/config ./config
COPY --from=build --chown=irp:irp /app/scripts ./scripts
USER irp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node scripts/healthcheck.mjs http://127.0.0.1:8080/api/v1/ready
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "scripts/runtime-entrypoint.mjs"]
