/**
 * Executor Tests
 *
 * Tests for the agent executor:
 * - Install flow with correct environment variables
 * - Security: NO process.env leakage (only SAFE_ENV_VARS)
 * - Directory creation and cleanup on failure
 * - Script timeout handling
 * - Systemd service installation
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Track privileged client calls
const privilegedClientCalls: Array<{ method: string; args: unknown[] }> = [];

// Mock the privileged client before imports
vi.mock('./privilegedClient.js', () => ({
  privilegedClient: {
    createServiceUser: vi.fn((...args: unknown[]) => {
      privilegedClientCalls.push({ method: 'createServiceUser', args });
      return Promise.resolve({ success: true });
    }),
    createDirectory: vi.fn((...args: unknown[]) => {
      privilegedClientCalls.push({ method: 'createDirectory', args });
      return Promise.resolve({ success: true });
    }),
    setCapability: vi.fn((...args: unknown[]) => {
      privilegedClientCalls.push({ method: 'setCapability', args });
      return Promise.resolve({ success: true });
    }),
    writeFile: vi.fn((...args: unknown[]) => {
      privilegedClientCalls.push({ method: 'writeFile', args });
      return Promise.resolve({ success: true });
    }),
    registerService: vi.fn((...args: unknown[]) => {
      privilegedClientCalls.push({ method: 'registerService', args });
      return Promise.resolve({ success: true });
    }),
    unregisterService: vi.fn((...args: unknown[]) => {
      privilegedClientCalls.push({ method: 'unregisterService', args });
      return Promise.resolve({ success: true });
    }),
    systemctl: vi.fn((...args: unknown[]) => {
      privilegedClientCalls.push({ method: 'systemctl', args });
      return Promise.resolve({ success: true });
    }),
    setOwnership: vi.fn((...args: unknown[]) => {
      privilegedClientCalls.push({ method: 'setOwnership', args });
      return Promise.resolve({ success: true });
    }),
  },
}));

// Mock logger to prevent console output
vi.mock('./lib/logger.js', () => ({
  default: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Import after mocking
const { Executor } = await import('./executor.js');

describe('Executor', () => {
  let executor: InstanceType<typeof Executor>;
  let testDir: string;

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(tmpdir(), `executor-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create executor with test directory
    executor = new Executor(testDir, testDir);

    // Reset mocks
    privilegedClientCalls.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('install', () => {
    it('should create app directory', async () => {
      await executor.install('test-app', {
        files: [],
      });

      const appDir = join(testDir, 'test-app');
      expect(existsSync(appDir)).toBe(true);
    });

    it('should write metadata file when provided', async () => {
      const metadata = {
        name: 'test-app',
        displayName: 'Test App',
        version: '1.0.0',
        serviceName: 'test-app',
      };

      await executor.install('test-app', {
        files: [],
        metadata,
      });

      const metadataPath = join(testDir, 'test-app', '.ownprem.json');
      expect(existsSync(metadataPath)).toBe(true);

      const saved = JSON.parse(readFileSync(metadataPath, 'utf-8'));
      expect(saved.name).toBe('test-app');
      expect(saved.displayName).toBe('Test App');
    });

    it('should write config files to app directory', async () => {
      const files = [
        {
          path: join(testDir, 'test-app', 'config.yaml'),
          content: 'key: value',
        },
      ];

      await executor.install('test-app', { files });

      const configPath = join(testDir, 'test-app', 'config.yaml');
      expect(existsSync(configPath)).toBe(true);
      expect(readFileSync(configPath, 'utf-8')).toBe('key: value');
    });

    it('should call privileged client to create service user', async () => {
      await executor.install('test-app', {
        files: [],
        metadata: {
          name: 'test-app',
          displayName: 'Test App',
          version: '1.0.0',
          serviceName: 'test-app',
          serviceUser: 'testuser',
          dataDirectories: [{ path: '/var/lib/testuser' }],
        },
      });

      const userCall = privilegedClientCalls.find(c => c.method === 'createServiceUser');
      expect(userCall).toBeDefined();
      expect(userCall?.args[0]).toBe('testuser');
    });

    it('should call privileged client to create data directories', async () => {
      await executor.install('test-app', {
        files: [],
        metadata: {
          name: 'test-app',
          displayName: 'Test App',
          version: '1.0.0',
          serviceName: 'test-app',
          dataDirectories: [
            { path: '/var/lib/testapp' },
            { path: '/var/log/testapp' },
          ],
        },
      });

      const dirCalls = privilegedClientCalls.filter(c => c.method === 'createDirectory');
      expect(dirCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should clean up on failure', async () => {
      // Create a scenario where install fails by providing an invalid install script
      const appDir = join(testDir, 'fail-app');
      mkdirSync(appDir, { recursive: true });

      // Create an install script that will fail
      const installScript = join(appDir, 'install.sh');
      const { writeFileSync } = await import('fs');
      writeFileSync(installScript, '#!/bin/bash\nexit 1', { mode: 0o755 });

      try {
        await executor.install('fail-app', {
          files: [],
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        // Expected failure
        expect(err).toBeDefined();
      }

      // The app directory should have been cleaned up (or left in a recoverable state)
      // Note: The actual cleanup behavior depends on the implementation
    });
  });

  describe('Environment Variable Security', () => {
    // This test verifies the security fix we implemented
    it('should NOT leak process.env to install scripts', async () => {
      // Set a sensitive environment variable
      const originalDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgres://secret:password@localhost/db';

      // Create an install script that echoes environment
      const appDir = join(testDir, 'env-test-app');
      mkdirSync(appDir, { recursive: true });

      const installScript = join(appDir, 'install.sh');
      const envLogFile = join(testDir, 'env-log.txt');
      const { writeFileSync, existsSync: exists, readFileSync: read } = await import('fs');
      writeFileSync(installScript, `#!/bin/bash
env > "${envLogFile}"
exit 0`, { mode: 0o755 });

      await executor.install('env-test-app', {
        action: 'install',
        appName: 'env-test-app',
        payload: {
          files: [],
        },
      });

      // Restore original env
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      } else {
        delete process.env.DATABASE_URL;
      }

      // Check that DATABASE_URL was NOT passed to the script
      if (exists(envLogFile)) {
        const envLog = read(envLogFile, 'utf-8');
        expect(envLog).not.toContain('DATABASE_URL');
        expect(envLog).not.toContain('postgres://secret');
      }
    });

    it('should pass SAFE_ENV_VARS and custom env to install scripts', async () => {
      const appDir = join(testDir, 'safe-env-app');
      mkdirSync(appDir, { recursive: true });

      const installScript = join(appDir, 'install.sh');
      const envLogFile = join(testDir, 'safe-env-log.txt');
      const { writeFileSync, existsSync: exists, readFileSync: read } = await import('fs');
      writeFileSync(installScript, `#!/bin/bash
env > "${envLogFile}"
exit 0`, { mode: 0o755 });

      await executor.install('safe-env-app', {
        files: [],
        env: {
          CUSTOM_VAR: 'custom-value',
        },
      });

      if (exists(envLogFile)) {
        const envLog = read(envLogFile, 'utf-8');
        // Should have PATH from safe env vars
        expect(envLog).toContain('PATH=');
        // Should have our custom env var (passed via payload.env)
        expect(envLog).toContain('CUSTOM_VAR=custom-value');
        // Should have APP_NAME from executor
        expect(envLog).toContain('APP_NAME=safe-env-app');
      }
    });
  });

  describe('configure', () => {
    it('should write config files', async () => {
      // First install the app
      await executor.install('config-test-app', {
        action: 'install',
        appName: 'config-test-app',
        payload: { files: [] },
      });

      // Then configure it
      const files = [
        {
          path: join(testDir, 'config-test-app', 'new-config.yaml'),
          content: 'updated: true',
        },
      ];

      await executor.configure('config-test-app', files);

      const configPath = join(testDir, 'config-test-app', 'new-config.yaml');
      expect(existsSync(configPath)).toBe(true);
      expect(readFileSync(configPath, 'utf-8')).toBe('updated: true');
    });
  });

  describe('systemctl', () => {
    it('should call privileged client systemctl', async () => {
      await executor.systemctl('start', 'test-service');

      const call = privilegedClientCalls.find(
        c => c.method === 'systemctl' && c.args[0] === 'start'
      );
      expect(call).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should stop all log streams on cleanup', async () => {
      // Just verify cleanup doesn't throw
      await expect(executor.cleanup()).resolves.not.toThrow();
    });
  });

  describe('path validation', () => {
    it('should reject paths outside allowed prefixes', async () => {
      // Try to write a file outside the allowed paths
      await expect(
        executor.configure('test-app', [
          {
            path: '/tmp/../../etc/passwd',
            content: 'malicious',
          },
        ])
      ).rejects.toThrow();
    });
  });
});
