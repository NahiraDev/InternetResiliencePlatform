# Resilience and Recovery

IRP treats resilience as the ability to continue providing the required network capability when an observed path, dependency, or service condition degrades.

## Recovery principles

- Detect degradation from measured evidence rather than assumptions.
- Evaluate candidate recovery actions against policy and safety constraints.
- Prefer bounded, explainable decisions over opaque automatic changes.
- Record the evidence and decision context needed for later analysis.
- Avoid treating geographic or ASN information as proof of service capability.

Recovery may involve selecting another available path, changing an operational mode, or delegating an action to a component that owns the relevant network state. The measurement and assurance layers remain read-only unless their contract explicitly grants mutation authority.

## Control loop

```text
Observe -> Corroborate -> Evaluate -> Decide -> Act -> Re-observe
```

The loop is intentionally closed by re-observation so that a recovery action is validated against fresh evidence rather than assumed to have succeeded.
