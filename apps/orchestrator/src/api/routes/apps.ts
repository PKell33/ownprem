import { Router } from 'express';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { getDb } from '../../db/index.js';
import { config } from '../../config.js';
import { createError } from '../middleware/error.js';
import { validateParams, schemas } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { AppManifestSchema } from '@ownprem/shared';
import type { AppManifest } from '@ownprem/shared';

const router = Router();

interface AppRegistryRow {
  name: string;
  manifest: string;
  system: number;
  mandatory: number;
  singleton: number;
  loaded_at: string;
}

function loadAppManifests(): AppManifest[] {
  const appDefsPath = config.paths.appDefinitions;
  if (!existsSync(appDefsPath)) {
    return [];
  }

  const apps: AppManifest[] = [];
  const dirs = readdirSync(appDefsPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of dirs) {
    const manifestPath = join(appDefsPath, dir, 'manifest.yaml');
    if (!existsSync(manifestPath)) {
      continue;
    }

    try {
      const content = readFileSync(manifestPath, 'utf-8');
      const parsed = parseYaml(content);
      const validated = AppManifestSchema.parse(parsed);
      apps.push(validated);
    } catch (err) {
      console.warn(`Failed to load manifest for ${dir}:`, err);
    }
  }

  return apps;
}

function syncAppRegistry(): void {
  const db = getDb();
  const manifests = loadAppManifests();

  // Get current app names from filesystem
  const appNames = new Set(manifests.map(m => m.name));

  // Remove apps that no longer exist in filesystem
  const existingApps = db.prepare('SELECT name FROM app_registry').all() as { name: string }[];
  const deleteStmt = db.prepare('DELETE FROM app_registry WHERE name = ?');
  for (const { name } of existingApps) {
    if (!appNames.has(name)) {
      deleteStmt.run(name);
    }
  }

  // Insert or update apps from filesystem
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO app_registry (name, manifest, system, mandatory, singleton, loaded_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  for (const manifest of manifests) {
    insertStmt.run(
      manifest.name,
      JSON.stringify(manifest),
      manifest.system ? 1 : 0,
      manifest.mandatory ? 1 : 0,
      manifest.singleton ? 1 : 0
    );
  }
}

// GET /api/apps - List available apps
router.get('/', requireAuth, (req, res) => {
  syncAppRegistry();

  const db = getDb();

  // Filter options
  const includeSystem = req.query.includeSystem === 'true';
  const systemOnly = req.query.systemOnly === 'true';

  let query = 'SELECT * FROM app_registry';
  if (systemOnly) {
    query += ' WHERE system = 1';
  } else if (!includeSystem) {
    query += ' WHERE system = 0';
  }
  query += ' ORDER BY name';

  const rows = db.prepare(query).all() as AppRegistryRow[];

  const apps = rows.map(row => ({
    ...JSON.parse(row.manifest) as AppManifest,
    system: row.system === 1,
    mandatory: row.mandatory === 1,
    singleton: row.singleton === 1,
    loadedAt: new Date(row.loaded_at),
  }));

  res.json(apps);
});

// GET /api/apps/system/mandatory - Get mandatory system apps (for auto-install)
// NOTE: Must be before /:name route to avoid "system" being treated as a name param
router.get('/system/mandatory', requireAuth, (_req, res) => {
  syncAppRegistry();

  const db = getDb();
  const rows = db.prepare('SELECT * FROM app_registry WHERE system = 1 AND mandatory = 1 ORDER BY name').all() as AppRegistryRow[];

  const apps = rows.map(row => ({
    ...JSON.parse(row.manifest) as AppManifest,
    system: true,
    mandatory: true,
    singleton: row.singleton === 1,
    loadedAt: new Date(row.loaded_at),
  }));

  res.json(apps);
});

// GET /api/apps/:name - Get app manifest
router.get('/:name', requireAuth, validateParams(schemas.appNameParam), (req, res) => {
  syncAppRegistry();

  const db = getDb();
  const row = db.prepare('SELECT * FROM app_registry WHERE name = ?').get(req.params.name) as AppRegistryRow | undefined;

  if (!row) {
    throw createError('App not found', 404, 'APP_NOT_FOUND');
  }

  const manifest = JSON.parse(row.manifest) as AppManifest;
  res.json({
    ...manifest,
    system: row.system === 1,
    mandatory: row.mandatory === 1,
    singleton: row.singleton === 1,
  });
});

// GET /api/apps/:name/versions - Get available versions
router.get('/:name/versions', requireAuth, validateParams(schemas.appNameParam), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM app_registry WHERE name = ?').get(req.params.name) as AppRegistryRow | undefined;

  if (!row) {
    throw createError('App not found', 404, 'APP_NOT_FOUND');
  }

  const manifest = JSON.parse(row.manifest) as AppManifest;

  // For Phase 1, just return the current version
  // Later this could fetch from GitHub releases
  res.json({
    current: manifest.version,
    available: [manifest.version],
  });
});

export default router;
