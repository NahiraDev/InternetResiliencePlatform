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
import { injectSpeedInsights } from '@vercel/speed-insights';
/**
 * Generates the Speed Insights initialization script using the official package
 * This injects the Speed Insights tracking code into HTML responses
 */
export function generateSpeedInsightsScript(config) {
    const mergedConfig = {
        ...defaultSpeedInsightsConfig,
        ...config,
        framework: config?.framework || 'fastify',
    };
    // Separate beforeSend callback from config since it can't be JSON serialized
    const { beforeSend, ...serializableConfig } = mergedConfig;
    const configJson = JSON.stringify(serializableConfig);
    // Use the official Vercel Speed Insights script path
    // When deployed on Vercel, this is automatically resolved
    const scriptSrc = serializableConfig.scriptSrc || '/_vercel/speed-insights/script.js';
    // Build the script with proper callback handling
    const beforeSendScript = beforeSend
        ? `<script>
  window.speedInsightsBeforeSend = ${beforeSend.toString()};
</script>`
        : '';
    return `
<!-- Vercel Speed Insights -->
<script>
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
</script>
${beforeSendScript}
<script defer src="${scriptSrc}" data-config='${configJson}'></script>
`.trim();
}
/**
 * Middleware-style function to inject Speed Insights into HTML responses
 * Usage: Call this with HTML content to get HTML with Speed Insights injected
 */
export function injectSpeedInsightsIntoHtml(html, config) {
    const script = generateSpeedInsightsScript(config);
    // Try to inject before closing </head> tag
    if (html.includes('</head>')) {
        return html.replace('</head>', `${script}\n</head>`);
    }
    // Fallback: inject before closing </body> tag
    if (html.includes('</body>')) {
        return html.replace('</body>', `${script}\n</body>`);
    }
    // Last resort: append to the end
    return html + '\n' + script;
}
/**
 * Default Speed Insights configuration
 */
export const defaultSpeedInsightsConfig = {
    debug: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
    sampleRate: 1.0,
    framework: 'fastify',
    // DSN is automatically provided by Vercel during deployment
    // For local development, Speed Insights will work in debug mode
    ...(process.env.VERCEL_ANALYTICS_ID ? { dsn: process.env.VERCEL_ANALYTICS_ID } : {}),
};
/**
 * Initialize Speed Insights programmatically
 * This is useful for client-side initialization in dynamic scenarios
 *
 * @param config - Speed Insights configuration options
 * @returns The Speed Insights instance with route management functions
 */
export function initializeSpeedInsights(config) {
    const mergedConfig = {
        ...defaultSpeedInsightsConfig,
        ...config,
    };
    // Note: injectSpeedInsights is a browser-only function
    // This wrapper is provided for consistency but should only be called client-side
    if (typeof window === 'undefined') {
        console.warn('initializeSpeedInsights called on server-side. Speed Insights only works in the browser.');
        return null;
    }
    return injectSpeedInsights(mergedConfig);
}
//# sourceMappingURL=speed-insights.js.map