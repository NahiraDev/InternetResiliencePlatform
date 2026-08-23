# Recovery and Rollback

Recovery is a first-class product behavior. A successful command is not sufficient evidence that the resulting network state is healthy.

## Recovery sequence

1. Detect degraded or failed state.
2. Capture evidence before mutation where practical.
3. Stop or isolate the failing operation.
4. Apply the bounded recovery policy.
5. Verify the resulting state.
6. Record the outcome and evidence.
7. Escalate when the recovery budget is exhausted.

## Rollback requirements

Consequential changes should define:

- the previous known-good state;
- the rollback trigger;
- timeout and retry bounds;
- what state is safe to preserve;
- how rollback success is verified;
- how repeated failures are suppressed.

## Client recovery

Desktop and mobile clients must tolerate process restarts, temporary connectivity loss, expired sessions and configuration synchronization failures without silently claiming a healthy network state.

## Gateway recovery

Gateway failure must not cause uncontrolled switching. Selection and failover use health evidence, hysteresis/cooldowns and explicit policy. Removing a gateway from service must be auditable.

## Disaster recovery

Control-plane backups must cover durable configuration and required metadata. Restore procedures must be tested, not merely documented.
