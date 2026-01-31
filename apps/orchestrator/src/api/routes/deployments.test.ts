/**
 * Deployment API Route Tests
 *
 * Integration tests for deployment REST endpoints:
 * - POST /api/deployments - Create deployment
 * - GET /api/deployments - List deployments
 * - GET /api/deployments/:id - Get single deployment
 * - POST /api/deployments/:id/start - Start deployment
 * - POST /api/deployments/:id/stop - Stop deployment
 * - DELETE /api/deployments/:id - Uninstall deployment
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create test database
let db: Database.Database;

// Mock deployer service
const mockDeployer = {
  install: vi.fn(),
  uninstall: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  configure: vi.fn(),
  getDeployment: vi.fn(),
  listDeployments: vi.fn(),
};

// Mock serviceRegistry
const mockServiceRegistry = {
  getServicesByDeployment: vi.fn().mockResolvedValue([]),
};

// Mock dependency resolver
const mockDependencyResolver = {
  validate: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
  getServiceProviders: vi.fn().mockResolvedValue([]),
};

// Mock requestLogs
const mockRequestLogs = vi.fn().mockResolvedValue({
  logs: 'test logs',
  source: 'journald',
  hasMore: false,
  status: 'success',
});

// Mock modules before imports
vi.mock('../../db/index.js', () => ({
  getDb: () => db,
  initDb: () => {},
  closeDb: () => {},
}));

vi.mock('../../config.js', () => ({
  config: {
    port: 3001,
    nodeEnv: 'test',
    isDevelopment: true,
    database: { path: ':memory:' },
    paths: {
      data: '/tmp/test-data',
      apps: '/tmp/test-apps',
      appDefinitions: join(__dirname, '../../../../app-definitions'),
      logs: '/tmp/test-logs',
      backups: '/tmp/test-backups',
      caddyConfig: '/tmp/test-caddy/Caddyfile',
    },
    caddy: {
      domain: 'test.local',
      reloadCommand: '',
      devUiPort: 5173,
    },
    secrets: { key: 'test-secrets-key-32-characters!!' },
    jwt: {
      secret: 'test-jwt-secret-for-testing-purposes',
      isEphemeral: false,
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
    },
    cookies: {
      secure: false,
      sameSite: 'strict',
      httpOnly: true,
      accessTokenMaxAge: 15 * 60 * 1000,
      refreshTokenMaxAge: 7 * 24 * 60 * 60 * 1000,
      refreshTokenPath: '/api/auth',
    },
    security: {
      bcryptRounds: 4,
      rateLimitWindow: 15 * 60 * 1000,
      rateLimitMax: 100,
      authRateLimitMax: 10,
      loginLockoutWindow: 60 * 60 * 1000,
      loginLockoutMax: 5,
    },
    csp: {
      additionalConnectSrc: [],
      reportOnly: false,
      reportUri: null,
    },
    cors: { origin: '*' },
    devMode: {
      bypassAuth: false,
      productionIndicators: [],
    },
  },
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  child: () => mockLogger,
};

vi.mock('../../lib/logger.js', () => ({
  default: mockLogger,
  logger: mockLogger,
  apiLogger: mockLogger,
  wsLogger: mockLogger,
  dbLogger: mockLogger,
  deployerLogger: mockLogger,
  authLogger: mockLogger,
  createRequestLogger: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../services/deployer.js', () => ({
  deployer: mockDeployer,
}));

vi.mock('../../services/serviceRegistry.js', () => ({
  serviceRegistry: mockServiceRegistry,
}));

vi.mock('../../services/dependencyResolver.js', () => ({
  dependencyResolver: mockDependencyResolver,
}));

vi.mock('../../websocket/agentHandler.js', () => ({
  requestLogs: mockRequestLogs,
  sendCommand: vi.fn(),
  sendCommandAndWait: vi.fn(),
}));

// Import after mocks
const { createApi } = await import('../index.js');
const { authService } = await import('../../services/authService.js');
const { csrfService } = await import('../../services/csrfService.js');

describe('Deployment API Endpoints', () => {
  let app: ReturnType<typeof createApi>;
  let authToken: string;
  let csrfToken: string;
  let testUserId: string;

  // Test data - using valid UUIDs for deployment IDs
  const testDeploymentId = '550e8400-e29b-41d4-a716-446655440001';
  const mandatoryDeploymentId = '550e8400-e29b-41d4-a716-446655440002';

  const testManifest = {
    name: 'test-app',
    displayName: 'Test App',
    version: '1.0.0',
    category: 'web',
    description: 'A test application',
    configSchema: [],
  };

  const testDeployment = {
    id: testDeploymentId,
    serverId: 'core',
    appName: 'test-app',
    groupId: 'default',
    version: '1.0.0',
    config: {},
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Load schema
    const schemaPath = join(__dirname, '../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create test app
    app = createApi();

    // Create test user and get token
    testUserId = await authService.createUser('testadmin', 'testpassword', true);
    const user = await authService.validateCredentials('testadmin', 'testpassword');
    const tokens = authService.generateTokens(user!);
    authToken = tokens.accessToken;
    csrfToken = csrfService.generateToken(testUserId);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // Clear test data
    db.exec('DELETE FROM deployments');
    db.exec('DELETE FROM app_registry WHERE name != \'internal-test\'');

    // Insert test app
    db.prepare(`
      INSERT INTO app_registry (name, manifest)
      VALUES ('test-app', ?)
    `).run(JSON.stringify(testManifest));

    // Reset mocks - clearAllMocks only clears call history, not implementations
    vi.clearAllMocks();

    // Reset all mock implementations to default
    mockDeployer.listDeployments.mockReset().mockResolvedValue([]);
    mockDeployer.getDeployment.mockReset().mockResolvedValue(null);
    mockDeployer.install.mockReset();
    mockDeployer.uninstall.mockReset();
    mockDeployer.start.mockReset();
    mockDeployer.stop.mockReset();
    mockDeployer.restart.mockReset();
    mockDeployer.configure.mockReset();
    mockServiceRegistry.getServicesByDeployment.mockReset().mockResolvedValue([]);
    mockDependencyResolver.validate.mockReset().mockResolvedValue({ valid: true, errors: [], warnings: [] });
    mockDependencyResolver.getServiceProviders.mockReset().mockResolvedValue([]);
    mockRequestLogs.mockReset();
  });

  describe('POST /api/deployments', () => {
    it('should create a deployment with valid data', async () => {
      const newDeployment = { ...testDeployment, status: 'installing' };
      mockDeployer.install.mockResolvedValue(newDeployment);

      const res = await request(app)
        .post('/api/deployments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          serverId: 'core',
          appName: 'test-app',
          config: {},
        });

      expect(res.status).toBe(201);
      expect(res.body.appName).toBe('test-app');
      expect(mockDeployer.install).toHaveBeenCalledWith(
        'core',
        'test-app',
        {},
        undefined,
        undefined,
        undefined
      );
    });

    it('should reject deployment for unknown app', async () => {
      const res = await request(app)
        .post('/api/deployments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          serverId: 'core',
          appName: 'unknown-app',
          config: {},
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('APP_NOT_FOUND');
    });

    it('should reject deployment without authentication', async () => {
      const res = await request(app)
        .post('/api/deployments')
        .set('X-CSRF-Token', csrfToken)
        .send({
          serverId: 'core',
          appName: 'test-app',
          config: {},
        });

      expect(res.status).toBe(401);
    });

    it('should reject deployment without CSRF token', async () => {
      const res = await request(app)
        .post('/api/deployments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          serverId: 'core',
          appName: 'test-app',
          config: {},
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MISSING_CSRF_TOKEN');
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/deployments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should pass config validation errors from deployer', async () => {
      // Insert app with config schema
      const manifestWithSchema = {
        ...testManifest,
        name: 'schema-app',
        configSchema: [
          { name: 'port', type: 'number', required: true },
        ],
      };
      db.prepare(`
        INSERT INTO app_registry (name, manifest)
        VALUES ('schema-app', ?)
      `).run(JSON.stringify(manifestWithSchema));

      const res = await request(app)
        .post('/api/deployments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          serverId: 'core',
          appName: 'schema-app',
          config: { port: 'not-a-number' },
        });

      // CONFIG_VALIDATION_ERROR returns 400 per ErrorStatusCodes mapping
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CONFIG_VALIDATION_ERROR');
    });
  });

  describe('GET /api/deployments', () => {
    it('should list all deployments', async () => {
      mockDeployer.listDeployments.mockResolvedValue([testDeployment]);

      const res = await request(app)
        .get('/api/deployments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].appName).toBe('test-app');
    });

    it('should filter deployments by serverId', async () => {
      mockDeployer.listDeployments.mockResolvedValue([testDeployment]);

      const res = await request(app)
        .get('/api/deployments?serverId=core')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(mockDeployer.listDeployments).toHaveBeenCalledWith('core');
    });

    it('should return empty array when no deployments', async () => {
      mockDeployer.listDeployments.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/deployments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/deployments');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/deployments/:id', () => {
    it('should return deployment details', async () => {
      mockDeployer.getDeployment.mockResolvedValue(testDeployment);
      mockServiceRegistry.getServicesByDeployment.mockResolvedValue([
        { id: 'svc-1', serviceName: 'http', port: 8080 },
      ]);

      const res = await request(app)
        .get(`/api/deployments/${testDeploymentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testDeploymentId);
      expect(res.body.appName).toBe('test-app');
      expect(res.body.services).toBeDefined();
      expect(res.body.services).toHaveLength(1);
    });

    it('should return 404 for unknown deployment', async () => {
      mockDeployer.getDeployment.mockResolvedValue(null);

      const unknownUuid = '550e8400-e29b-41d4-a716-446655440099';
      const res = await request(app)
        .get(`/api/deployments/${unknownUuid}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DEPLOYMENT_NOT_FOUND');
    });

    it('should require authentication', async () => {
      const res = await request(app).get(`/api/deployments/${testDeploymentId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/deployments/:id/start', () => {
    it('should start a stopped deployment', async () => {
      const stoppedDeployment = { ...testDeployment, status: 'stopped' };
      const startedDeployment = { ...testDeployment, status: 'running' };
      mockDeployer.getDeployment.mockResolvedValue(stoppedDeployment);
      mockDeployer.start.mockResolvedValue(startedDeployment);

      const res = await request(app)
        .post(`/api/deployments/${testDeploymentId}/start`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('running');
      expect(mockDeployer.start).toHaveBeenCalledWith(testDeploymentId);
    });

    it('should return 404 for unknown deployment', async () => {
      // Import Errors for creating the proper error
      const { Errors } = await import('../middleware/error.js');
      mockDeployer.start.mockRejectedValue(Errors.deploymentNotFound('unknown'));

      const unknownUuid = '550e8400-e29b-41d4-a716-446655440099';
      const res = await request(app)
        .post(`/api/deployments/${unknownUuid}/start`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DEPLOYMENT_NOT_FOUND');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/deployments/${testDeploymentId}/start`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(401);
    });

    it('should require CSRF token', async () => {
      const res = await request(app)
        .post(`/api/deployments/${testDeploymentId}/start`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/deployments/:id/stop', () => {
    it('should stop a running deployment', async () => {
      const runningDeployment = { ...testDeployment, status: 'running' };
      const stoppedDeployment = { ...testDeployment, status: 'stopped' };
      mockDeployer.getDeployment.mockResolvedValue(runningDeployment);
      mockDeployer.stop.mockResolvedValue(stoppedDeployment);

      const res = await request(app)
        .post(`/api/deployments/${testDeploymentId}/stop`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('stopped');
      expect(mockDeployer.stop).toHaveBeenCalledWith(testDeploymentId);
    });

    it('should reject stopping mandatory app', async () => {
      const mandatoryManifest = {
        ...testManifest,
        name: 'mandatory-app',
        mandatory: true,
      };
      db.prepare(`
        INSERT INTO app_registry (name, manifest)
        VALUES ('mandatory-app', ?)
      `).run(JSON.stringify(mandatoryManifest));

      const mandatoryDeployment = {
        ...testDeployment,
        id: mandatoryDeploymentId,
        appName: 'mandatory-app',
      };
      mockDeployer.getDeployment.mockResolvedValue(mandatoryDeployment);

      const res = await request(app)
        .post(`/api/deployments/${mandatoryDeploymentId}/stop`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('MANDATORY_APP');
    });

    it('should return 404 for unknown deployment', async () => {
      mockDeployer.getDeployment.mockResolvedValue(null);

      const unknownUuid = '550e8400-e29b-41d4-a716-446655440099';
      const res = await request(app)
        .post(`/api/deployments/${unknownUuid}/stop`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/deployments/:id/restart', () => {
    it('should restart a deployment', async () => {
      const runningDeployment = { ...testDeployment, status: 'running' };
      mockDeployer.getDeployment.mockResolvedValue(runningDeployment);
      mockDeployer.restart.mockResolvedValue(runningDeployment);

      const res = await request(app)
        .post(`/api/deployments/${testDeploymentId}/restart`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(mockDeployer.restart).toHaveBeenCalledWith(testDeploymentId);
    });

    it('should return 404 for unknown deployment', async () => {
      // Import Errors for creating the proper error
      const { Errors } = await import('../middleware/error.js');
      mockDeployer.restart.mockRejectedValue(Errors.deploymentNotFound('unknown'));

      const unknownUuid = '550e8400-e29b-41d4-a716-446655440099';
      const res = await request(app)
        .post(`/api/deployments/${unknownUuid}/restart`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DEPLOYMENT_NOT_FOUND');
    });
  });

  describe('DELETE /api/deployments/:id', () => {
    it('should uninstall a deployment', async () => {
      mockDeployer.getDeployment.mockResolvedValue(testDeployment);
      mockDeployer.uninstall.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/deployments/${testDeploymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(204);
      expect(mockDeployer.uninstall).toHaveBeenCalledWith(testDeploymentId);
    });

    it('should reject uninstalling mandatory app', async () => {
      const mandatoryManifest = {
        ...testManifest,
        name: 'mandatory-app',
        mandatory: true,
      };
      db.prepare(`
        INSERT OR REPLACE INTO app_registry (name, manifest)
        VALUES ('mandatory-app', ?)
      `).run(JSON.stringify(mandatoryManifest));

      const mandatoryDeployment = {
        ...testDeployment,
        id: mandatoryDeploymentId,
        appName: 'mandatory-app',
      };
      mockDeployer.getDeployment.mockResolvedValue(mandatoryDeployment);

      const res = await request(app)
        .delete(`/api/deployments/${mandatoryDeploymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('MANDATORY_APP');
    });

    it('should return 404 for unknown deployment', async () => {
      mockDeployer.getDeployment.mockResolvedValue(null);

      const unknownUuid = '550e8400-e29b-41d4-a716-446655440099';
      const res = await request(app)
        .delete(`/api/deployments/${unknownUuid}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .delete(`/api/deployments/${testDeploymentId}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(401);
    });

    it('should require CSRF token', async () => {
      const res = await request(app)
        .delete(`/api/deployments/${testDeploymentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/deployments/:id', () => {
    it('should update deployment config', async () => {
      const updatedDeployment = { ...testDeployment, config: { newKey: 'newValue' } };
      mockDeployer.getDeployment.mockResolvedValue(testDeployment);
      mockDeployer.configure.mockResolvedValue(updatedDeployment);

      const res = await request(app)
        .put(`/api/deployments/${testDeploymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ config: { newKey: 'newValue' } });

      expect(res.status).toBe(200);
      expect(mockDeployer.configure).toHaveBeenCalledWith(testDeploymentId, { newKey: 'newValue' });
    });

    it('should reject update without config', async () => {
      mockDeployer.getDeployment.mockResolvedValue(testDeployment);

      const res = await request(app)
        .put(`/api/deployments/${testDeploymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 for unknown deployment', async () => {
      mockDeployer.getDeployment.mockResolvedValue(null);

      const unknownUuid = '550e8400-e29b-41d4-a716-446655440099';
      const res = await request(app)
        .put(`/api/deployments/${unknownUuid}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ config: {} });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/deployments/:id/logs', () => {
    it('should return deployment logs', async () => {
      mockDeployer.getDeployment.mockResolvedValue(testDeployment);
      mockRequestLogs.mockResolvedValue({
        logs: 'line 1\nline 2',
        source: 'journald',
        hasMore: false,
        status: 'success',
      });

      const res = await request(app)
        .get(`/api/deployments/${testDeploymentId}/logs`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toBe('line 1\nline 2');
      expect(res.body.source).toBe('journald');
      expect(mockRequestLogs).toHaveBeenCalledWith(
        'core',
        'test-app',
        expect.objectContaining({ lines: 100 })
      );
    });

    it('should support log query parameters', async () => {
      mockDeployer.getDeployment.mockResolvedValue(testDeployment);
      mockRequestLogs.mockResolvedValue({
        logs: 'filtered line',
        source: 'journald',
        hasMore: true,
        status: 'success',
      });

      const res = await request(app)
        .get(`/api/deployments/${testDeploymentId}/logs?lines=50&grep=error`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(mockRequestLogs).toHaveBeenCalledWith(
        'core',
        'test-app',
        expect.objectContaining({
          lines: 50,
          grep: 'error',
        })
      );
    });

    it('should return 404 for unknown deployment', async () => {
      mockDeployer.getDeployment.mockResolvedValue(null);

      const unknownUuid = '550e8400-e29b-41d4-a716-446655440099';
      const res = await request(app)
        .get(`/api/deployments/${unknownUuid}/logs`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/deployments/validate', () => {
    it('should validate deployment before install', async () => {
      mockDependencyResolver.validate.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: ['Optional dependency not installed'],
      });

      const res = await request(app)
        .post('/api/deployments/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          serverId: 'core',
          appName: 'test-app',
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.warnings).toContain('Optional dependency not installed');
    });

    it('should return validation errors', async () => {
      mockDependencyResolver.validate.mockResolvedValue({
        valid: false,
        errors: ['Missing required dependency: postgres'],
        warnings: [],
      });

      const res = await request(app)
        .post('/api/deployments/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          serverId: 'core',
          appName: 'test-app',
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.errors).toContain('Missing required dependency: postgres');
    });

    it('should return 404 for unknown app', async () => {
      const res = await request(app)
        .post('/api/deployments/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          serverId: 'core',
          appName: 'unknown-app',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('APP_NOT_FOUND');
    });
  });
});
