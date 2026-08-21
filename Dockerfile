# syntax=docker/dockerfile:1.7
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_HOME=/pnpm/corepack \
    PATH=/pnpm:$PATH
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.21.0 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --no-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @irp/database prisma:generate
RUN pnpm build

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    COREPACK_HOME=/app/.cache/node/corepack \
    PATH=/pnpm:$PATH \
    IRP_CONFIG_DIR=/app/config
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 irp \
  && useradd --system --uid 1001 --gid irp --home-dir /app --shell /usr/sbin/nologin irp \
  && mkdir -p /app/.cache/node/corepack /app/.local/share/pnpm /app/tmp \
  && chown -R irp:irp /app/.cache /app/.local /app/tmp \
  && corepack enable \
  && corepack prepare pnpm@11.21.0 --activate
COPY --from=base --chown=irp:irp /pnpm /pnpm
COPY --from=build --chown=irp:irp /app/package.json /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=build --chown=irp:irp /app/node_modules ./node_modules
COPY --from=build --chown=irp:irp /app/apps ./apps
COPY --from=build --chown=irp:irp /app/packages ./packages
COPY --from=build --chown=irp:irp /app/config ./config
COPY --from=build --chown=irp:irp /app/scripts ./scripts
USER irp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node scripts/healthcheck.mjs http://127.0.0.1:8080/api/v1/ready
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "scripts/runtime-entrypoint.mjs"]
