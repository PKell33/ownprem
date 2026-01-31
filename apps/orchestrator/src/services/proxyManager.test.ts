/**
 * ProxyManager Tests
 *
 * Tests for proxy route management including:
 * - Web UI route registration/unregistration
 * - Route conflict detection
 * - Service route management
 * - Route activation/deactivation
 * - Caddy config integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create test database
let db: Database.Database;

// Track Caddy API calls
let caddyApiCalls: Array<{ url: string; config: unknown }> = [];
let caddyPushResult = true;

// Mock modules before importing
vi.mock('../db/index.js', () => ({
  getDb: () => db,
  runInTransaction: (fn: () => void) => fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    port: 3001,
    caddy: {
      domain: 'test.local',
      adminUrl: 'http://localhost:2019',
    },
  },
}));

vi.mock('./proxy/caddyConfig.js', () => ({
  createCaddyState: () => ({
    consecutiveFailures: 0,
    hasLastGoodConfig: false,
    isCircuitOpen: false,
    circuitOpenedAt: null,
    nextRecoveryAttempt: null,
  }),
  generateCaddyJsonConfig: vi.fn(async (routes, serviceRoutes, apiPort, domain) => ({
    routes,
    serviceRoutes,
    apiPort,
    domain,
  })),
  pushConfigToCaddy: vi.fn(async (config, adminUrl, state) => {
    caddyApiCalls.push({ url: adminUrl, config });
    return caddyPushResult;
  }),
  resetCaddyState: vi.fn(),
  getCaddyStatus: vi.fn(() => ({
    consecutiveFailures: 0,
    hasLastGoodConfig: false,
    isCircuitOpen: false,
    circuitOpenedAt: null,
    nextRecoveryAttempt: null,
  })),
  generateDevCaddyfile: vi.fn(() => '# Dev Caddyfile'),
}));

vi.mock('../lib/debounce.js', () => ({
  createFireAndForgetDebounce: (fn: () => void) => fn,
}));

// Import after mocking
const { ProxyManager } = await import('./proxyManager.js');
const { RouteConflictError } = await import('./proxy/webUiRoutes.js');

describe('ProxyManager', () => {
  let proxyManager: InstanceType<typeof ProxyManager>;

  beforeAll(() => {
    // Create in-memory database with schema
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // Clear tables in correct order (respect foreign key constraints)
    db.exec('DELETE FROM proxy_routes');
    db.exec('DELETE FROM service_routes');
    db.exec('DELETE FROM services');
    db.exec('DELETE FROM deployments');
    db.exec('DELETE FROM servers');
    db.exec('DELETE FROM app_registry');
    db.exec('DELETE FROM groups');

    // Insert test server
    db.prepare(`
      INSERT INTO servers (id, name, host, is_core, agent_status)
      VALUES ('server-1', 'Test Server', '192.168.1.100', 0, 'online')
    `).run();

    // Insert test app in registry (required foreign key for deployments)
    db.prepare(`
      INSERT INTO app_registry (name, manifest)
      VALUES ('test-app', '${JSON.stringify({
        name: 'test-app',
        displayName: 'Test App',
        version: '1.0.0',
        category: 'web',
        description: 'A test app',
        configSchema: [],
      })}')
    `).run();

    // Insert another app for conflict tests
    db.prepare(`
      INSERT INTO app_registry (name, manifest)
      VALUES ('other-app', '${JSON.stringify({
        name: 'other-app',
        displayName: 'Other App',
        version: '1.0.0',
        category: 'web',
        description: 'Another test app',
        configSchema: [],
      })}')
    `).run();

    // Insert default group (required foreign key for deployments)
    db.prepare(`
      INSERT INTO groups (id, name)
      VALUES ('default', 'Default Group')
    `).run();

    // Insert test deployment
    db.prepare(`
      INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status)
      VALUES ('deploy-1', 'server-1', 'test-app', 'default', '1.0.0', '{}', 'running')
    `).run();

    // Reset mocks
    caddyApiCalls = [];
    caddyPushResult = true;
    vi.clearAllMocks();

    // Create fresh proxy manager
    proxyManager = new ProxyManager(3001, 'test.local', 'http://localhost:2019');
  });

  describe('registerRoute', () => {
    it('should register a web UI route with valid manifest', async () => {
      const manifest = {
        name: 'test-app',
        displayName: 'Test App',
        version: '1.0.0',
        category: 'web',
        description: 'A test app',
        configSchema: [],
        webui: {
          enabled: true,
          basePath: '/apps/test-app',
          port: 8080,
        },
      };

      await proxyManager.registerRoute('deploy-1', manifest as any, '192.168.1.100');

      // Verify route was created in database
      const route = db.prepare('SELECT * FROM proxy_routes WHERE deployment_id = ?').get('deploy-1') as any;
      expect(route).toBeDefined();
      expect(route.path).toBe('/apps/test-app');
      expect(route.upstream).toBe('http://192.168.1.100:8080');
      expect(route.active).toBe(0); // Routes start inactive
    });

    it('should not register route when webui is disabled', async () => {
      const manifest = {
        name: 'test-app',
        displayName: 'Test App',
        version: '1.0.0',
        category: 'cli',
        description: 'A CLI app',
        configSchema: [],
        webui: {
          enabled: false,
        },
      };

      await proxyManager.registerRoute('deploy-1', manifest as any, '192.168.1.100');

      const route = db.prepare('SELECT * FROM proxy_routes WHERE deployment_id = ?').get('deploy-1');
      expect(route).toBeUndefined();
    });

    it('should reject duplicate route for different deployment', async () => {
      // Create another deployment
      db.prepare(`
        INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status)
        VALUES ('deploy-2', 'server-1', 'other-app', 'default', '1.0.0', '{}', 'running')
      `).run();

      const manifest = {
        name: 'test-app',
        displayName: 'Test App',
        version: '1.0.0',
        category: 'web',
        description: 'A test app',
        configSchema: [],
        webui: {
          enabled: true,
          basePath: '/apps/test-app',
          port: 8080,
        },
      };

      // Register first route
      await proxyManager.registerRoute('deploy-1', manifest as any, '192.168.1.100');

      // Try to register same path for different deployment
      const manifest2 = {
        ...manifest,
        name: 'other-app',
      };

      await expect(
        proxyManager.registerRoute('deploy-2', manifest2 as any, '192.168.1.100')
      ).rejects.toThrow(RouteConflictError);
    });

    it('should allow same deployment to update its own route', async () => {
      const manifest = {
        name: 'test-app',
        displayName: 'Test App',
        version: '1.0.0',
        category: 'web',
        description: 'A test app',
        configSchema: [],
        webui: {
          enabled: true,
          basePath: '/apps/test-app',
          port: 8080,
        },
      };

      // Register first time
      await proxyManager.registerRoute('deploy-1', manifest as any, '192.168.1.100');

      // Update with different port
      const updatedManifest = {
        ...manifest,
        webui: { enabled: true, basePath: '/apps/test-app', port: 9090 },
      };
      await proxyManager.registerRoute('deploy-1', updatedManifest as any, '192.168.1.100');

      const routes = db.prepare('SELECT * FROM proxy_routes WHERE deployment_id = ?').all('deploy-1');
      expect(routes).toHaveLength(1);
      expect((routes[0] as any).upstream).toBe('http://192.168.1.100:9090');
    });
  });

  describe('unregisterRoute', () => {
    it('should remove route from database', async () => {
      // Create a route
      db.prepare(`
        INSERT INTO proxy_routes (id, deployment_id, path, upstream, active)
        VALUES ('route-1', 'deploy-1', '/apps/test-app', 'http://192.168.1.100:8080', 1)
      `).run();

      await proxyManager.unregisterRoute('deploy-1');

      const route = db.prepare('SELECT * FROM proxy_routes WHERE deployment_id = ?').get('deploy-1');
      expect(route).toBeUndefined();
    });

    it('should succeed even if no route exists', async () => {
      // Should not throw
      await expect(proxyManager.unregisterRoute('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('setRouteActive', () => {
    it('should activate route', async () => {
      db.prepare(`
        INSERT INTO proxy_routes (id, deployment_id, path, upstream, active)
        VALUES ('route-1', 'deploy-1', '/apps/test-app', 'http://192.168.1.100:8080', 0)
      `).run();

      await proxyManager.setRouteActive('deploy-1', true);

      const route = db.prepare('SELECT * FROM proxy_routes WHERE deployment_id = ?').get('deploy-1') as any;
      expect(route.active).toBe(1);
    });

    it('should deactivate route', async () => {
      db.prepare(`
        INSERT INTO proxy_routes (id, deployment_id, path, upstream, active)
        VALUES ('route-1', 'deploy-1', '/apps/test-app', 'http://192.168.1.100:8080', 1)
      `).run();

      await proxyManager.setRouteActive('deploy-1', false);

      const route = db.prepare('SELECT * FROM proxy_routes WHERE deployment_id = ?').get('deploy-1') as any;
      expect(route.active).toBe(0);
    });
  });

  describe('getActiveRoutes', () => {
    it('should return only active routes', async () => {
      // Create active route
      db.prepare(`
        INSERT INTO proxy_routes (id, deployment_id, path, upstream, active)
        VALUES ('route-1', 'deploy-1', '/apps/test-app', 'http://192.168.1.100:8080', 1)
      `).run();

      // Create another deployment with inactive route
      db.prepare(`
        INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status)
        VALUES ('deploy-2', 'server-1', 'other-app', 'default', '1.0.0', '{}', 'stopped')
      `).run();
      db.prepare(`
        INSERT INTO proxy_routes (id, deployment_id, path, upstream, active)
        VALUES ('route-2', 'deploy-2', '/apps/other-app', 'http://192.168.1.100:9090', 0)
      `).run();

      const routes = await proxyManager.getActiveRoutes();
      expect(routes).toHaveLength(1);
      expect(routes[0].path).toBe('/apps/test-app');
      expect(routes[0].appName).toBe('test-app');
    });
  });

  describe('updateAndReload', () => {
    it('should push config to Caddy when successful', async () => {
      caddyPushResult = true;

      const result = await proxyManager.updateAndReload();

      expect(result).toBe(true);
      expect(caddyApiCalls).toHaveLength(1);
      expect(caddyApiCalls[0].url).toBe('http://localhost:2019');
    });

    it('should return false when Caddy push fails', async () => {
      caddyPushResult = false;

      const result = await proxyManager.updateAndReload();

      expect(result).toBe(false);
    });
  });

  describe('Service Routes', () => {
    beforeEach(() => {
      // Create a service for testing
      db.prepare(`
        INSERT INTO services (id, deployment_id, service_name, server_id, host, port)
        VALUES ('svc-1', 'deploy-1', 'postgres', 'server-1', '192.168.1.100', 5432)
      `).run();
    });

    it('should register service route', async () => {
      const serviceDef = {
        name: 'postgres',
        port: 5432,
        protocol: 'tcp' as const,
      };

      const route = await proxyManager.registerServiceRoute(
        'svc-1',
        'postgres',
        serviceDef,
        '192.168.1.100',
        5432
      );

      expect(route).toBeDefined();
      expect(route.serviceName).toBe('postgres');
      expect(route.upstreamHost).toBe('192.168.1.100');
      expect(route.upstreamPort).toBe(5432);
    });

    it('should unregister service routes by deployment', async () => {
      // Insert a service route (service_routes uses service_id FK, not direct deployment_id)
      db.prepare(`
        INSERT INTO service_routes (id, service_id, route_type, upstream_host, upstream_port, external_port, active)
        VALUES ('sroute-1', 'svc-1', 'tcp', '192.168.1.100', 5432, 15432, 1)
      `).run();

      await proxyManager.unregisterServiceRoutesByDeployment('deploy-1');

      // Query through service_id since service_routes doesn't have deployment_id directly
      const routes = db.prepare('SELECT * FROM service_routes WHERE service_id = ?').all('svc-1');
      expect(routes).toHaveLength(0);
    });

    it('should set service routes active by deployment', async () => {
      db.prepare(`
        INSERT INTO service_routes (id, service_id, route_type, upstream_host, upstream_port, external_port, active)
        VALUES ('sroute-1', 'svc-1', 'tcp', '192.168.1.100', 5432, 15432, 0)
      `).run();

      await proxyManager.setServiceRoutesActiveByDeployment('deploy-1', true);

      // Query through service_id since service_routes doesn't have deployment_id directly
      const route = db.prepare('SELECT * FROM service_routes WHERE service_id = ?').get('svc-1') as any;
      expect(route.active).toBe(1);
    });
  });

  describe('External URL Generation', () => {
    it('should generate HTTPS URL for HTTP routes', () => {
      const serviceRoute = {
        id: 'route-1',
        serviceId: 'svc-1',
        serviceName: 'api',
        deploymentId: 'deploy-1',
        routeType: 'http' as const,
        upstreamHost: '192.168.1.100',
        upstreamPort: 8080,
        externalPath: '/services/api',
        externalPort: null,
        active: true,
      };

      const url = proxyManager.getExternalUrl(serviceRoute);
      expect(url).toBe('https://test.local/services/api');
    });

    it('should generate TCP URL for TCP routes', () => {
      const serviceRoute = {
        id: 'route-1',
        serviceId: 'svc-1',
        serviceName: 'postgres',
        deploymentId: 'deploy-1',
        routeType: 'tcp' as const,
        upstreamHost: '192.168.1.100',
        upstreamPort: 5432,
        externalPath: null,
        externalPort: 15432,
        active: true,
      };

      const url = proxyManager.getExternalUrl(serviceRoute);
      expect(url).toBe('test.local:15432');
    });
  });
});
