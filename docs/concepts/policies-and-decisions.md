# Policies and Decisions

IRP separates observation from policy evaluation and action selection.

A policy defines acceptable conditions and constraints. A decision evaluates the available evidence against those constraints and produces an explicit outcome for the consuming runtime or control-plane component.

## Decision principles

- Policy evaluation must be deterministic for the same evidence and policy inputs.
- Missing, stale, or insufficient-confidence evidence must not silently become compliant.
- Independent evidence dimensions must not be conflated; for example, an allowed egress identity does not prove an allowed destination.
- Safety and policy gates remain authoritative over operational automation.
- Decision-support layers should not mutate network state unless the component explicitly owns that responsibility.

## Typical flow

```text
Measurements / Evidence -> Policy Evaluation -> Decision -> Runtime / Control Plane
```

The decision result should preserve enough structured information for callers to understand why a policy was satisfied, rejected, or could not be evaluated reliably.
