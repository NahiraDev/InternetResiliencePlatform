/**
 * Vercel Speed Insights Integration
 *
 * NOTE: Speed Insights is primarily designed for frontend applications to measure
 * Web Vitals (Largest Contentful Paint, First Input Delay, Cumulative Layout Shift, etc.)
 * in the browser. This API is a backend service, so Speed Insights won't provide
 * meaningful metrics unless HTML responses are served.
 *
 * This module provides utilities for:
 * 1. Injecting Speed Insights script into HTML responses (if/when this API serves HTML)
 * 2. Future-proofing the codebase for potential frontend integrations
 *
 * For backend API performance monitoring, consider using:
 * - OpenTelemetry (already configured in this project)
 * - Prometheus metrics (already configured)
 * - Custom telemetry for API response times and throughput
 *
 * @see https://vercel.com/docs/speed-insights/quickstart
 */
import { type BeforeSendMiddleware } from '@vercel/speed-insights';
/**
 * Configuration options for Speed Insights
 * These map to the official @vercel/speed-insights options
 */
export interface SpeedInsightsConfig {
    /**
     * Sample rate (0-1) for sending events to Vercel
     * Default: 1 (100% of events)
     */
    sampleRate?: number;
    /**
     * Enable debug mode to log events to console
     * Default: true in development/test environments
     */
    debug?: boolean;
    /**
     * Custom endpoint URL for Speed Insights data
     */
    endpoint?: string;
    /**
     * Custom script source URL
     */
    scriptSrc?: string;
    /**
     * Current route path for dynamic routing
     */
    route?: string | null;
    /**
     * The DSN of the project to send events to
     * Only required when self-hosting
     */
    dsn?: string;
    /**
     * Framework identifier (e.g., 'fastify', 'express')
     */
    framework?: string;
    /**
     * Base path for the application
     */
    basePath?: string;
    /**
     * Middleware function to modify events before they are sent
     * Should return the event object or null to cancel the event
     */
    beforeSend?: BeforeSendMiddleware;
}
/**
 * Generates the Speed Insights initialization script using the official package
 * This injects the Speed Insights tracking code into HTML responses
 */
export declare function generateSpeedInsightsScript(config?: SpeedInsightsConfig): string;
/**
 * Middleware-style function to inject Speed Insights into HTML responses
 * Usage: Call this with HTML content to get HTML with Speed Insights injected
 */
export declare function injectSpeedInsightsIntoHtml(html: string, config?: SpeedInsightsConfig): string;
/**
 * Default Speed Insights configuration
 */
export declare const defaultSpeedInsightsConfig: SpeedInsightsConfig;
/**
 * Initialize Speed Insights programmatically
 * This is useful for client-side initialization in dynamic scenarios
 *
 * @param config - Speed Insights configuration options
 * @returns The Speed Insights instance with route management functions
 */
export declare function initializeSpeedInsights(config?: SpeedInsightsConfig): {
    setRoute: (route: string | null) => void;
} | null;
//# sourceMappingURL=speed-insights.d.ts.map