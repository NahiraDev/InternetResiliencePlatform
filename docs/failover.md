# Automatic Failover

Failover is driven by configurable failure and recovery streak thresholds, cooldown timers, failback policy, and redundant provider groups. The engine detects immediate health-check failures, records degraded samples, and replaces the active provider when the active provider exceeds the failure threshold or a better provider wins after cooldown.

Transitions are graceful: selection changes are recorded as events and the system DNS manager validates the target provider before applying host changes.
