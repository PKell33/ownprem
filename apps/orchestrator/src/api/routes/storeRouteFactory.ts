/**
 * Factory for creating store API routes
 *
 * Eliminates duplication across umbrel, casaos, start9, and runtipi route files.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { validateParams, validateBody } from '../middleware/validate.js';
import { Errors } from '../middleware/error.js';
import { config } from '../../config.js';
import { z } from 'zod';
import { proxyImage, getGalleryUrls } from '../utils/imageProxy.js';
import { broadcastSyncProgress, broadcastSyncComplete } from '../../websocket/broadcast.js';
import type { BaseStoreService, BaseAppDefinition, SyncResult } from '../../services/baseStoreService.js';

// Icon file extensions to check, in order of priority
type IconExtension = 'svg' | 'png' | 'jpg';

interface StoreRouteConfig {
  /** Store type identifier (e.g., 'umbrel', 'casaos') */
  storeType: string;
  /** Display name for messages (e.g., 'Umbrel', 'CasaOS') */
  displayName: string;
  /** The store service instance */
  service: BaseStoreService<BaseAppDefinition>;
  /** Icon extensions to check, in priority order */
  iconExtensions: readonly IconExtension[];
  /** Whether to include legacy icon route with old path fallback (umbrel only) */
  legacyIconPath?: boolean;
}

// Shared validation schemas
const registryIdSchema = z.object({
  id: z.string().min(1).max(50),
});

const registryParamsSchema = z.object({
  registry: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  id: z.string().min(1).max(100),
});

const appIdSchema = z.object({
  id: z.string().min(1).max(100),
});

const galleryParamsSchema = z.object({
  id: z.string().min(1).max(100),
  index: z.string().regex(/^\d+$/),
});

const addRegistrySchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const updateRegistrySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  enabled: z.boolean().optional(),
}).refine(data => data.name || data.url || data.enabled !== undefined, {
  message: 'At least one field must be provided',
});

/**
 * Build sync result message
 */
export function buildSyncMessage(registryName: string, result: SyncResult): string {
  const parts: string[] = [];
  if (result.synced > 0) parts.push(`${result.synced} new`);
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.removed > 0) parts.push(`${result.removed} removed`);
  const summary = parts.length > 0 ? parts.join(', ') : 'No changes';
  return `${registryName}: ${summary}${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`;
}

/**
 * Get content type for icon extension
 */
function getContentType(ext: IconExtension): string {
  switch (ext) {
    case 'svg': return 'image/svg+xml';
    case 'png': return 'image/png';
    case 'jpg': return 'image/jpeg';
  }
}

/**
 * Try to send an icon file, checking multiple extensions
 */
function tryServeIcon(
  res: Response,
  basePath: string,
  appId: string,
  extensions: readonly IconExtension[]
): boolean {
  for (const ext of extensions) {
    const iconPath = join(basePath, `${appId}.${ext}`);
    if (existsSync(iconPath)) {
      res.setHeader('Content-Type', getContentType(ext));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(iconPath);
      return true;
    }
  }
  return false;
}

/**
 * Create icon routes for a store
 */
export function createIconRoutes(cfg: StoreRouteConfig): Router {
  const router = Router();

  // GET /:registry/:id/icon - Get app icon (registry-specific)
  router.get('/:registry/:id/icon', validateParams(registryParamsSchema), (req, res, next) => {
    try {
      const { registry, id } = req.params;
      const basePath = join(config.paths.icons, cfg.storeType, registry);

      if (tryServeIcon(res, basePath, id, cfg.iconExtensions)) {
        return;
      }

      res.status(404).end();
    } catch (err) {
      next(err);
    }
  });

  // GET /:id/icon - Legacy icon route (checks all registries)
  router.get('/:id/icon', validateParams(appIdSchema), async (req, res, next) => {
    try {
      const id = req.params.id;

      // Umbrel has legacy icon location fallback
      if (cfg.legacyIconPath) {
        const oldIconPath = join(config.paths.icons, `${id}.svg`);
        if (existsSync(oldIconPath)) {
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.sendFile(oldIconPath);
          return;
        }
      }

      // Try registry-specific locations
      const registries = await cfg.service.getRegistries();
      for (const registry of registries) {
        const basePath = join(config.paths.icons, cfg.storeType, registry.id);
        if (tryServeIcon(res, basePath, id, cfg.iconExtensions)) {
          return;
        }
      }

      res.status(404).end();
    } catch (err) {
      next(err);
    }
  });

  // GET /:id/gallery/:index - Proxy gallery images
  router.get('/:id/gallery/:index', validateParams(galleryParamsSchema), async (req, res, next) => {
    try {
      const { id, index } = req.params;
      const app = await cfg.service.getApp(id);

      if (!app) {
        res.status(404).end();
        return;
      }

      const gallery = getGalleryUrls(app as unknown as Record<string, unknown>);
      const idx = parseInt(index, 10);

      if (idx < 0 || idx >= gallery.length) {
        res.status(404).end();
        return;
      }

      await proxyImage(gallery[idx], res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Create registry management routes
 */
export function createRegistryRoutes(cfg: StoreRouteConfig): Router {
  const router = Router();

  // GET /registries - List all registries
  router.get('/registries', requireAuth, async (req, res, next) => {
    try {
      const registries = await cfg.service.getRegistries();
      res.json({ registries });
    } catch (err) {
      next(err);
    }
  });

  // POST /registries - Add a new registry
  router.post('/registries', requireAuth, validateBody(addRegistrySchema), async (req, res, next) => {
    try {
      const { id, name, url } = req.body;
      const registry = await cfg.service.addRegistry(id, name, url);
      res.status(201).json(registry);
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) {
        res.status(409).json({ error: { code: 'DUPLICATE_REGISTRY', message: err.message } });
        return;
      }
      next(err);
    }
  });

  // PUT /registries/:id - Update a registry
  router.put('/registries/:id', requireAuth, validateParams(registryIdSchema), validateBody(updateRegistrySchema), async (req, res, next) => {
    try {
      const registry = await cfg.service.updateRegistry(req.params.id, req.body);
      if (!registry) {
        throw Errors.notFound('Registry', req.params.id);
      }
      res.json(registry);
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) {
        res.status(409).json({ error: { code: 'DUPLICATE_REGISTRY', message: err.message } });
        return;
      }
      next(err);
    }
  });

  // DELETE /registries/:id - Remove a registry
  router.delete('/registries/:id', requireAuth, validateParams(registryIdSchema), async (req, res, next) => {
    try {
      const deleted = await cfg.service.removeRegistry(req.params.id);
      if (!deleted) {
        throw Errors.notFound('Registry', req.params.id);
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Create app management routes (list, get, sync)
 */
export function createAppRoutes(cfg: StoreRouteConfig, appsPath: string = '/apps'): Router {
  const router = Router();

  // GET /apps - List all apps
  router.get(appsPath, requireAuth, async (req, res, next) => {
    try {
      const apps = await cfg.service.getApps();
      res.json({
        apps,
        count: apps.length,
        source: cfg.storeType,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /apps/sync - Sync apps from registries
  router.post(`${appsPath}/sync`, requireAuth, async (req, res, next) => {
    try {
      const registryId = req.query.registry as string | undefined;

      if (registryId) {
        const registry = await cfg.service.getRegistry(registryId);
        if (!registry) {
          res.status(400).json({ error: { code: 'INVALID_REGISTRY', message: `Registry not found: ${registryId}` } });
          return;
        }
      }

      const syncId = randomUUID();
      const startTime = Date.now();

      const result = await cfg.service.syncApps(registryId, {
        onProgress: (data) => {
          broadcastSyncProgress({
            syncId,
            storeType: cfg.storeType,
            registryId: data.registryId,
            registryName: data.registryName,
            phase: data.phase,
            currentApp: data.currentApp,
            processed: data.processed,
            total: data.total,
            errors: data.errors,
          });
        },
      });

      const duration = Date.now() - startTime;

      let registryName = cfg.displayName;
      if (registryId) {
        const registry = await cfg.service.getRegistry(registryId);
        registryName = registry?.name || registryId;
      }

      broadcastSyncComplete({
        syncId,
        storeType: cfg.storeType,
        registryId: registryId || 'all',
        registryName,
        synced: result.synced,
        updated: result.updated,
        removed: result.removed,
        errors: result.errors,
        duration,
      });

      res.json({
        synced: result.synced,
        updated: result.updated,
        removed: result.removed,
        errors: result.errors,
        registry: registryId || 'all',
        message: buildSyncMessage(registryName, result),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /apps/status - Get sync status
  router.get(`${appsPath}/status`, requireAuth, async (req, res, next) => {
    try {
      const appCount = await cfg.service.getAppCount();
      res.json({
        appCount,
        source: cfg.storeType,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /apps/:id - Get specific app details
  router.get(`${appsPath}/:id`, requireAuth, validateParams(appIdSchema), async (req, res, next) => {
    try {
      const app = await cfg.service.getApp(req.params.id);
      if (!app) {
        throw Errors.notFound(`${cfg.displayName} App`, req.params.id);
      }
      res.json(app);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Create all routes for a store
 */
export function createStoreRoutes(cfg: StoreRouteConfig): { router: Router; iconRouter: Router } {
  const router = Router();
  const iconRouter = createIconRoutes(cfg);

  // Add registry routes
  router.use(createRegistryRoutes(cfg));

  // Add app routes
  router.use(createAppRoutes(cfg));

  return { router, iconRouter };
}
