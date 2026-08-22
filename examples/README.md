# Examples

These examples are **capability-oriented**. They demonstrate supported IRP interfaces and workflows without coupling the examples to roadmap phases.

## Examples

| Example | Purpose | Build required | Live service required | Host mutation |
| --- | --- | --- | --- | --- |
| `basic-api` | Call the read-only platform status API | No | Yes | No |
| `network-measurement` | Perform a bounded DNS measurement | Yes | No | No |
| `dns-diagnostics` | Inspect DNS resolution timing and addresses | Yes | No | No |
| `connectivity` | Observe platform connectivity status through the API | No | Yes | No |
| `failover` | Simulate candidate selection and verification logic | Yes | No | No |
| `autopilot` | Simulate the policy-controlled decision loop | Yes | No | No |

## Quick start

From the repository root:

```bash
pnpm install
pnpm build
pnpm examples:smoke
```

`examples:smoke` executes the deterministic/local examples and fails if an example exits unsuccessfully. It intentionally does not start external services or make host-network mutations.

For API examples, start the API using the normal repository development workflow and then run:

```bash
node examples/basic-api/request.mjs
node examples/connectivity/check.mjs
```

Optional API base URL:

```bash
IRP_API_BASE_URL=http://127.0.0.1:3000
```

## Example contract

Every example must have:

- a local `README.md`;
- a clear purpose and prerequisites;
- an executable entry point;
- documented live dependencies;
- safe-by-default behavior;
- no required secrets on the basic path;
- no generated result dumps;
- no phase-specific naming;
- a dependency on public/supported interfaces where practical.

Examples must not imply that an interface is a production-ready network mutation capability merely because an abstraction exists.

## Safety

Examples do not change system routes, DNS configuration, firewall state, tunnel state, or other host networking. Simulation examples stop before mutation. Any future mutation example must use an explicit isolated test environment and document its prerequisites and rollback behavior.

## Lifecycle

Roadmap phases must never create `examples/phase-*` directories. A phase may update an existing example or add a new capability example only when a genuinely new user-facing capability warrants one.
