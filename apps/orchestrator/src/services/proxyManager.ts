import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import type { AppManifest } from '@ownprem/shared';

interface ProxyRoute {
  id: string;
  path: string;
  upstream: string;
  appName: string;
  serverName: string;
}

interface ProxyRouteRow {
  id: string;
  deployment_id: string;
  path: string;
  upstream: string;
  active: number;
}

interface DeploymentWithManifest {
  id: string;
  server_id: string;
  app_name: string;
  status: string;
  host: string | null;
  manifest: string;
  server_name: string;
}

export class ProxyManager {
  private caddyfilePath: string;
  private apiPort: number;

  constructor(caddyfilePath: string = '/etc/caddy/Caddyfile', apiPort: number = 3001) {
    this.caddyfilePath = caddyfilePath;
    this.apiPort = apiPort;
  }

  async registerRoute(deploymentId: string, manifest: AppManifest, serverHost: string): Promise<void> {
    if (!manifest.webui?.enabled) {
      return;
    }

    const db = getDb();
    const path = manifest.webui.basePath;
    const host = serverHost || '127.0.0.1';
    const upstream = `http://${host}:${manifest.webui.port}`;

    const existing = db.prepare('SELECT id FROM proxy_routes WHERE path = ?').get(path) as { id: string } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE proxy_routes SET upstream = ?, active = TRUE, deployment_id = ?
        WHERE id = ?
      `).run(upstream, deploymentId, existing.id);
    } else {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO proxy_routes (id, deployment_id, path, upstream, active)
        VALUES (?, ?, ?, ?, TRUE)
      `).run(id, deploymentId, path, upstream);
    }
  }

  async unregisterRoute(deploymentId: string): Promise<void> {
    const db = getDb();
    db.prepare('DELETE FROM proxy_routes WHERE deployment_id = ?').run(deploymentId);
  }

  async setRouteActive(deploymentId: string, active: boolean): Promise<void> {
    const db = getDb();
    db.prepare('UPDATE proxy_routes SET active = ? WHERE deployment_id = ?').run(active ? 1 : 0, deploymentId);
  }

  async getActiveRoutes(): Promise<ProxyRoute[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT pr.*, d.app_name, s.name as server_name
      FROM proxy_routes pr
      JOIN deployments d ON pr.deployment_id = d.id
      JOIN servers s ON d.server_id = s.id
      WHERE pr.active = TRUE
      ORDER BY pr.path
    `).all() as (ProxyRouteRow & { app_name: string; server_name: string })[];

    return rows.map(row => ({
      id: row.id,
      path: row.path,
      upstream: row.upstream,
      appName: row.app_name,
      serverName: row.server_name,
    }));
  }

  async updateCaddyConfig(): Promise<void> {
    const routes = await this.getActiveRoutes();
    const config = this.generateCaddyConfig(routes);

    // Ensure directory exists
    const dir = dirname(this.caddyfilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.caddyfilePath, config);
    console.log(`Wrote Caddy config to ${this.caddyfilePath}`);
  }

  async reloadCaddy(): Promise<boolean> {
    try {
      execSync('systemctl reload caddy', { stdio: 'inherit' });
      console.log('Caddy reloaded successfully');
      return true;
    } catch (err) {
      console.error('Failed to reload Caddy:', err);
      return false;
    }
  }

  async updateAndReload(): Promise<boolean> {
    await this.updateCaddyConfig();
    return this.reloadCaddy();
  }

  private generateCaddyConfig(routes: ProxyRoute[]): string {
    const routeBlocks = routes.map(route => `
  # ${route.appName} on ${route.serverName}
  handle ${route.path}/* {
    uri strip_prefix ${route.path}
    reverse_proxy ${route.upstream}
  }`).join('\n');

    return `# Ownprem Caddy Configuration
# Auto-generated - do not edit manually

{
  auto_https off
}

:3000 {
  # Foundry UI (static files)
  handle / {
    root * /opt/ownprem/ui/dist
    file_server
    try_files {path} /index.html
  }

  # Foundry API
  handle /api/* {
    reverse_proxy localhost:${this.apiPort}
  }

  # WebSocket for real-time updates
  handle /socket.io/* {
    reverse_proxy localhost:${this.apiPort}
  }

  # App Web UIs
${routeBlocks}

  # Fallback to UI for SPA routing
  handle {
    root * /opt/ownprem/ui/dist
    file_server
    try_files {path} /index.html
  }
}
`;
  }

  generateDevConfig(): string {
    // Simplified config for development without Caddy
    return `# Development mode - Caddy not required
# API: http://localhost:${this.apiPort}
# UI: http://localhost:5173 (Vite dev server)
`;
  }
}

export const proxyManager = new ProxyManager();
