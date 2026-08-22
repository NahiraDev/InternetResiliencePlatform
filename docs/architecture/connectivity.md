# Connectivity Architecture

The connectivity subsystem abstracts how IRP observes and, where explicitly supported, interacts with network paths.

## Responsibilities

- represent connectivity targets and providers;
- execute bounded connectivity checks;
- normalize provider results;
- expose capability information to the runtime;
- preserve enough evidence for diagnosis and verification.

## Boundary

Connectivity is not the same as routing control. A connectivity provider may report that a path works without having authority to change the host network.

Consequential operations must be represented as explicit capabilities and pass policy, authorization, and verification gates.

## Failure handling

Provider failures should be typed and observable. Timeouts, unavailable providers, malformed responses, and unsupported operations should not be collapsed into generic success/failure values when the distinction affects diagnosis.

## Implementation

Primary package: `packages/connectivity`.

Current production capability is determined by implementation and tests rather than by the existence of an interface or provider abstraction.
