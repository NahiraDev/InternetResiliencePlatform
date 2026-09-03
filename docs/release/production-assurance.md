# IRP System Assurance Gate

System Assurance is the permanent executable integration gate for the canonical IRP closed loop. It exists separately from CI health and from final production certification.

## Why this exists

A green build proves that the repository can be built and tested. It does not prove that the important runtime components are connected. System Assurance closes that gap by executing the canonical `@irp/resilience-runtime` validation and requiring evidence for the complete control loop:

`Observe → Measure → Detect → Diagnose → Decide → Policy → Apply → Verify → Recover`

## Command

```bash
pnpm production:assure
```

The command:

1. Builds the canonical resilience runtime package.
2. Runs strict package integration discovery/loading.
3. Executes the existing deterministic Phase 40 runtime scenarios through the canonical runtime package.
4. Verifies that all canonical stages and required scenarios are represented by executable results.
5. Verifies every declared runtime acceptance criterion.
6. Hashes the generated runtime artifact set.
7. Writes a machine-readable assurance report and SHA-256 digest.

Outputs:

- `artifacts/production-assurance/assurance-report.json`
- `artifacts/production-assurance/assurance-report.sha256`

## Permanent rules

- System Assurance must pass before a phase that changes runtime/control-plane behavior can be treated as integration-complete.
- Missing evidence is never converted to PASS.
- Synthetic deterministic scenarios are explicitly labeled as such and never count as real-world production evidence.
- Final production certification remains a separate fail-closed gate requiring real device, regional, security, release, recovery, and infrastructure evidence.
- The assurance contract is the canonical list of required closed-loop stages and scenarios. Future runtime changes must update executable validation rather than merely adding documentation.

## Certification boundary

A successful System Assurance run means the repository's canonical runtime can execute its declared closed-loop scenarios and that package-level runtime integration is healthy at the time of the run. It does **not** mean that IRP has been certified on a real ISP/network, physical iOS/Android devices, production gateways, or production infrastructure.
