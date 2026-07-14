import { describe, expect, it } from 'vitest';
import { ConfigLoader } from './index.js';

describe('loadConfig', () => {
  it('loads default configuration', () => {
    const loader = new ConfigLoader();
    const config = loader.load();
    expect(config.app).toBeDefined();
    expect(config.api).toBeDefined();
    expect(config.logger).toBeDefined();
    expect(config.telemetry).toBeDefined();
  });

  it('merges environment variables with config', () => {
    const env = {
      NODE_ENV: 'test',
      APP_NAME: 'TestApp',
      API_HOST: 'localhost',
      API_PORT: '3000',
      LOG_LEVEL: 'debug',
    };
    const loader = new ConfigLoader({ env });
    const config = loader.load();
    expect(config.app.environment).toBe('test');
    expect(config.app.name).toBe('TestApp');
  });
});
