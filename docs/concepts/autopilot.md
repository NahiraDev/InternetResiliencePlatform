# Network Autopilot

## Purpose

IRP Autopilot is the closed-loop control model that turns network evidence into bounded, policy-approved actions and verifies the result.

## Control loop

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
    → Apply → Verify → Rollback/Recover → Record
```

Each stage has a distinct responsibility. Measurement is evidence; it is not permission to mutate the network.

## Decision inputs

A decision may use:

- latency, jitter and packet loss;
- DNS resolution and response quality;
- TCP/TLS/HTTP reachability evidence;
- regional and egress observations;
- gateway health and capacity;
- recent failures, cooldowns and recovery history;
- explicit user/operator policy.

## Safety properties

Autopilot actions must be:

1. bounded;
2. policy-aware;
3. observable;
4. reversible where technically possible;
5. rate-limited and protected against flapping;
6. denied when required evidence is ambiguous.

## Platform boundary

Clients request capabilities from the shared control plane. They do not implement an independent routing or resilience algorithm. Platform-specific networking APIs are adapters behind stable contracts.

## Current implementation status

This document describes the durable model. The authoritative implementation status remains `PROJECT_STATE.md`, package tests, CI and runtime evidence.
