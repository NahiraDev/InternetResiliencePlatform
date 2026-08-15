# Final Verification

Commands required for the clean-state gate:

- `node --version`
- `pnpm --version`
- `pnpm clean`
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec prettier --check .`
- `pnpm test`
- `pnpm exec vitest run`
- `pnpm exec turbo run test --force -- --coverage`
- `pnpm build`
- `pnpm validate`

pnpmCommandsOnly = true
npmCommandsExecuted = 0
yarnCommandsExecuted = 0
bunCommandsExecuted = 0
