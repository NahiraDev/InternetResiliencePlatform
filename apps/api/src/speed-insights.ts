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
 */

/**
 * Configuration options for Speed Insights
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
  route?: string;
}

/**
 * Generates the Speed Insights initialization script
 * This can be injected into HTML responses
 */
export function generateSpeedInsightsScript(config?: SpeedInsightsConfig): string {
  const configJson = config ? JSON.stringify(config) : '{}';

  return `
<!-- Vercel Speed Insights -->
<script>
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
</script>
<script type="module">
  import { injectSpeedInsights } from 'https://cdn.jsdelivr.net/npm/@vercel/speed-insights@2/dist/index.js';
  injectSpeedInsights(${configJson});
</script>
`.trim();
}

/**
 * Middleware-style function to inject Speed Insights into HTML responses
 * Usage: Call this with HTML content to get HTML with Speed Insights injected
 */
export function injectSpeedInsightsIntoHtml(
  html: string,
  config?: SpeedInsightsConfig,
): string {
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
export const defaultSpeedInsightsConfig: SpeedInsightsConfig = {
  debug: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  sampleRate: 1.0,
};
