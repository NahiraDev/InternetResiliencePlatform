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
export function generateAnalyticsScript(config?: AnalyticsConfig): string {
  const debug = config?.debug ?? (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');
  
  // Use debug script in development, production script otherwise
  const scriptPath = debug ? 'script.debug.js' : 'script.js';
  const scriptSrc = config?.scriptSrc ?? `https://cdn.vercel-insights.com/v1/${scriptPath}`;

  // Build configuration object if custom endpoints are provided
  const configParts: string[] = [];
  if (config?.viewEndpoint) {
    configParts.push(`viewEndpoint: ${JSON.stringify(config.viewEndpoint)}`);
  }
  if (config?.eventEndpoint) {
    configParts.push(`eventEndpoint: ${JSON.stringify(config.eventEndpoint)}`);
  }
  if (config?.beforeSend) {
    configParts.push(`beforeSend: ${config.beforeSend.toString()}`);
  }

  const configScript = configParts.length > 0
    ? `\n<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('config', { ${configParts.join(', ')} });
</script>`
    : '';

  return `<!-- Vercel Web Analytics -->${configScript}
<script defer src="${scriptSrc}"></script>`;
}

/**
 * Middleware-style function to inject Web Analytics into HTML responses
 * Usage: Call this with HTML content to get HTML with Analytics injected
 */
export function injectAnalyticsIntoHtml(html: string, config?: AnalyticsConfig): string {
  const script = generateAnalyticsScript(config);

  // Try to inject before closing </head> tag (preferred)
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
 * Default Web Analytics configuration
 */
export const defaultAnalyticsConfig: AnalyticsConfig = {
  mode: 'auto',
  debug: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
};

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
export async function trackServerEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    // Only attempt to track in production environments
    const env = process.env.NODE_ENV?.toLowerCase() ?? 'development';
    const isProduction = ['production', 'staging'].includes(env);

    if (!isProduction) {
      // In development, just log the event
      if (process.env.VERCEL_ANALYTICS_DEBUG !== 'false') {
        console.log('[Analytics Debug]', { event, properties });
      }
      return;
    }

    // Import the server-side track function dynamically
    // This prevents issues if the package is not available
    const { track } = await import('@vercel/analytics/server');
    await track(event, properties);
  } catch (error) {
    // Silently fail in non-production or if tracking is not available
    // This ensures analytics issues don't break the API
    if (process.env.VERCEL_ANALYTICS_DEBUG !== 'false') {
      console.warn('[Analytics Warning] Failed to track event:', {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
