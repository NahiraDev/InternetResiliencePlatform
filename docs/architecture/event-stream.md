# Runtime Event Stream

Runtime events are emitted by the runtime event sink during state changes, observations, planning, execution, verification, recovery, and decision recording. Event consumers must treat the runtime as the source of truth and deduplicate by committed event identity/sequence when connected to a persistent event sink. The in-memory sink is deterministic for tests; production implementations must persist event cursor metadata before acknowledging client replay.
