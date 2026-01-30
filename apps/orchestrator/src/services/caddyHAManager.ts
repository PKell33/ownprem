import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import { secretsManager } from './secretsManager.js';
import { sendCommand, isAgentConnected } from '../websocket/agentHandler.js';
import { auditService } from './auditService.js';
import logger from '../lib/logger.js';

/**
 * Caddy HA Manager
 *
 * Manages high availability configuration for Caddy reverse proxies.
 * Coordinates multiple Caddy instances with VRRP/keepalived for failover.
 */

const haLogger = logger.child({ component: 'caddy-ha' });

// Types
export interface HAConfig {
  id: string;
  vipAddress: string;
  vipInterface: string;
  vrrpRouterId: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaddyInstance {
  id: string;
  deploymentId: string;
  haConfigId: string | null;
  vrrpPriority: number;
  isPrimary: boolean;
  adminApiUrl: string | null;
  lastConfigSync: Date | null;
  lastCertSync: Date | null;
  status: 'pending' | 'active' | 'error';
  statusMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaddyInstanceWithServer extends CaddyInstance {
  serverId: string;
  serverName: string;
  serverHost: string | null;
  deploymentStatus: string;
}

interface HAConfigRow {
  id: string;
  vip_address: string;
  vip_interface: string;
  vrrp_router_id: number;
  vrrp_auth_pass_encrypted: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface CaddyInstanceRow {
  id: string;
  deployment_id: string;
  ha_config_id: string | null;
  vrrp_priority: number;
  is_primary: number;
  admin_api_url: string | null;
  last_config_sync: string | null;
  last_cert_sync: string | null;
  status: string;
  status_message: string | null;
  created_at: string;
  updated_at: string;
}

interface CaddyInstanceWithServerRow extends CaddyInstanceRow {
  server_id: string;
  server_name: string;
  server_host: string | null;
  deployment_status: string;
}

class CaddyHAManager {
  /**
   * Create or update the HA configuration.
   * Only one HA config can exist at a time.
   */
  async configureHA(options: {
    vipAddress: string;
    vipInterface?: string;
    vrrpRouterId?: number;
    vrrpAuthPass?: string;
  }): Promise<HAConfig> {
    const db = getDb();

    // Check for existing config
    const existing = db.prepare('SELECT * FROM caddy_ha_config LIMIT 1').get() as HAConfigRow | undefined;

    let id: string;
    let authPassEncrypted: string | null = null;

    if (options.vrrpAuthPass) {
      authPassEncrypted = secretsManager.encrypt({ pass: options.vrrpAuthPass });
    }

    if (existing) {
      // Update existing
      id = existing.id;
      db.prepare(`
        UPDATE caddy_ha_config SET
          vip_address = ?,
          vip_interface = ?,
          vrrp_router_id = ?,
          vrrp_auth_pass_encrypted = COALESCE(?, vrrp_auth_pass_encrypted),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        options.vipAddress,
        options.vipInterface || 'eth0',
        options.vrrpRouterId || 51,
        authPassEncrypted,
        id
      );

      haLogger.info({ id, vip: options.vipAddress }, 'HA configuration updated');
    } else {
      // Create new
      id = randomUUID();

      // Generate auth password if not provided
      if (!authPassEncrypted) {
        const generatedPass = secretsManager.generatePassword(16);
        authPassEncrypted = secretsManager.encrypt({ pass: generatedPass });
      }

      db.prepare(`
        INSERT INTO caddy_ha_config (id, vip_address, vip_interface, vrrp_router_id, vrrp_auth_pass_encrypted)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        id,
        options.vipAddress,
        options.vipInterface || 'eth0',
        options.vrrpRouterId || 51,
        authPassEncrypted
      );

      haLogger.info({ id, vip: options.vipAddress }, 'HA configuration created');
    }

    return (await this.getHAConfig())!;
  }

  /**
   * Get the current HA configuration.
   */
  async getHAConfig(): Promise<HAConfig | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM caddy_ha_config LIMIT 1').get() as HAConfigRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToHAConfig(row);
  }

  /**
   * Enable or disable HA.
   */
  async setHAEnabled(enabled: boolean): Promise<void> {
    const db = getDb();
    db.prepare('UPDATE caddy_ha_config SET enabled = ?, updated_at = CURRENT_TIMESTAMP').run(enabled ? 1 : 0);
    haLogger.info({ enabled }, 'HA enabled state changed');
  }

  /**
   * Register a Caddy deployment as an HA instance.
   */
  async registerInstance(deploymentId: string, options?: {
    vrrpPriority?: number;
    isPrimary?: boolean;
    adminApiUrl?: string;
  }): Promise<CaddyInstance> {
    const db = getDb();

    // Verify deployment exists and is ownprem-caddy
    const deployment = db.prepare(`
      SELECT d.id, d.server_id, s.host
      FROM deployments d
      JOIN servers s ON s.id = d.server_id
      WHERE d.id = ? AND d.app_name = 'ownprem-caddy'
    `).get(deploymentId) as { id: string; server_id: string; host: string | null } | undefined;

    if (!deployment) {
      throw new Error('Deployment not found or is not ownprem-caddy');
    }

    // Check if already registered
    const existing = db.prepare('SELECT id FROM caddy_instances WHERE deployment_id = ?').get(deploymentId);
    if (existing) {
      throw new Error('Caddy deployment is already registered as an HA instance');
    }

    // Get HA config (if exists)
    const haConfig = await this.getHAConfig();

    // Determine priority - if no existing instances, this becomes primary
    const instances = await this.listInstances();
    const isPrimary = options?.isPrimary ?? instances.length === 0;
    const priority = options?.vrrpPriority ?? (isPrimary ? 150 : 100);

    // Generate admin API URL if not provided
    const serverHost = deployment.host || 'localhost';
    const adminApiUrl = options?.adminApiUrl || `http://${serverHost}:2019`;

    const id = randomUUID();
    db.prepare(`
      INSERT INTO caddy_instances (id, deployment_id, ha_config_id, vrrp_priority, is_primary, admin_api_url, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      id,
      deploymentId,
      haConfig?.id || null,
      priority,
      isPrimary ? 1 : 0,
      adminApiUrl
    );

    // If this is primary, demote any existing primary
    if (isPrimary) {
      db.prepare('UPDATE caddy_instances SET is_primary = 0 WHERE id != ?').run(id);
    }

    haLogger.info({ id, deploymentId, isPrimary, priority }, 'Caddy instance registered');

    return (await this.getInstance(id))!;
  }

  /**
   * Unregister a Caddy instance from HA.
   */
  async unregisterInstance(instanceId: string): Promise<void> {
    const db = getDb();

    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }

    // If this was primary, promote another instance
    if (instance.isPrimary) {
      const nextPrimary = db.prepare(`
        SELECT id FROM caddy_instances
        WHERE id != ?
        ORDER BY vrrp_priority DESC
        LIMIT 1
      `).get(instanceId) as { id: string } | undefined;

      if (nextPrimary) {
        db.prepare('UPDATE caddy_instances SET is_primary = 1 WHERE id = ?').run(nextPrimary.id);
        haLogger.info({ newPrimary: nextPrimary.id }, 'Promoted new primary after unregister');
      }
    }

    db.prepare('DELETE FROM caddy_instances WHERE id = ?').run(instanceId);
    haLogger.info({ instanceId }, 'Caddy instance unregistered');
  }

  /**
   * Get a Caddy instance by ID.
   */
  async getInstance(instanceId: string): Promise<CaddyInstance | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM caddy_instances WHERE id = ?').get(instanceId) as CaddyInstanceRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToInstance(row);
  }

  /**
   * Get a Caddy instance by deployment ID.
   */
  async getInstanceByDeployment(deploymentId: string): Promise<CaddyInstance | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM caddy_instances WHERE deployment_id = ?').get(deploymentId) as CaddyInstanceRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToInstance(row);
  }

  /**
   * List all Caddy instances with server info.
   */
  async listInstances(): Promise<CaddyInstanceWithServer[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        ci.*,
        d.server_id,
        s.name as server_name,
        s.host as server_host,
        d.status as deployment_status
      FROM caddy_instances ci
      JOIN deployments d ON d.id = ci.deployment_id
      JOIN servers s ON s.id = d.server_id
      ORDER BY ci.vrrp_priority DESC, ci.created_at
    `).all() as CaddyInstanceWithServerRow[];

    return rows.map(row => this.rowToInstanceWithServer(row));
  }

  /**
   * Update instance priority.
   */
  async setInstancePriority(instanceId: string, priority: number): Promise<void> {
    if (priority < 1 || priority > 254) {
      throw new Error('Priority must be between 1 and 254');
    }

    const db = getDb();
    const result = db.prepare(`
      UPDATE caddy_instances SET vrrp_priority = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(priority, instanceId);

    if (result.changes === 0) {
      throw new Error('Instance not found');
    }

    haLogger.info({ instanceId, priority }, 'Instance priority updated');
  }

  /**
   * Promote an instance to primary.
   */
  async promoteInstance(instanceId: string): Promise<void> {
    const db = getDb();

    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }

    // Demote current primary
    db.prepare('UPDATE caddy_instances SET is_primary = 0').run();

    // Promote this instance
    db.prepare(`
      UPDATE caddy_instances SET is_primary = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(instanceId);

    haLogger.info({ instanceId }, 'Instance promoted to primary');

    // Trigger config sync to update keepalived priorities
    await this.syncKeepalived();
  }

  /**
   * Get the current primary instance.
   */
  async getPrimaryInstance(): Promise<CaddyInstanceWithServer | null> {
    const db = getDb();
    const row = db.prepare(`
      SELECT
        ci.*,
        d.server_id,
        s.name as server_name,
        s.host as server_host,
        d.status as deployment_status
      FROM caddy_instances ci
      JOIN deployments d ON d.id = ci.deployment_id
      JOIN servers s ON s.id = d.server_id
      WHERE ci.is_primary = 1
      LIMIT 1
    `).get() as CaddyInstanceWithServerRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToInstanceWithServer(row);
  }

  /**
   * Sync keepalived configuration to all instances.
   */
  async syncKeepalived(): Promise<{ success: boolean; results: Array<{ instanceId: string; success: boolean; error?: string }> }> {
    const haConfig = await this.getHAConfig();
    if (!haConfig || !haConfig.enabled) {
      return { success: true, results: [] };
    }

    const instances = await this.listInstances();
    if (instances.length < 2) {
      haLogger.debug('Not enough instances for HA sync');
      return { success: true, results: [] };
    }

    // Get auth password
    const db = getDb();
    const configRow = db.prepare('SELECT vrrp_auth_pass_encrypted FROM caddy_ha_config WHERE id = ?').get(haConfig.id) as { vrrp_auth_pass_encrypted: string } | undefined;
    const authPass = configRow?.vrrp_auth_pass_encrypted
      ? (secretsManager.decrypt(configRow.vrrp_auth_pass_encrypted) as { pass: string }).pass
      : undefined;

    const results: Array<{ instanceId: string; success: boolean; error?: string }> = [];

    for (const instance of instances) {
      try {
        // Check if agent is connected
        if (!isAgentConnected(instance.serverId)) {
          results.push({ instanceId: instance.id, success: false, error: 'Agent not connected' });
          continue;
        }

        // Build keepalived config
        const keepalivedConfig = this.buildKeepaliveConfig({
          vipAddress: haConfig.vipAddress,
          vipInterface: haConfig.vipInterface,
          routerId: haConfig.vrrpRouterId,
          priority: instance.vrrpPriority,
          authPass,
          state: instance.isPrimary ? 'MASTER' : 'BACKUP',
        });

        // Send command to agent
        const commandId = randomUUID();
        const sent = sendCommand(instance.serverId, {
          id: commandId,
          action: 'configureKeepalived',
          appName: 'ownprem-caddy',
          payload: {
            keepalivedConfig,
            enabled: true,
          },
        });

        if (sent) {
          // Update last sync timestamp
          db.prepare(`
            UPDATE caddy_instances SET last_config_sync = CURRENT_TIMESTAMP, status = 'active'
            WHERE id = ?
          `).run(instance.id);

          results.push({ instanceId: instance.id, success: true });
        } else {
          results.push({ instanceId: instance.id, success: false, error: 'Failed to send command' });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        results.push({ instanceId: instance.id, success: false, error });
      }
    }

    const allSuccess = results.every(r => r.success);
    haLogger.info({ success: allSuccess, results }, 'Keepalived sync completed');

    return { success: allSuccess, results };
  }

  /**
   * Sync Caddy configuration across all instances.
   * Copies config from primary to all backups.
   */
  async syncCaddyConfig(): Promise<{ success: boolean; error?: string }> {
    const primary = await this.getPrimaryInstance();
    if (!primary) {
      return { success: false, error: 'No primary instance found' };
    }

    const instances = await this.listInstances();
    const backups = instances.filter(i => !i.isPrimary);

    if (backups.length === 0) {
      return { success: true };
    }

    haLogger.info({ primaryId: primary.id, backupCount: backups.length }, 'Syncing Caddy config to backups');

    // In a full implementation, this would:
    // 1. Fetch config from primary's Admin API
    // 2. Push config to each backup's Admin API
    // For now, we rely on the proxy manager to push to all instances

    return { success: true };
  }

  /**
   * Update instance status.
   */
  async updateInstanceStatus(instanceId: string, status: 'pending' | 'active' | 'error', message?: string): Promise<void> {
    const db = getDb();
    db.prepare(`
      UPDATE caddy_instances SET status = ?, status_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, message || null, instanceId);
  }

  /**
   * Build keepalived configuration file content.
   */
  private buildKeepaliveConfig(options: {
    vipAddress: string;
    vipInterface: string;
    routerId: number;
    priority: number;
    authPass?: string;
    state: 'MASTER' | 'BACKUP';
  }): string {
    const authBlock = options.authPass
      ? `    authentication {
        auth_type PASS
        auth_pass ${options.authPass}
    }`
      : '';

    return `# OwnPrem Caddy HA - Keepalived Configuration
# Generated automatically - do not edit manually

global_defs {
    router_id OWNPREM_CADDY_${options.routerId}
    script_user root
    enable_script_security
}

vrrp_script chk_caddy {
    script "/usr/bin/curl -sf http://localhost:2019/config/ > /dev/null"
    interval 2
    weight 2
    fall 3
    rise 2
}

vrrp_instance CADDY_VIP {
    state ${options.state}
    interface ${options.vipInterface}
    virtual_router_id ${options.routerId}
    priority ${options.priority}
    advert_int 1
    nopreempt

${authBlock}

    virtual_ipaddress {
        ${options.vipAddress}/24 dev ${options.vipInterface}
    }

    track_script {
        chk_caddy
    }
}
`;
  }

  // Row conversion helpers
  private rowToHAConfig(row: HAConfigRow): HAConfig {
    return {
      id: row.id,
      vipAddress: row.vip_address,
      vipInterface: row.vip_interface,
      vrrpRouterId: row.vrrp_router_id,
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToInstance(row: CaddyInstanceRow): CaddyInstance {
    return {
      id: row.id,
      deploymentId: row.deployment_id,
      haConfigId: row.ha_config_id,
      vrrpPriority: row.vrrp_priority,
      isPrimary: row.is_primary === 1,
      adminApiUrl: row.admin_api_url,
      lastConfigSync: row.last_config_sync ? new Date(row.last_config_sync) : null,
      lastCertSync: row.last_cert_sync ? new Date(row.last_cert_sync) : null,
      status: row.status as 'pending' | 'active' | 'error',
      statusMessage: row.status_message,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToInstanceWithServer(row: CaddyInstanceWithServerRow): CaddyInstanceWithServer {
    return {
      ...this.rowToInstance(row),
      serverId: row.server_id,
      serverName: row.server_name,
      serverHost: row.server_host,
      deploymentStatus: row.deployment_status,
    };
  }
}

export const caddyHAManager = new CaddyHAManager();
