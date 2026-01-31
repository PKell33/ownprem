/**
 * ServiceRegistry Tests
 *
 * Tests for service registration and discovery:
 * - Service registration with deployment binding
 * - Multiple instances of same service type
 * - Locality preference in service discovery
 * - Unknown service handling
 * - Service status management
 * - Service unregistration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create test database
let db: Database.Database;

// Mock database module
vi.mock('../db/index.js', () => ({
  getDb: () => db,
  runInTransaction: (fn: () => void) => fn(),
}));

// Import after mocking
const { ServiceRegistry } = await import('./serviceRegistry.js');

describe('ServiceRegistry', () => {
  let serviceRegistry: InstanceType<typeof ServiceRegistry>;

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
    // Clear tables in correct order
    db.exec('DELETE FROM services');
    db.exec('DELETE FROM deployments');
    db.exec('DELETE FROM servers');
    db.exec('DELETE FROM app_registry');
    db.exec('DELETE FROM groups');

    // Set up test servers
    db.prepare(`
      INSERT INTO servers (id, name, host, is_core, agent_status)
      VALUES ('server-1', 'Server 1', '192.168.1.100', 0, 'online')
    `).run();

    db.prepare(`
      INSERT INTO servers (id, name, host, is_core, agent_status)
      VALUES ('server-2', 'Server 2', '192.168.1.101', 0, 'online')
    `).run();

    db.prepare(`
      INSERT INTO servers (id, name, host, is_core, agent_status)
      VALUES ('core', 'Core Server', NULL, 1, 'online')
    `).run();

    // Set up test app
    db.prepare(`
      INSERT INTO app_registry (name, manifest)
      VALUES ('postgres', '{"name":"postgres","displayName":"PostgreSQL","version":"15","category":"database","description":"Database","configSchema":[]}')
    `).run();

    // Set up default group
    db.prepare(`
      INSERT INTO groups (id, name)
      VALUES ('default', 'Default Group')
    `).run();

    // Set up test deployment
    db.prepare(`
      INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status)
      VALUES ('deploy-1', 'server-1', 'postgres', 'default', '15', '{}', 'running')
    `).run();

    // Create fresh registry
    serviceRegistry = new ServiceRegistry();
  });

  describe('registerService', () => {
    it('should register service with deployment binding', async () => {
      const service = await serviceRegistry.registerService(
        'deploy-1',
        'postgres',
        'server-1',
        5432
      );

      expect(service).toBeDefined();
      expect(service.deploymentId).toBe('deploy-1');
      expect(service.serviceName).toBe('postgres');
      expect(service.serverId).toBe('server-1');
      expect(service.port).toBe(5432);
      expect(service.status).toBe('available');
    });

    it('should use localhost for core server', async () => {
      // Create deployment on core server
      db.prepare(`
        INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status)
        VALUES ('deploy-core', 'core', 'postgres', 'default', '15', '{}', 'running')
      `).run();

      const service = await serviceRegistry.registerService(
        'deploy-core',
        'postgres',
        'core',
        5432
      );

      expect(service.host).toBe('127.0.0.1');
    });

    it('should update existing service on conflict', async () => {
      // Register first time
      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);

      // Register again with different port
      const service = await serviceRegistry.registerService(
        'deploy-1',
        'postgres',
        'server-1',
        5433
      );

      expect(service.port).toBe(5433);

      // Should only have one service
      const services = await serviceRegistry.getServicesByDeployment('deploy-1');
      expect(services).toHaveLength(1);
    });

    it('should throw error for unknown server', async () => {
      await expect(
        serviceRegistry.registerService('deploy-1', 'postgres', 'unknown-server', 5432)
      ).rejects.toThrow('Server unknown-server not found');
    });
  });

  describe('findService', () => {
    beforeEach(async () => {
      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);
    });

    it('should find available service by name', async () => {
      const service = await serviceRegistry.findService('postgres');

      expect(service).not.toBeNull();
      expect(service?.serviceName).toBe('postgres');
      expect(service?.status).toBe('available');
    });

    it('should return null for unknown service', async () => {
      const service = await serviceRegistry.findService('unknown-service');
      expect(service).toBeNull();
    });

    it('should not find unavailable service', async () => {
      await serviceRegistry.setServiceStatus('deploy-1', 'postgres', 'unavailable');

      const service = await serviceRegistry.findService('postgres');
      expect(service).toBeNull();
    });
  });

  describe('findAllServices', () => {
    it('should find multiple instances of same service type', async () => {
      // Create second deployment on different server
      db.prepare(`
        INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status)
        VALUES ('deploy-2', 'server-2', 'postgres', 'default', '15', '{}', 'running')
      `).run();

      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);
      await serviceRegistry.registerService('deploy-2', 'postgres', 'server-2', 5432);

      const services = await serviceRegistry.findAllServices('postgres');

      expect(services).toHaveLength(2);
      expect(services.map(s => s.serverId).sort()).toEqual(['server-1', 'server-2']);
    });
  });

  describe('findServiceOnServer', () => {
    it('should find service on specific server', async () => {
      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);

      const service = await serviceRegistry.findServiceOnServer('postgres', 'server-1');

      expect(service).not.toBeNull();
      expect(service?.serverId).toBe('server-1');
    });

    it('should return null when service not on specified server', async () => {
      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);

      const service = await serviceRegistry.findServiceOnServer('postgres', 'server-2');
      expect(service).toBeNull();
    });
  });

  describe('getConnection', () => {
    it('should return connection with localhost when on same server', async () => {
      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);

      const conn = await serviceRegistry.getConnection('postgres', 'server-1');

      expect(conn).not.toBeNull();
      expect(conn?.host).toBe('127.0.0.1');
      expect(conn?.port).toBe(5432);
    });

    it('should return connection with actual host when on different server', async () => {
      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);

      const conn = await serviceRegistry.getConnection('postgres', 'server-2');

      expect(conn).not.toBeNull();
      expect(conn?.host).toBe('192.168.1.100');
      expect(conn?.port).toBe(5432);
    });

    it('should prefer same server when preferSameServer is true', async () => {
      // Create second deployment on different server
      db.prepare(`
        INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status)
        VALUES ('deploy-2', 'server-2', 'postgres', 'default', '15', '{}', 'running')
      `).run();

      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);
      await serviceRegistry.registerService('deploy-2', 'postgres', 'server-2', 5433);

      const conn = await serviceRegistry.getConnection('postgres', 'server-2', true);

      expect(conn).not.toBeNull();
      expect(conn?.host).toBe('127.0.0.1'); // Should use local
      expect(conn?.port).toBe(5433); // Should use server-2's port
    });

    it('should fall back to any server when preferSameServer fails', async () => {
      // Only register on server-1, not server-2
      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);

      const conn = await serviceRegistry.getConnection('postgres', 'server-2', true);

      expect(conn).not.toBeNull();
      expect(conn?.host).toBe('192.168.1.100'); // Falls back to server-1
      expect(conn?.port).toBe(5432);
    });

    it('should return null for unknown service', async () => {
      const conn = await serviceRegistry.getConnection('unknown', 'server-1');
      expect(conn).toBeNull();
    });
  });

  describe('unregisterServices', () => {
    it('should remove all services for deployment', async () => {
      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);
      await serviceRegistry.registerService('deploy-1', 'redis', 'server-1', 6379);

      // Register service needed for test (add redis to app_registry first)
      db.prepare(`
        INSERT INTO app_registry (name, manifest)
        VALUES ('redis', '{"name":"redis","displayName":"Redis","version":"7","category":"cache","description":"Cache","configSchema":[]}')
      `).run();

      await serviceRegistry.unregisterServices('deploy-1');

      const services = await serviceRegistry.getServicesByDeployment('deploy-1');
      expect(services).toHaveLength(0);
    });

    it('should not affect other deployments', async () => {
      // Create second deployment
      db.prepare(`
        INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status)
        VALUES ('deploy-2', 'server-2', 'postgres', 'default', '15', '{}', 'running')
      `).run();

      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);
      await serviceRegistry.registerService('deploy-2', 'postgres', 'server-2', 5433);

      await serviceRegistry.unregisterServices('deploy-1');

      const services = await serviceRegistry.listAllServices();
      expect(services).toHaveLength(1);
      expect(services[0].deploymentId).toBe('deploy-2');
    });
  });

  describe('setServiceStatus', () => {
    it('should update service status', async () => {
      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);

      await serviceRegistry.setServiceStatus('deploy-1', 'postgres', 'unavailable');

      const services = await serviceRegistry.getServicesByDeployment('deploy-1');
      expect(services[0].status).toBe('unavailable');
    });
  });

  describe('listAllServices', () => {
    it('should return all services', async () => {
      // Create second deployment
      db.prepare(`
        INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status)
        VALUES ('deploy-2', 'server-2', 'postgres', 'default', '15', '{}', 'running')
      `).run();

      await serviceRegistry.registerService('deploy-1', 'postgres', 'server-1', 5432);
      await serviceRegistry.registerService('deploy-2', 'postgres', 'server-2', 5433);

      const services = await serviceRegistry.listAllServices();

      expect(services).toHaveLength(2);
    });
  });
});
