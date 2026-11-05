/**
 * IRP-vs-network failure distinction for issue #283.
 * A misclassified internal fault looks like a network outage and triggers
 * the wrong recovery; this pure classifier keeps the distinction explicit.
 */
export const classifyFailure = (evidence) => {
    if (evidence.runtimeFault || evidence.selfUnhealthy)
        return 'irp-internal';
    if (evidence.dependencyFault && !evidence.networkDegraded)
        return 'dependency-degraded';
    if (evidence.networkDegraded && !evidence.runtimeFault && !evidence.selfUnhealthy) {
        return 'network-external';
    }
    if (evidence.dependencyFault)
        return 'dependency-degraded';
    return 'unknown';
};
//# sourceMappingURL=failure-classifier.js.map