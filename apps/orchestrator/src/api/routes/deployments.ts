/**
 * Deployments API - Deploy and manage Docker apps
 */

import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validateParams, validateBody, validateQuery, schemas } from '../middleware/validate.js';
import { Errors, createTypedError } from '../middleware/error.js';
import { dockerDeployer } from '../../services/dockerDeployer.js';
import { ErrorCodes } from '@ownprem/shared';
import { z } from 'zod';

const router = Router();

// Helper: Check if user can manage deployments (system admin only for now)
function canManageDeployments(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Authentication required' } });
    return;
  }
  if (req.user.isSystemAdmin) {
    next();
    return;
  }
  res.status(403).json({ error: { code: ErrorCodes.FORBIDDEN, message: 'System admin permission required' } });
}

// Query schema for deployments list
const deploymentsQuerySchema = z.object({
  serverId: z.string().min(1).max(50).optional(),
});

// Deploy request schema
const deploySchema = z.object({
  serverId: z.string().min(1, 'Server ID is required'),
  appId: z.string().min(1, 'App ID is required'),
  config: z.record(z.unknown()).optional(),
});

// GET /api/deployments - List all deployments
router.get('/', requireAuth, validateQuery(deploymentsQuerySchema), async (req, res, next) => {
  try {
    const serverId = req.query.serverId as string | undefined;

    let deployments;
    if (serverId) {
      deployments = dockerDeployer.getServerDeployments(serverId);
    } else {
      deployments = dockerDeployer.getAllDeployments();
    }

    res.json({
      deployments,
      count: deployments.length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments - Deploy an app
router.post('/', requireAuth, canManageDeployments, validateBody(deploySchema), async (req, res, next) => {
  try {
    const { serverId, appId, config } = req.body;

    const deployment = await dockerDeployer.deploy({
      serverId,
      appId,
      config,
    });

    res.status(201).json(deployment);
  } catch (err) {
    next(err);
  }
});

// GET /api/deployments/:id - Get deployment details
router.get('/:id', requireAuth, validateParams(schemas.idParam), async (req, res, next) => {
  try {
    const deployment = dockerDeployer.getDeployment(req.params.id);

    if (!deployment) {
      throw Errors.notFound('Deployment', req.params.id);
    }

    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/deployments/:id - Uninstall deployment
router.delete('/:id', requireAuth, canManageDeployments, validateParams(schemas.idParam), async (req, res, next) => {
  try {
    const deployment = dockerDeployer.getDeployment(req.params.id);

    if (!deployment) {
      throw Errors.notFound('Deployment', req.params.id);
    }

    await dockerDeployer.uninstall(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/:id/start - Start deployment
router.post('/:id/start', requireAuth, canManageDeployments, validateParams(schemas.idParam), async (req, res, next) => {
  try {
    await dockerDeployer.start(req.params.id);
    const deployment = dockerDeployer.getDeployment(req.params.id);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/:id/stop - Stop deployment
router.post('/:id/stop', requireAuth, canManageDeployments, validateParams(schemas.idParam), async (req, res, next) => {
  try {
    await dockerDeployer.stop(req.params.id);
    const deployment = dockerDeployer.getDeployment(req.params.id);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// POST /api/deployments/:id/restart - Restart deployment
router.post('/:id/restart', requireAuth, canManageDeployments, validateParams(schemas.idParam), async (req, res, next) => {
  try {
    await dockerDeployer.restart(req.params.id);
    const deployment = dockerDeployer.getDeployment(req.params.id);
    res.json(deployment);
  } catch (err) {
    next(err);
  }
});

// GET /api/deployments/:id/logs - Get deployment logs
router.get('/:id/logs', requireAuth, validateParams(schemas.idParam), validateQuery(schemas.query.logs), async (req, res, next) => {
  try {
    const lines = parseInt(req.query.lines as string) || 100;
    const logs = await dockerDeployer.getLogs(req.params.id, lines);

    res.json({
      logs,
      lines,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
