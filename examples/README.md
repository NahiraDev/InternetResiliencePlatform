# Examples

These examples are **capability-oriented**. They demonstrate how to use implemented IRP interfaces without coupling examples to roadmap phases.

## Examples

| Example | Purpose | Requires build | Mutates host networking |
| --- | --- | --- | --- |
| `basic-api` | Call the read-only platform API | Running API | No |
| `network-measurement` | Perform a bounded DNS measurement | Yes | No |
| `dns-diagnostics` | Inspect DNS resolution timing and addresses | Yes | No |
| `connectivity` | Run a small connectivity observation workflow | Yes | No |
| `failover` | Simulate candidate selection and verification logic | Yes | No |
| `autopilot` | Simulate the policy-controlled decision loop | Yes | No |

## Running examples

From the repository root:

```bash
pnpm build
```

Then follow the README inside the example you want to run.

Examples are intentionally safe by default. They do not change system routes, DNS configuration, firewall state, tunnel state, or other host networking.

## Design rules

- Examples describe capabilities, not implementation phases.
- Every example must have its own README.
- Examples must use public, supported package interfaces where possible.
- Examples must be deterministic or clearly label live network dependencies.
- Examples must not contain generated result dumps or historical phase artifacts.
- Examples must never require secrets for their basic path.
- An example must not imply that an abstraction is a production-ready network mutation capability.

New roadmap phases must update an existing example or add a capability example only when a genuinely new user-facing capability needs one.
