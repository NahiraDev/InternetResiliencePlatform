FROM node:22-slim AS dev
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY config ./config
RUN pnpm install
CMD ["pnpm", "dev"]
