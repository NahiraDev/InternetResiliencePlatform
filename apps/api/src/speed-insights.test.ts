import { describe, it, expect } from 'vitest';
import {
  generateSpeedInsightsScript,
  injectSpeedInsightsIntoHtml,
  defaultSpeedInsightsConfig,
} from './speed-insights.js';

describe('Speed Insights Utilities', () => {
  describe('generateSpeedInsightsScript', () => {
    it('generates basic script without config', () => {
      const script = generateSpeedInsightsScript();
      expect(script).toContain('window.si');
      expect(script).toContain('window.siq');
      expect(script).toContain('injectSpeedInsights');
      expect(script).toContain('{}');
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

    it('includes CDN import for Speed Insights', () => {
      const script = generateSpeedInsightsScript();
      expect(script).toContain('@vercel/speed-insights');
      expect(script).toContain('type="module"');
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
  });
});
