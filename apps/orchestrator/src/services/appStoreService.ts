import { parse as parseYaml } from 'yaml';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getDb } from '../db/index.js';
import logger from '../lib/logger.js';
import { config } from '../config.js';

const UMBREL_APPS_REPO = 'https://api.github.com/repos/getumbrel/umbrel-apps/contents';
const UMBREL_RAW_BASE = 'https://raw.githubusercontent.com/getumbrel/umbrel-apps/master';
const UMBREL_GALLERY_BASE = 'https://getumbrel.github.io/umbrel-apps-gallery';

// Sync all categories by default (null means all)
// Can be filtered to specific categories if needed
const SUPPORTED_CATEGORIES: string[] | null = null;

export interface UmbrelAppManifest {
  manifestVersion: number;
  id: string;
  category: string;
  name: string;
  version: string;
  tagline: string;
  description: string;
  developer: string;
  website: string;
  dependencies: string[];
  repo: string;
  support: string;
  port: number;
  gallery: string[];
  path: string;
  defaultUsername?: string;
  defaultPassword?: string;
  releaseNotes?: string;
  submitter?: string;
  submission?: string;
}

export interface AppDefinition {
  id: string;
  name: string;
  version: string;
  tagline: string;
  description: string;
  category: string;
  developer: string;
  website: string;
  repo: string;
  port: number;
  dependencies: string[];
  icon: string;
  gallery: string[];
  composeFile: string;
  manifest: UmbrelAppManifest;
}

interface AppCacheRow {
  id: string;
  category: string;
  manifest: string;
  compose_file: string;
  updated_at: string;
}

class AppStoreService {
  private initialized = false;

  /**
   * Initialize the app store - create tables if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const db = getDb();

    // Create app cache table
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_cache (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        manifest TEXT NOT NULL,
        compose_file TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create app sources table for future extensibility
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'umbrel',
        url TEXT,
        enabled INTEGER DEFAULT 1,
        last_sync TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default Umbrel source if not exists
    db.prepare(`
      INSERT OR IGNORE INTO app_sources (id, name, type, url)
      VALUES ('umbrel', 'Umbrel App Store', 'umbrel', ?)
    `).run(UMBREL_RAW_BASE);

    this.initialized = true;
    logger.info('AppStoreService initialized');
  }

  /**
   * Sync apps from Umbrel repository
   * - Updates existing apps with new versions
   * - Adds new apps
   * - Removes apps that are no longer in the repository
   */
  async syncApps(category?: string): Promise<{ synced: number; updated: number; removed: number; errors: string[] }> {
    await this.initialize();

    const db = getDb();
    let synced = 0;
    let updated = 0;
    let removed = 0;
    const errors: string[] = [];
    const syncedAppIds = new Set<string>();

    try {
      // Fetch all apps from GitHub
      const allApps = await this.fetchAllApps();
      logger.info({ total: allApps.length }, 'Fetched app list from Umbrel');

      // Filter by category if specified, or by SUPPORTED_CATEGORIES if set
      let appsToSync = allApps;
      if (category) {
        appsToSync = allApps.filter(app => app.category === category);
      } else if (SUPPORTED_CATEGORIES !== null) {
        appsToSync = allApps.filter(app => SUPPORTED_CATEGORIES.includes(app.category));
      }

      logger.info({ filtered: appsToSync.length }, 'Apps to sync after filtering');

      // Sync each app
      for (const app of appsToSync) {
        try {
          // Check if app already exists
          const existing = db.prepare('SELECT id, manifest FROM app_cache WHERE id = ?').get(app.id) as { id: string; manifest: string } | undefined;

          await this.fetchAndCacheApp(app.id, app.category);
          syncedAppIds.add(app.id);

          if (existing) {
            // Check if version changed
            const oldManifest = JSON.parse(existing.manifest) as UmbrelAppManifest;
            if (oldManifest.version !== app.version) {
              updated++;
              logger.info({ appId: app.id, oldVersion: oldManifest.version, newVersion: app.version }, 'Updated app');
            }
          } else {
            synced++;
            logger.debug({ appId: app.id }, 'Added new app');
          }
        } catch (err) {
          const msg = `Failed to fetch ${app.id}: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
          logger.warn({ appId: app.id, error: err }, 'Failed to fetch app');
        }
      }

      // Remove apps that are no longer in the repository
      // Only remove if we're doing a full sync (no category filter)
      if (!category) {
        const cachedApps = db.prepare('SELECT id FROM app_cache').all() as { id: string }[];
        for (const cached of cachedApps) {
          if (!syncedAppIds.has(cached.id)) {
            // Check if this app is deployed before removing
            const deployments = db.prepare('SELECT id FROM deployments WHERE app_name = ?').all(cached.id);
            if (deployments.length > 0) {
              logger.warn({ appId: cached.id, deployments: deployments.length }, 'App removed from Umbrel but still deployed - keeping in cache');
            } else {
              db.prepare('DELETE FROM app_cache WHERE id = ?').run(cached.id);
              removed++;
              logger.info({ appId: cached.id }, 'Removed app no longer in Umbrel');
            }
          }
        }
      }

    } catch (err) {
      const msg = `Failed to fetch apps: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error({ error: err }, 'Failed to fetch apps from Umbrel');
    }

    // Update last sync time
    db.prepare(`UPDATE app_sources SET last_sync = CURRENT_TIMESTAMP WHERE id = 'umbrel'`).run();

    logger.info({ synced, updated, removed, errors: errors.length }, 'App sync complete');
    return { synced, updated, removed, errors };
  }

  /**
   * Fetch all apps from the Umbrel repository with their categories
   */
  private async fetchAllApps(): Promise<Array<{ id: string; category: string; version: string }>> {
    // Fetch the list of directories in the repo root
    const response = await fetch(UMBREL_APPS_REPO, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'OwnPrem/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const contents = await response.json() as Array<{ name: string; type: string }>;

    // Get all directories (each directory is an app)
    const appDirs = contents
      .filter(item => item.type === 'dir')
      .map(item => item.name)
      .filter(name => !name.startsWith('.') && !name.startsWith('_'));

    // Fetch manifests in parallel batches to get category info
    const apps: Array<{ id: string; category: string; version: string }> = [];
    const batchSize = 20;

    for (let i = 0; i < appDirs.length; i += batchSize) {
      const batch = appDirs.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (appId) => {
          const manifest = await this.fetchManifest(appId);
          if (manifest) {
            return { id: appId, category: manifest.category, version: manifest.version };
          }
          return null;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          apps.push(result.value);
        }
      }
    }

    return apps;
  }

  /**
   * Fetch and cache a single app (including icon)
   */
  private async fetchAndCacheApp(appId: string, category: string): Promise<void> {
    const [manifest, composeFile] = await Promise.all([
      this.fetchManifest(appId),
      this.fetchComposeFile(appId),
    ]);

    if (!manifest) {
      throw new Error(`No manifest found for ${appId}`);
    }

    if (!composeFile) {
      throw new Error(`No compose file found for ${appId}`);
    }

    // Download and cache icon (don't fail if icon download fails)
    await this.downloadIcon(appId).catch(err => {
      logger.warn({ appId, error: err }, 'Failed to download icon');
    });

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO app_cache (id, category, manifest, compose_file, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(appId, category, JSON.stringify(manifest), composeFile);

    logger.debug({ appId }, 'Cached app');
  }

  /**
   * Download and cache an app icon locally
   */
  private async downloadIcon(appId: string): Promise<void> {
    const iconUrl = `${UMBREL_GALLERY_BASE}/${appId}/icon.svg`;
    const iconsDir = config.paths.icons;

    // Ensure icons directory exists
    if (!existsSync(iconsDir)) {
      await mkdir(iconsDir, { recursive: true });
    }

    const response = await fetch(iconUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch icon: ${response.status}`);
    }

    const iconData = await response.arrayBuffer();
    const iconPath = join(iconsDir, `${appId}.svg`);
    await writeFile(iconPath, Buffer.from(iconData));

    logger.debug({ appId, iconPath }, 'Downloaded icon');
  }

  /**
   * Fetch manifest from GitHub
   */
  private async fetchManifest(appId: string): Promise<UmbrelAppManifest | null> {
    const url = `${UMBREL_RAW_BASE}/${appId}/umbrel-app.yml`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const yamlContent = await response.text();
      return parseYaml(yamlContent) as UmbrelAppManifest;
    } catch {
      return null;
    }
  }

  /**
   * Fetch docker-compose.yml from GitHub
   */
  private async fetchComposeFile(appId: string): Promise<string | null> {
    const url = `${UMBREL_RAW_BASE}/${appId}/docker-compose.yml`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      return response.text();
    } catch {
      return null;
    }
  }


  /**
   * Get all cached apps
   */
  async getApps(category?: string): Promise<AppDefinition[]> {
    await this.initialize();

    const db = getDb();
    let rows: AppCacheRow[];

    if (category) {
      rows = db.prepare(`SELECT * FROM app_cache WHERE category = ?`).all(category) as AppCacheRow[];
    } else {
      rows = db.prepare(`SELECT * FROM app_cache`).all() as AppCacheRow[];
    }

    return rows.map(row => this.rowToAppDefinition(row));
  }

  /**
   * Get all unique categories with app counts
   */
  async getCategories(): Promise<Array<{ category: string; count: number }>> {
    await this.initialize();

    const db = getDb();
    const rows = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM app_cache
      GROUP BY category
      ORDER BY count DESC
    `).all() as Array<{ category: string; count: number }>;

    return rows;
  }

  /**
   * Get a single app by ID
   */
  async getApp(id: string): Promise<AppDefinition | null> {
    await this.initialize();

    const db = getDb();
    const row = db.prepare(`SELECT * FROM app_cache WHERE id = ?`).get(id) as AppCacheRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToAppDefinition(row);
  }

  /**
   * Convert database row to AppDefinition
   */
  private rowToAppDefinition(row: AppCacheRow): AppDefinition {
    const manifest = JSON.parse(row.manifest) as UmbrelAppManifest;

    return {
      id: row.id,
      name: manifest.name,
      version: manifest.version,
      tagline: manifest.tagline,
      description: manifest.description,
      category: manifest.category,
      developer: manifest.developer,
      website: manifest.website,
      repo: manifest.repo,
      port: manifest.port,
      dependencies: manifest.dependencies || [],
      icon: `/api/apps/${row.id}/icon`,
      gallery: (manifest.gallery || []).map(img => `${UMBREL_GALLERY_BASE}/${row.id}/${img}`),
      composeFile: row.compose_file,
      manifest,
    };
  }

  /**
   * Check if apps need to be synced (older than 1 hour)
   */
  async needsSync(): Promise<boolean> {
    await this.initialize();

    const db = getDb();
    const source = db.prepare(`SELECT last_sync FROM app_sources WHERE id = 'umbrel'`).get() as { last_sync: string | null } | undefined;

    if (!source?.last_sync) {
      return true;
    }

    const lastSync = new Date(source.last_sync);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    return lastSync < oneHourAgo;
  }

  /**
   * Get app count
   */
  async getAppCount(): Promise<number> {
    await this.initialize();

    const db = getDb();
    const result = db.prepare(`SELECT COUNT(*) as count FROM app_cache`).get() as { count: number };
    return result.count;
  }
}

export const appStoreService = new AppStoreService();
