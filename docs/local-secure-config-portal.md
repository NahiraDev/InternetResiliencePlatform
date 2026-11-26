# Local secure configuration portal

```
pnpm config:portal              # http://127.0.0.1:4780/
pnpm config:portal reset-admin  # replace the local administrator password
pnpm start:secure               # API fed from the saved configuration
```

- Values are encrypted with AES-256-GCM. The key is held by the Linux Secret Service, macOS Keychain
  or Windows DPAPI. There is no plaintext mode; if the key store fails, nothing starts.
- Location: `~/.config/irp/secure-config` (Linux), `~/Library/Application Support/IRP/secure-config`
  (macOS), `%APPDATA%\IRP\secure-config` (Windows), or `IRP_SECURE_CONFIG_DIR` (outside the repository).
- Portal port: `IRP_CONFIG_PORTAL_PORT` (default 4780). It always binds 127.0.0.1.
- Only `pnpm start:secure` reads the store. Existing environment variables take precedence.
  `NODE_ENV` defaults to `production` and `API_HOST` to `127.0.0.1` for that command.
- Database migrations are not run by `start:secure`.
- The daemon, host clients and telemetry exporter variables remain environment-only.
- If the browser offers to save a value as a password, decline.
- Any program running as your operating-system user may be able to read the key store. This protects
  secrets at rest and from the repository, not from malware or agents with your account's access.

The field inventory and validation rules are in `packages/config/src/secure/fields.ts`.
