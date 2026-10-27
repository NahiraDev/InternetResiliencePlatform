import { describe, it, expect, vi } from 'vitest';
import {
  generateSpeedInsightsScript,
  injectSpeedInsightsIntoHtml,
  defaultSpeedInsightsConfig,
  initializeSpeedInsights,
} from './speed-insights.js';

describe('Speed Insights Utilities', () => {
  describe('generateSpeedInsightsScript', () => {
    it('generates basic script without config', () => {
      const script = generateSpeedInsightsScript();
      expect(script).toContain('window.si');
      expect(script).toContain('window.siq');
      expect(script).toContain('/_vercel/speed-insights/script.js');
      expect(script).toContain('defer');
    });

    it('generates script with custom config', () => {
      const config = {
        sampleRate: 0.5,
        debug: true,
        route: '/api/test',
      };
      const script = generateSpeedInsightsScript(config);
      expect(script).toContain('"sampleRate":0.5');
      expect(script).toContain('"debug":true');
      expect(script).toContain('"route":"/api/test"');
    });

    it('uses official Vercel Speed Insights script path', () => {
      const script = generateSpeedInsightsScript();
      expect(script).toContain('/_vercel/speed-insights/script.js');
      expect(script).toContain('defer');
      expect(script).toContain('data-config');
    });

    it('includes framework identifier', () => {
      const script = generateSpeedInsightsScript();
      expect(script).toContain('"framework":"fastify"');
    });

    it('supports custom script source', () => {
      const config = { scriptSrc: '/custom/path/script.js' };
      const script = generateSpeedInsightsScript(config);
      expect(script).toContain('/custom/path/script.js');
    });
  });

  describe('injectSpeedInsightsIntoHtml', () => {
    it('injects script before closing head tag', () => {
      const html = '<html><head><title>Test</title></head><body>Content</body></html>';
      const result = injectSpeedInsightsIntoHtml(html);
      expect(result).toContain('window.si');
      expect(result.indexOf('window.si')).toBeLessThan(result.indexOf('</head>'));
    });

    it('injects script before closing body tag if no head tag', () => {
      const html = '<html><body><h1>Test</h1></body></html>';
      const result = injectSpeedInsightsIntoHtml(html);
      expect(result).toContain('window.si');
      expect(result.indexOf('window.si')).toBeLessThan(result.indexOf('</body>'));
    });

    it('appends script if no head or body tags', () => {
      const html = '<div>Simple HTML</div>';
      const result = injectSpeedInsightsIntoHtml(html);
      expect(result).toContain('window.si');
      expect(result.endsWith('</script>')).toBe(true);
    });

    it('passes config to script generation', () => {
      const html = '<html><head></head><body></body></html>';
      const config = { sampleRate: 0.3, debug: false };
      const result = injectSpeedInsightsIntoHtml(html, config);
      expect(result).toContain('"sampleRate":0.3');
      expect(result).toContain('"debug":false');
    });
  });

  describe('defaultSpeedInsightsConfig', () => {
    it('has debug enabled in test environment', () => {
      expect(defaultSpeedInsightsConfig.debug).toBe(true);
    });

    it('has 100% sample rate by default', () => {
      expect(defaultSpeedInsightsConfig.sampleRate).toBe(1.0);
    });

    it('includes framework identifier', () => {
      expect(defaultSpeedInsightsConfig.framework).toBe('fastify');
    });

    it('includes DSN from environment variable if available', () => {
      // In test environment, VERCEL_ANALYTICS_ID may not be set
      // The DSN property is only included if the environment variable exists
      if (process.env.VERCEL_ANALYTICS_ID) {
        expect(defaultSpeedInsightsConfig.dsn).toBe(process.env.VERCEL_ANALYTICS_ID);
      } else {
        expect(defaultSpeedInsightsConfig.dsn).toBeUndefined();
      }
    });
  });

  describe('initializeSpeedInsights', () => {
    it('warns when called server-side', () => {
      // In Node.js environment, window is undefined
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = initializeSpeedInsights();
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('server-side')
      );
      consoleSpy.mockRestore();
    });
  });
});
