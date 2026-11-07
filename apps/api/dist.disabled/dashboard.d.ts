/**
 * IRP Control Center (web).
 *
 * Presentation only. The page reads the existing `GET /api/v1/platform/status` payload and the
 * existing readiness/metrics/docs links; it adds no endpoint, no mutation and no host control.
 * Visual tokens mirror docs/design/irp-design-tokens.json (enforced by design-tokens.test.ts).
 *
 * Everything shown is a field the API returned. A field that is absent is shown as "Not reported",
 * never defaulted to a healthy-looking value.
 */
export declare const dashboardHtml: string;
export declare const dashboardCss: string;
export declare const dashboardScript: string;
//# sourceMappingURL=dashboard.d.ts.map