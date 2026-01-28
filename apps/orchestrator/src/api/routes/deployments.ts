import { Router, Response, NextFunction } from 'express';
import { deployer } from '../../services/deployer.js';
import { dependencyResolver } from '../../services/dependencyResolver.js';
import { serviceRegistry } from '../../services/serviceRegistry.js';
import { getDb } from '../../db/index.js';
import { createError } from '../middleware/error.js';
import { validateBody, schemas } from '../middleware/validate.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { authService } from '../../services/authService.js';
import type { AppManifest } from '@nodefoundry/shared';

const router = Router();

// Helper: Check if user can manage (deploy, delete, configure)
function canManage(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  // System admins can do everything
  if (req.user.isSystemAdmin) {
    next();
    return;
  }
  // TODO: Check group-based admin permission for the deployment's group
  // For now, only system admins can manage
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin permission required' } });
}

// Helper: Check if user can operate (start, stop, restart)
function canOperate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  // System admins can do everything
  if (req.user.isSystemAdmin) {
    next();
    return;
  }
  // Check if user has operator or admin role in any group
  const highestRole = authService.getUserHighestRole(req.user.userId);
  if (highestRole === 'admin' || highestRole === 'operator') {
    next();
    return;
  }
  // TODO: Check group-based operator permission for the deployment's group
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Operator permission required' } });
}

interface AppRegistryRow {
  name: string;
  manifest: string;
}

// GET /api/deployments - List all deployments
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const serverId = req.query.serverId as string | undefined;
    const deployments = await deployer.listDeployments(serverId);
    // TODO: Filter deployments based on user's group memberships
    res.json(deployments);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments - Install an app (admin only)
router.post('/', requireAuth, canManage, validateBody(schemas.deployments.create), async (req, res, next) => {
  try {
    const { serverId, appName, config, version } = req.body;
    const deployment = await deployer.install(serverId, appName, config || {}, version);
    res.status(201).json(deployment);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/validate - Validate before install
router.post('/validate', requireAuth, validateBody(schemas.deployments.validate), async (req, res, next) => {
  try {
    const { serverId, appName } = req.body;

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
router.get('/:id', requireAuth, async (req, res, next) => {
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

// PUT /api/deployments/:id - Update deployment config (admin only)
router.put('/:id', requireAuth, canManage, async (req, res, next) => {
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

// POST /api/deployments/:id/start - Start the app (admin + operator)
router.post('/:id/start', requireAuth, canOperate, async (req, res, next) => {
  try {
    const deployment = await deployer.start(req.params.id);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/:id/stop - Stop the app (admin + operator)
router.post('/:id/stop', requireAuth, canOperate, async (req, res, next) => {
  try {
    const deployment = await deployer.stop(req.params.id);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/:id/restart - Restart the app (admin + operator)
router.post('/:id/restart', requireAuth, canOperate, async (req, res, next) => {
  try {
    const deployment = await deployer.restart(req.params.id);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/deployments/:id - Uninstall the app (admin only)
router.delete('/:id', requireAuth, canManage, async (req, res, next) => {
  try {
    await deployer.uninstall(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
