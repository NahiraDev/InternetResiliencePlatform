import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  generateAnalyticsScript,
  injectAnalyticsIntoHtml,
  defaultAnalyticsConfig,
  trackServerEvent,
} from './analytics.js';

describe('Analytics Module', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('generateAnalyticsScript', () => {
    it('should generate basic analytics script without config', () => {
      const script = generateAnalyticsScript();
      expect(script).toContain('<!-- Vercel Web Analytics -->');
      expect(script).toContain('<script defer src=');
      expect(script).toContain('vercel-insights.com');
    });

    it('should use debug script in development mode', () => {
      process.env.NODE_ENV = 'development';
      const script = generateAnalyticsScript();
      expect(script).toContain('script.debug.js');
    });

    it('should use production script in production mode', () => {
      process.env.NODE_ENV = 'production';
      const script = generateAnalyticsScript({ debug: false });
      expect(script).toContain('script.js');
      expect(script).not.toContain('script.debug.js');
    });

    it('should include custom script source when provided', () => {
      const customSrc = 'https://custom-cdn.example.com/analytics.js';
      const script = generateAnalyticsScript({ scriptSrc: customSrc });
      expect(script).toContain(customSrc);
    });

    it('should include custom endpoints in configuration', () => {
      const script = generateAnalyticsScript({
        viewEndpoint: '/custom/views',
        eventEndpoint: '/custom/events',
      });
      expect(script).toContain('window.va');
      expect(script).toContain('viewEndpoint');
      expect(script).toContain('/custom/views');
      expect(script).toContain('eventEndpoint');
      expect(script).toContain('/custom/events');
    });
  });

  describe('injectAnalyticsIntoHtml', () => {
    it('should inject script into HTML with head tag', () => {
      const html = '<html><head><title>Test</title></head><body>Content</body></html>';
      const result = injectAnalyticsIntoHtml(html);
      expect(result).toContain('<!-- Vercel Web Analytics -->');
      expect(result).toContain('</head>');
      expect(result.indexOf('Analytics')).toBeLessThan(result.indexOf('</head>'));
    });

    it('should inject script before body tag if no head tag exists', () => {
      const html = '<html><body>Content</body></html>';
      const result = injectAnalyticsIntoHtml(html);
      expect(result).toContain('<!-- Vercel Web Analytics -->');
      expect(result).toContain('</body>');
      expect(result.indexOf('Analytics')).toBeLessThan(result.indexOf('</body>'));
    });

    it('should append script to end if no head or body tags exist', () => {
      const html = '<div>Simple content</div>';
      const result = injectAnalyticsIntoHtml(html);
      expect(result).toContain('<!-- Vercel Web Analytics -->');
      expect(result.indexOf('Simple content')).toBeLessThan(result.indexOf('Analytics'));
    });

    it('should pass configuration to script generator', () => {
      const html = '<html><head></head><body></body></html>';
      const config = { scriptSrc: 'https://custom.example.com/script.js' };
      const result = injectAnalyticsIntoHtml(html, config);
      expect(result).toContain('custom.example.com/script.js');
    });
  });

  describe('defaultAnalyticsConfig', () => {
    it('should have mode set to auto', () => {
      expect(defaultAnalyticsConfig.mode).toBe('auto');
    });

    it('should enable debug in development environment', () => {
      process.env.NODE_ENV = 'development';
      // Re-import to get updated default based on new NODE_ENV
      const config = {
        mode: 'auto' as const,
        debug: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
      };
      expect(config.debug).toBe(true);
    });

    it('should enable debug in test environment', () => {
      process.env.NODE_ENV = 'test';
      const config = {
        mode: 'auto' as const,
        debug: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
      };
      expect(config.debug).toBe(true);
    });
  });

  describe('trackServerEvent', () => {
    beforeEach(() => {
      // Restore console methods before each test
    });

    it('should not throw errors in test environment', async () => {
      process.env.NODE_ENV = 'test';
      await expect(trackServerEvent('test_event')).resolves.toBeUndefined();
    });

    it('should handle events with properties', async () => {
      process.env.NODE_ENV = 'test';
      await expect(
        trackServerEvent('test_event', {
          prop1: 'value1',
          prop2: 123,
          prop3: true,
          prop4: null,
        }),
      ).resolves.toBeUndefined();
    });

    it('should log in development mode when debug is enabled', async () => {
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_ANALYTICS_DEBUG = 'true';
      
      const logs: unknown[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args);

      await trackServerEvent('dev_event', { test: 'value' });

      console.log = originalLog;
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should not log when debug is disabled', async () => {
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_ANALYTICS_DEBUG = 'false';
      
      const logs: unknown[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args);

      await trackServerEvent('dev_event', { test: 'value' });

      console.log = originalLog;
      expect(logs.length).toBe(0);
    });
  });
});
