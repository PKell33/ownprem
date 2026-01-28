import { Router } from 'express';
import { deployer } from '../../services/deployer.js';
import { dependencyResolver } from '../../services/dependencyResolver.js';
import { serviceRegistry } from '../../services/serviceRegistry.js';
import { getDb } from '../../db/index.js';
import { createError } from '../middleware/error.js';
import type { AppManifest } from '@nodefoundry/shared';

const router = Router();

interface AppRegistryRow {
  name: string;
  manifest: string;
}

// GET /api/deployments - List all deployments
router.get('/', async (req, res, next) => {
  try {
    const serverId = req.query.serverId as string | undefined;
    const deployments = await deployer.listDeployments(serverId);
    res.json(deployments);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments - Install an app
router.post('/', async (req, res, next) => {
  try {
    const { serverId, appName, config, version } = req.body;

    if (!serverId || typeof serverId !== 'string') {
      throw createError('serverId is required', 400, 'INVALID_SERVER_ID');
    }

    if (!appName || typeof appName !== 'string') {
      throw createError('appName is required', 400, 'INVALID_APP_NAME');
    }

    const deployment = await deployer.install(serverId, appName, config || {}, version);
    res.status(201).json(deployment);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/validate - Validate before install
router.post('/validate', async (req, res, next) => {
  try {
    const { serverId, appName } = req.body;

    if (!serverId || !appName) {
      throw createError('serverId and appName are required', 400, 'INVALID_REQUEST');
    }

    const db = getDb();
    const appRow = db.prepare('SELECT manifest FROM app_registry WHERE name = ?').get(appName) as AppRegistryRow | undefined;

    if (!appRow) {
      throw createError(`App ${appName} not found`, 404, 'APP_NOT_FOUND');
    }

    const manifest = JSON.parse(appRow.manifest) as AppManifest;
    const validation = await dependencyResolver.validate(manifest, serverId);

    // Get dependency info
    const dependencies = [];
    for (const req of manifest.requires || []) {
      const providers = await dependencyResolver.getServiceProviders(req.service);
      dependencies.push({
        service: req.service,
        optional: req.optional || false,
        locality: req.locality,
        providers,
        satisfied: providers.length > 0,
      });
    }

    res.json({
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      dependencies,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/deployments/:id - Get deployment details
router.get('/:id', async (req, res, next) => {
  try {
    const deployment = await deployer.getDeployment(req.params.id);

    if (!deployment) {
      throw createError('Deployment not found', 404, 'DEPLOYMENT_NOT_FOUND');
    }

    // Get services provided by this deployment
    const services = await serviceRegistry.getServicesByDeployment(deployment.id);

    res.json({
      ...deployment,
      services,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/deployments/:id - Update deployment config
router.put('/:id', async (req, res, next) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      throw createError('config object is required', 400, 'INVALID_CONFIG');
    }

    const deployment = await deployer.configure(req.params.id, config);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/:id/start - Start the app
router.post('/:id/start', async (req, res, next) => {
  try {
    const deployment = await deployer.start(req.params.id);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/:id/stop - Stop the app
router.post('/:id/stop', async (req, res, next) => {
  try {
    const deployment = await deployer.stop(req.params.id);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/:id/restart - Restart the app
router.post('/:id/restart', async (req, res, next) => {
  try {
    const deployment = await deployer.restart(req.params.id);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/deployments/:id - Uninstall the app
router.delete('/:id', async (req, res, next) => {
  try {
    await deployer.uninstall(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
