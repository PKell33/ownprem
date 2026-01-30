import { Router } from 'express';
import { z } from 'zod';
import { caddyHAManager } from '../../services/caddyHAManager.js';
import { requireAuth, requireSystemAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { createError } from '../middleware/error.js';
import { auditService } from '../../services/auditService.js';

const router = Router();

// Validation schemas
const haConfigSchema = z.object({
  vipAddress: z.string().ip({ version: 'v4' }),
  vipInterface: z.string().min(1).max(20).regex(/^[a-z0-9]+$/).optional(),
  vrrpRouterId: z.number().int().min(1).max(255).optional(),
  vrrpAuthPass: z.string().min(1).max(32).optional(),
});

const instanceSchema = z.object({
  deploymentId: z.string().uuid(),
  vrrpPriority: z.number().int().min(1).max(254).optional(),
  isPrimary: z.boolean().optional(),
  adminApiUrl: z.string().url().optional(),
});

const prioritySchema = z.object({
  priority: z.number().int().min(1).max(254),
});

const idParam = z.object({
  id: z.string().uuid(),
});

// ===============================
// HA Configuration Routes
// ===============================

// GET /api/caddy-ha/config - Get HA configuration
router.get('/config', requireAuth, async (_req, res, next) => {
  try {
    const config = await caddyHAManager.getHAConfig();
    res.json(config || { enabled: false, configured: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/caddy-ha/config - Create or update HA configuration
router.post('/config', requireAuth, requireSystemAdmin, csrfProtection, validateBody(haConfigSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const config = await caddyHAManager.configureHA(req.body);

    auditService.log({
      userId: req.user?.userId,
      action: 'deployment_configured',
      resourceType: 'system',
      resourceId: config.id,
      details: { type: 'caddy-ha', vipAddress: config.vipAddress },
    });

    res.json(config);
  } catch (err) {
    next(err);
  }
});

// PUT /api/caddy-ha/config/enabled - Enable or disable HA
router.put('/config/enabled', requireAuth, requireSystemAdmin, csrfProtection, validateBody(z.object({ enabled: z.boolean() })), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { enabled } = req.body;
    await caddyHAManager.setHAEnabled(enabled);

    auditService.log({
      userId: req.user?.userId,
      action: 'deployment_configured',
      resourceType: 'system',
      details: { type: 'caddy-ha', enabled },
    });

    res.json({ success: true, enabled });
  } catch (err) {
    next(err);
  }
});

// ===============================
// Instance Routes
// ===============================

// GET /api/caddy-ha/instances - List all Caddy instances
router.get('/instances', requireAuth, async (_req, res, next) => {
  try {
    const instances = await caddyHAManager.listInstances();
    res.json(instances);
  } catch (err) {
    next(err);
  }
});

// GET /api/caddy-ha/instances/primary - Get the primary instance
router.get('/instances/primary', requireAuth, async (_req, res, next) => {
  try {
    const primary = await caddyHAManager.getPrimaryInstance();
    if (!primary) {
      throw createError('No primary instance found', 404, 'NO_PRIMARY');
    }
    res.json(primary);
  } catch (err) {
    next(err);
  }
});

// POST /api/caddy-ha/instances - Register a new Caddy instance
router.post('/instances', requireAuth, requireSystemAdmin, csrfProtection, validateBody(instanceSchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { deploymentId, ...options } = req.body;
    const instance = await caddyHAManager.registerInstance(deploymentId, options);

    auditService.log({
      userId: req.user?.userId,
      action: 'deployment_configured',
      resourceType: 'deployment',
      resourceId: deploymentId,
      details: { type: 'caddy-ha-instance', instanceId: instance.id },
    });

    res.status(201).json(instance);
  } catch (err) {
    next(err);
  }
});

// GET /api/caddy-ha/instances/:id - Get instance details
router.get('/instances/:id', requireAuth, validateParams(idParam), async (req, res, next) => {
  try {
    const instance = await caddyHAManager.getInstance(req.params.id);
    if (!instance) {
      throw createError('Instance not found', 404, 'INSTANCE_NOT_FOUND');
    }
    res.json(instance);
  } catch (err) {
    next(err);
  }
});

// PUT /api/caddy-ha/instances/:id/priority - Update instance priority
router.put('/instances/:id/priority', requireAuth, requireSystemAdmin, csrfProtection, validateParams(idParam), validateBody(prioritySchema), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { priority } = req.body;
    await caddyHAManager.setInstancePriority(req.params.id, priority);

    auditService.log({
      userId: req.user?.userId,
      action: 'deployment_configured',
      resourceType: 'deployment',
      resourceId: req.params.id,
      details: { type: 'caddy-ha-priority', priority },
    });

    res.json({ success: true, priority });
  } catch (err) {
    next(err);
  }
});

// POST /api/caddy-ha/instances/:id/promote - Promote instance to primary
router.post('/instances/:id/promote', requireAuth, requireSystemAdmin, csrfProtection, validateParams(idParam), async (req: AuthenticatedRequest, res, next) => {
  try {
    await caddyHAManager.promoteInstance(req.params.id);

    auditService.log({
      userId: req.user?.userId,
      action: 'deployment_configured',
      resourceType: 'deployment',
      resourceId: req.params.id,
      details: { type: 'caddy-ha-promote' },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/caddy-ha/instances/:id - Unregister an instance
router.delete('/instances/:id', requireAuth, requireSystemAdmin, csrfProtection, validateParams(idParam), async (req: AuthenticatedRequest, res, next) => {
  try {
    await caddyHAManager.unregisterInstance(req.params.id);

    auditService.log({
      userId: req.user?.userId,
      action: 'deployment_configured',
      resourceType: 'deployment',
      resourceId: req.params.id,
      details: { type: 'caddy-ha-unregister' },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ===============================
// Sync Routes
// ===============================

// POST /api/caddy-ha/sync/keepalived - Sync keepalived configuration to all instances
router.post('/sync/keepalived', requireAuth, requireSystemAdmin, csrfProtection, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await caddyHAManager.syncKeepalived();

    auditService.log({
      userId: req.user?.userId,
      action: 'deployment_configured',
      resourceType: 'system',
      details: { type: 'keepalived-sync', success: result.success },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/caddy-ha/sync/config - Sync Caddy configuration to all instances
router.post('/sync/config', requireAuth, requireSystemAdmin, csrfProtection, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await caddyHAManager.syncCaddyConfig();

    auditService.log({
      userId: req.user?.userId,
      action: 'deployment_configured',
      resourceType: 'system',
      details: { type: 'caddy-config-sync', success: result.success },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
