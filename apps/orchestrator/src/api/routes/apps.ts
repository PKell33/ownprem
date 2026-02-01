/**
 * Apps API - Browse and manage apps from the Umbrel App Store
 */

import { Router } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { requireAuth } from '../middleware/auth.js';
import { validateParams, validateQuery, schemas } from '../middleware/validate.js';
import { Errors } from '../middleware/error.js';
import { appStoreService } from '../../services/appStoreService.js';
import { config } from '../../config.js';
import { z } from 'zod';

const router = Router();

// Query schema for apps list
const appsQuerySchema = z.object({
  category: z.string().min(1).max(50).optional(),
});

// GET /api/apps - List available apps
router.get('/', requireAuth, validateQuery(appsQuerySchema), async (req, res, next) => {
  try {
    const category = req.query.category as string | undefined;
    const apps = await appStoreService.getApps(category);

    res.json({
      apps,
      count: apps.length,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/apps/categories - Get all categories with counts
router.get('/categories', requireAuth, async (req, res, next) => {
  try {
    const categories = await appStoreService.getCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

// GET /api/apps/sync - Sync apps from Umbrel App Store
router.get('/sync', requireAuth, async (req, res, next) => {
  try {
    const result = await appStoreService.syncApps();

    const parts = [];
    if (result.synced > 0) parts.push(`${result.synced} new`);
    if (result.updated > 0) parts.push(`${result.updated} updated`);
    if (result.removed > 0) parts.push(`${result.removed} removed`);
    const summary = parts.length > 0 ? parts.join(', ') : 'No changes';

    res.json({
      synced: result.synced,
      updated: result.updated,
      removed: result.removed,
      errors: result.errors,
      message: `${summary}${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/apps/sync - Force sync apps from Umbrel App Store
router.post('/sync', requireAuth, async (req, res, next) => {
  try {
    const result = await appStoreService.syncApps();

    const parts = [];
    if (result.synced > 0) parts.push(`${result.synced} new`);
    if (result.updated > 0) parts.push(`${result.updated} updated`);
    if (result.removed > 0) parts.push(`${result.removed} removed`);
    const summary = parts.length > 0 ? parts.join(', ') : 'No changes';

    res.json({
      synced: result.synced,
      updated: result.updated,
      removed: result.removed,
      errors: result.errors,
      message: `${summary}${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/apps/status - Get sync status
router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const needsSync = await appStoreService.needsSync();
    const appCount = await appStoreService.getAppCount();

    res.json({
      needsSync,
      appCount,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/apps/:id/icon - Get app icon (served locally, no auth required for images)
router.get('/:id/icon', validateParams(z.object({ id: z.string().min(1).max(100) })), (req, res, next) => {
  try {
    const iconPath = join(config.paths.icons, `${req.params.id}.svg`);

    if (!existsSync(iconPath)) {
      // Return a 404 with no body - let the browser handle missing images
      res.status(404).end();
      return;
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    res.sendFile(iconPath);
  } catch (err) {
    next(err);
  }
});

// GET /api/apps/:id - Get specific app details
router.get('/:id', requireAuth, validateParams(z.object({ id: z.string().min(1).max(100) })), async (req, res, next) => {
  try {
    const app = await appStoreService.getApp(req.params.id);

    if (!app) {
      throw Errors.notFound('App', req.params.id);
    }

    res.json(app);
  } catch (err) {
    next(err);
  }
});

export default router;
