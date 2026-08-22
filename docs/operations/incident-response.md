# Incident Response

Incident response for IRP starts with preserving evidence and identifying the failing boundary before changing network state.

## Triage order

1. Record the deployment/commit version and time window.
2. Check service health and readiness.
3. Check application logs and telemetry.
4. Check database availability.
5. Check network measurements and classify the failure layer.
6. Determine whether the failure is isolated or systemic.
7. Apply only authorized, bounded recovery actions.
8. Verify the result independently.

## Evidence

Capture relevant logs, metrics, trace/request correlation identifiers, measurement results, container status, and configuration class. Never include credentials, tokens, private keys, or other secrets in incident records.

## Recovery

Prefer the smallest reversible action that addresses the diagnosed failure. Use cooldowns and circuit breakers to prevent recovery loops. If verification fails, stop escalation when policy requires it and preserve the evidence for diagnosis.

## Post-incident

Document root cause, contributing factors, detection gap, recovery result, and preventive change. Update the canonical architecture or troubleshooting documentation when the incident reveals a durable operational requirement.
