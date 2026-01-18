import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Example integration test for Shannon package.
 *
 * Integration tests verify that multiple components work together correctly.
 * They typically:
 * - Test the interaction between modules
 * - May involve external resources (databases, APIs)
 * - Take longer to run than unit tests
 * - Use .spec.ts extension to distinguish from unit tests
 *
 * This example demonstrates integration testing patterns without
 * requiring actual external services.
 */

// Simulated service for demonstration
class ConfigService {
  private configs: Map<string, object> = new Map();

  async load(name: string, config: object): Promise<void> {
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.configs.set(name, config);
  }

  async get(name: string): Promise<object | undefined> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return this.configs.get(name);
  }

  async validate(name: string): Promise<boolean> {
    const config = await this.get(name);
    if (!config) return false;
    // Basic validation: must have 'target' field
    return 'target' in config;
  }

  clear(): void {
    this.configs.clear();
  }
}

// Simulated scanner that depends on ConfigService
class VulnerabilityScanner {
  constructor(private configService: ConfigService) {}

  async scan(configName: string): Promise<{ status: string; findings: string[] }> {
    const isValid = await this.configService.validate(configName);
    if (!isValid) {
      return { status: 'error', findings: ['Invalid configuration'] };
    }

    const config = await this.configService.get(configName);
    // Simulate scanning
    await new Promise((resolve) => setTimeout(resolve, 20));

    return {
      status: 'complete',
      findings: [`Scanned target: ${(config as { target: string }).target}`],
    };
  }
}

describe('Integration: ConfigService and VulnerabilityScanner', () => {
  let configService: ConfigService;
  let scanner: VulnerabilityScanner;

  beforeAll(() => {
    // Setup shared resources before all tests
    configService = new ConfigService();
    scanner = new VulnerabilityScanner(configService);
  });

  afterAll(() => {
    // Cleanup after all tests
    configService.clear();
  });

  describe('when config is valid', () => {
    it('should successfully scan the target', async () => {
      // Arrange
      await configService.load('test-config', {
        target: 'https://example.com',
        auth: { type: 'none' },
      });

      // Act
      const result = await scanner.scan('test-config');

      // Assert
      expect(result.status).toBe('complete');
      expect(result.findings).toContain('Scanned target: https://example.com');
    });

    it('should validate config before scanning', async () => {
      // Arrange
      await configService.load('another-config', {
        target: 'https://another.example.com',
      });

      // Act
      const isValid = await configService.validate('another-config');
      const result = await scanner.scan('another-config');

      // Assert
      expect(isValid).toBe(true);
      expect(result.status).toBe('complete');
    });
  });

  describe('when config is invalid or missing', () => {
    it('should return error for missing config', async () => {
      // Act
      const result = await scanner.scan('nonexistent-config');

      // Assert
      expect(result.status).toBe('error');
      expect(result.findings).toContain('Invalid configuration');
    });

    it('should fail validation for config without target', async () => {
      // Arrange
      await configService.load('invalid-config', {
        auth: { type: 'basic' },
        // Missing 'target' field
      });

      // Act
      const isValid = await configService.validate('invalid-config');

      // Assert
      expect(isValid).toBe(false);
    });
  });
});
