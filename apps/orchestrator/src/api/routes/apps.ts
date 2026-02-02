/**
 * Apps API - Browse and manage apps from Umbrel App Stores
 *
 * Note: Umbrel routes have special behavior:
 * - Legacy icon path fallback for backward compatibility
 * - Categories endpoint
 * - Apps at root path (/) instead of /apps
 * - GET /sync for backward compatibility
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { appStoreService } from '../../services/appStoreService.js';
import { z } from 'zod';
import {
  createIconRoutes,
  createRegistryRoutes,
  createAppRoutes,
  buildSyncMessage,
} from './storeRouteFactory.js';

const router = Router();

// Store configuration for Umbrel
const umbrelConfig = {
  storeType: 'umbrel',
  displayName: 'Umbrel',
  service: appStoreService,
  iconExtensions: ['svg', 'png'] as const,
  legacyIconPath: true,
};

// Create icon routes with legacy path support
const iconRouter = createIconRoutes(umbrelConfig);

// Add registry management routes
router.use(createRegistryRoutes(umbrelConfig));

// ==================== Umbrel-Specific Routes ====================

// Query schema for apps list
const appsQuerySchema = z.object({
  category: z.string().min(1).max(50).optional(),
});

// GET / - List available apps (with optional category filter)
router.get('/', requireAuth, validateQuery(appsQuerySchema), async (req, res, next) => {
  try {
    const category = req.query.category as string | undefined;
    const apps = category
      ? await appStoreService.getAppsByCategory(category)
      : await appStoreService.getApps();

    res.json({
      apps,
      count: apps.length,
    });
  } catch (err) {
    next(err);
  }
});

// GET /categories - Get all categories with counts (Umbrel-specific)
router.get('/categories', requireAuth, async (req, res, next) => {
  try {
    const categories = await appStoreService.getCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

// Add standard app routes (sync, status, get by id) at root path
// Note: createAppRoutes adds routes at '' path since Umbrel uses root
router.use(createAppRoutes({ ...umbrelConfig, storeType: 'umbrel' }, ''));

// GET /sync - Legacy GET endpoint for backward compatibility
router.get('/sync', requireAuth, async (req, res, next) => {
  try {
    const result = await appStoreService.syncApps();
    res.json({
      synced: result.synced,
      updated: result.updated,
      removed: result.removed,
      errors: result.errors,
      message: buildSyncMessage('Umbrel', result),
    });
  } catch (err) {
    next(err);
  }
});

// Export both routers
export default Object.assign(router, { iconRouter });
