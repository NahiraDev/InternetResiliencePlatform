/**
 * Vercel Web Analytics Integration
 *
 * This module provides utilities for integrating Vercel Web Analytics into the API:
 * 1. Client-side page view tracking via script injection for HTML responses
 * 2. Server-side custom event tracking for API endpoints
 *
 * For API performance monitoring, this complements existing telemetry:
 * - OpenTelemetry (distributed tracing)
 * - Prometheus metrics (performance data)
 * - Custom telemetry for API response times
 */
/**
 * Configuration options for Web Analytics
 */
export interface AnalyticsConfig {
    /**
     * Force environment mode
     * Default: 'auto' (detects from NODE_ENV)
     */
    mode?: 'production' | 'development' | 'auto';
    /**
     * Enable debug mode to log events to console
     * Default: true in development/test environments
     */
    debug?: boolean;
    /**
     * Custom endpoint URL for page view events
     */
    viewEndpoint?: string;
    /**
     * Custom endpoint URL for custom events
     */
    eventEndpoint?: string;
    /**
     * Custom script source URL
     */
    scriptSrc?: string;
    /**
     * Callback to modify events before sending
     */
    beforeSend?: (event: unknown) => unknown | null;
}
/**
 * Generates the Web Analytics initialization script
 * This can be injected into HTML responses for client-side page view tracking
 */
export declare function generateAnalyticsScript(config?: AnalyticsConfig): string;
/**
 * Middleware-style function to inject Web Analytics into HTML responses
 * Usage: Call this with HTML content to get HTML with Analytics injected
 */
export declare function injectAnalyticsIntoHtml(html: string, config?: AnalyticsConfig): string;
/**
 * Default Web Analytics configuration
 */
export declare const defaultAnalyticsConfig: AnalyticsConfig;
/**
 * Server-side custom event tracking
 *
 * This is a wrapper around the @vercel/analytics/server track() function
 * with error handling and logging.
 *
 * Note: Custom events are only available on Vercel Pro and Enterprise plans.
 * In development/test environments or when tracking fails, this will log
 * the event instead of throwing an error.
 *
 * @param event - Event name (max 255 characters)
 * @param properties - Optional event properties (strings, numbers, booleans, null only)
 * @returns Promise that resolves when tracking completes
 *
 * @example
 * ```typescript
 * await trackServerEvent('api_request', {
 *   endpoint: '/api/v1/users',
 *   method: 'POST',
 *   status: 201
 * });
 * ```
 */
export declare function trackServerEvent(event: string, properties?: Record<string, string | number | boolean | null>): Promise<void>;
//# sourceMappingURL=analytics.d.ts.map