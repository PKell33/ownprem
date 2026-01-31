import { v4 as uuidv4 } from 'uuid';
import { readFile } from 'fs/promises';
import { ErrorCodes } from '@ownprem/shared';
import { getDb, runInTransaction } from '../db/index.js';
import { secretsManager } from './secretsManager.js';
import { configRenderer } from './configRenderer.js';
import { serviceRegistry } from './serviceRegistry.js';
import { dependencyResolver } from './dependencyResolver.js';
import { proxyManager } from './proxyManager.js';
import { caddyHAManager } from './caddyHAManager.js';
import { sendCommand, sendCommandAndWait, requireAgentConnected } from '../websocket/agentHandler.js';
import { mutexManager } from '../lib/mutexManager.js';
import logger from '../lib/logger.js';
import { setDeploymentStatus, updateDeploymentStatus } from '../lib/deploymentHelpers.js';
import { auditService } from './auditService.js';
import { getAppInfo, checkCanUninstall, validateInstall } from './deploymentValidator.js';
import { startDeployment, stopDeployment, restartDeployment } from './deploymentLifecycle.js';
import { createTypedError, Errors } from '../api/middleware/error.js';
import type { AppManifest, Deployment, DeploymentStatus, ConfigFile } from '@ownprem/shared';

// CA certificate paths to check (in order of preference)
const CA_CERT_PATHS = [
  '/etc/step-ca/root_ca.crt',           // Step-CA root (preferred)
  '/etc/caddy/ca-root.crt',             // Copied step-ca root
  '/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt',  // Caddy internal CA
];

// Type for compensating transactions (rollback functions)
type CompensationFn = () => Promise<void>;

interface DeploymentRow {
  id: string;
  server_id: string;
  app_name: string;
  group_id: string | null;
  version: string;
  config: string;
  status: string;
  status_message: string | null;
  tor_addresses: string | null;
  installed_at: string;
  updated_at: string;
}

interface AppRegistryRow {
  name: string;
  manifest: string;
  system: number;
  mandatory: number;
  singleton: number;
}

interface ServerRow {
  id: string;
  host: string | null;
  is_core: number;
}

export class Deployer {
  async install(
    serverId: string,
    appName: string,
    userConfig: Record<string, unknown> = {},
    version?: string,
    groupId?: string,
    serviceBindings?: Record<string, string>
  ): Promise<Deployment> {
    // Use server-level mutex to prevent concurrent installations of the same app
    // This prevents race conditions where two install() calls could both pass
    // validation before either inserts the deployment record
    return mutexManager.withServerLock(serverId, async () => {
      return this.installWithinLock(serverId, appName, userConfig, version, groupId, serviceBindings);
    });
  }

  private async installWithinLock(
    serverId: string,
    appName: string,
    userConfig: Record<string, unknown> = {},
    version?: string,
    groupId?: string,
    _serviceBindings?: Record<string, string>
  ): Promise<Deployment> {
    const db = getDb();

    // Check if agent is connected
    requireAgentConnected(serverId);

    // Run all pre-install validations
    const { appInfo } = await validateInstall(serverId, appName);
    const manifest = appInfo.manifest;

    // Resolve full config (user config + dependencies + defaults)
    const resolvedConfig = await dependencyResolver.resolve(manifest, serverId, userConfig);

    // Generate secrets for fields marked as generated
    const secrets = this.generateSecrets(manifest, appName);

    // Create deployment record
    const deploymentId = uuidv4();
    const appVersion = version || manifest.version;
    const finalGroupId = groupId || 'default';

    // Get server info for config rendering
    const server = db.prepare('SELECT host, is_core FROM servers WHERE id = ?').get(serverId) as ServerRow;
    const serverHost = server.is_core ? '127.0.0.1' : (server.host || '127.0.0.1');

    // Compensating transactions for rollback on failure
    const compensations: CompensationFn[] = [];

    const rollback = async (error: Error): Promise<never> => {
      logger.error({ deploymentId, appName, err: error }, 'Install failed, rolling back');
      for (const compensate of compensations.reverse()) {
        try {
          await compensate();
        } catch (compensationError) {
          logger.error({ deploymentId, err: compensationError }, 'Compensation failed during rollback');
        }
      }
      throw error;
    };

    try {
      // Step 1: Create deployment record and secrets
      this.createDeploymentRecord(db, deploymentId, serverId, appName, finalGroupId, appVersion, resolvedConfig, secrets);
      compensations.push(async () => {
        logger.debug({ deploymentId }, 'Rolling back: deleting deployment and secrets');
        runInTransaction(() => {
          secretsManager.deleteSecretsSync(deploymentId);
          db.prepare('DELETE FROM deployments WHERE id = ?').run(deploymentId);
        });
      });

      // Step 2: Render config files and prepare agent payload
      const configFiles = await this.renderAppConfiguration(manifest, appName, deploymentId, resolvedConfig, secrets);
      const { env, metadata } = this.buildInstallPayload(manifest, appName, appVersion, serverId, resolvedConfig, secrets);

      // Step 3: Execute install on agent
      await this.executeInstallOnAgent(serverId, appName, deploymentId, appVersion, configFiles, env, metadata);

      // Step 4: Register services and routes
      const hasRegisteredServices = await this.registerDeploymentRoutes(
        deploymentId, manifest, serverId, serverHost, compensations
      );

      // Step 5: Update Caddy config and reload
      const caddySuccess = await proxyManager.updateAndReload();
      if (!caddySuccess) {
        throw createTypedError(ErrorCodes.CADDY_UPDATE_FAILED, 'Failed to update Caddy configuration');
      }

      // Audit log
      auditService.log({
        action: 'deployment_installed',
        resourceType: 'deployment',
        resourceId: deploymentId,
        details: { appName, serverId, version: appVersion },
      });

      // Step 6: Handle Caddy-specific HA registration
      await this.handleCaddyHARegistration(appName, deploymentId, 'register', serverHost);

      return (await this.getDeployment(deploymentId))!;
    } catch (error) {
      return rollback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate secrets for fields marked as generated in the manifest.
   */
  private generateSecrets(manifest: AppManifest, appName: string): Record<string, string> {
    const secrets: Record<string, string> = {};
    for (const field of manifest.configSchema) {
      if (field.generated && field.secret) {
        if (field.type === 'password') {
          secrets[field.name] = secretsManager.generatePassword();
        } else if (field.name.toLowerCase().includes('user')) {
          secrets[field.name] = secretsManager.generateUsername(appName);
        } else {
          secrets[field.name] = secretsManager.generatePassword(16);
        }
      }
    }
    return secrets;
  }

  /**
   * Create deployment record and store secrets in a single transaction.
   */
  private createDeploymentRecord(
    db: ReturnType<typeof getDb>,
    deploymentId: string,
    serverId: string,
    appName: string,
    groupId: string,
    version: string,
    config: Record<string, unknown>,
    secrets: Record<string, string>
  ): void {
    runInTransaction(() => {
      db.prepare(`
        INSERT INTO deployments (id, server_id, app_name, group_id, version, config, status, installed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'installing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(deploymentId, serverId, appName, groupId, version, JSON.stringify(config));

      if (Object.keys(secrets).length > 0) {
        secretsManager.storeSecretsSync(deploymentId, secrets);
      }
    });
  }

  /**
   * Render all configuration files for the app including scripts and certificates.
   */
  private async renderAppConfiguration(
    manifest: AppManifest,
    appName: string,
    deploymentId: string,
    resolvedConfig: Record<string, unknown>,
    secrets: Record<string, string>
  ): Promise<ConfigFile[]> {
    const configFiles = await configRenderer.renderAppConfigs(manifest, resolvedConfig, secrets);

    // Add lifecycle scripts using array pattern to reduce repetition
    const scripts = [
      configRenderer.renderInstallScript(manifest, resolvedConfig),
      configRenderer.renderConfigureScript(manifest),
      configRenderer.renderUninstallScript(manifest),
      configRenderer.renderStartScript(manifest),
      configRenderer.renderStopScript(manifest),
    ];
    configFiles.push(...scripts.filter((s): s is ConfigFile => s !== null));

    // For Caddy deployments, include the CA root certificate
    if (appName === 'ownprem-caddy') {
      const caCert = await this.getCACertificate();
      if (caCert) {
        configFiles.push({
          path: '/etc/caddy/ca-root.crt',
          content: caCert,
          mode: '0644',
        });
        logger.info({ deploymentId }, 'Including CA root certificate for Caddy deployment');
      }
    }

    return configFiles;
  }

  /**
   * Build environment variables and metadata for the install command.
   */
  private buildInstallPayload(
    manifest: AppManifest,
    appName: string,
    appVersion: string,
    serverId: string,
    resolvedConfig: Record<string, unknown>,
    secrets: Record<string, string>
  ): { env: Record<string, string>; metadata: Record<string, unknown> } {
    const env: Record<string, string> = {
      SERVER_ID: serverId,
      APP_NAME: appName,
      APP_VERSION: appVersion,
    };

    // Add non-secret config to env
    for (const [key, value] of Object.entries(resolvedConfig)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        env[key.toUpperCase()] = String(value);
      }
    }

    // Add secrets to env
    for (const [key, value] of Object.entries(secrets)) {
      env[key.toUpperCase()] = value;
    }

    const metadata: Record<string, unknown> = {
      name: appName,
      displayName: manifest.displayName,
      version: appVersion,
      serviceName: manifest.logging?.serviceName || appName,
      serviceUser: manifest.serviceUser,
      serviceGroup: manifest.serviceGroup || manifest.serviceUser,
      dataDirectories: manifest.dataDirectories,
      capabilities: manifest.capabilities,
    };

    return { env, metadata };
  }

  /**
   * Send install command to agent and wait for completion.
   */
  private async executeInstallOnAgent(
    serverId: string,
    appName: string,
    deploymentId: string,
    appVersion: string,
    configFiles: ConfigFile[],
    env: Record<string, string>,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const commandId = uuidv4();
    logger.info({ deploymentId, appName, serverId }, 'Sending install command to agent');

    let installResult;
    try {
      installResult = await sendCommandAndWait(serverId, {
        id: commandId,
        action: 'install',
        appName,
        payload: {
          version: appVersion,
          files: configFiles,
          env,
          metadata,
        },
      }, deploymentId);
    } catch (err) {
      throw createTypedError(
        ErrorCodes.COMMAND_FAILED,
        `Install command failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (installResult.status !== 'success') {
      throw createTypedError(
        ErrorCodes.COMMAND_FAILED,
        `Install failed on agent: ${installResult.message || 'Unknown error'}`
      );
    }

    logger.info({ deploymentId, appName }, 'Install command completed successfully');
  }

  /**
   * Register services and proxy routes for the deployment.
   * Returns true if any services were registered.
   */
  private async registerDeploymentRoutes(
    deploymentId: string,
    manifest: AppManifest,
    serverId: string,
    serverHost: string,
    compensations: CompensationFn[]
  ): Promise<boolean> {
    // Register services and their proxy routes
    const registeredServiceIds: string[] = [];
    for (const serviceDef of manifest.provides || []) {
      const service = await serviceRegistry.registerService(deploymentId, serviceDef.name, serverId, serviceDef.port);
      registeredServiceIds.push(service.id);

      await proxyManager.registerServiceRoute(
        service.id,
        serviceDef.name,
        serviceDef,
        serverHost,
        serviceDef.port
      );
    }

    if (registeredServiceIds.length > 0) {
      compensations.push(async () => {
        logger.debug({ deploymentId }, 'Rolling back: unregistering services and routes');
        await proxyManager.unregisterServiceRoutesByDeployment(deploymentId);
        serviceRegistry.unregisterServicesSync(deploymentId);
      });
    }

    // Register web UI route if enabled
    if (manifest.webui?.enabled) {
      await proxyManager.registerRoute(deploymentId, manifest, serverHost);
      compensations.push(async () => {
        logger.debug({ deploymentId }, 'Rolling back: unregistering web UI route');
        await proxyManager.unregisterRoute(deploymentId);
      });
    }

    return registeredServiceIds.length > 0 || !!manifest.webui?.enabled;
  }

  /**
   * Handle Caddy HA manager registration/unregistration.
   * This is a best-effort operation - failures don't fail the deployment.
   * @param serverHost - Required for 'register', not needed for 'unregister'
   */
  private async handleCaddyHARegistration(
    appName: string,
    deploymentId: string,
    action: 'register' | 'unregister',
    serverHost?: string
  ): Promise<void> {
    if (appName !== 'ownprem-caddy') {
      return;
    }

    try {
      if (action === 'register') {
        if (!serverHost) {
          logger.warn({ deploymentId }, 'Cannot register Caddy instance: serverHost not provided');
          return;
        }
        await caddyHAManager.registerInstance(deploymentId, {
          adminApiUrl: `http://${serverHost}:2019`,
        });
        logger.info({ deploymentId }, 'Auto-registered Caddy instance with HA manager');
      } else {
        const instance = await caddyHAManager.getInstanceByDeployment(deploymentId);
        if (instance) {
          await caddyHAManager.unregisterInstance(instance.id);
          logger.info({ deploymentId }, 'Unregistered Caddy instance from HA manager');
        }
      }
    } catch (err) {
      logger.warn({ deploymentId, err }, `Failed to ${action} Caddy instance with HA manager`);
    }
  }

  async configure(deploymentId: string, newConfig: Record<string, unknown>): Promise<Deployment> {
    const db = getDb();
    const deployment = await this.getDeployment(deploymentId);

    if (!deployment) {
      throw Errors.deploymentNotFound(deploymentId);
    }

    requireAgentConnected(deployment.serverId);

    // Get manifest
    const appRow = db.prepare('SELECT manifest FROM app_registry WHERE name = ?').get(deployment.appName) as AppRegistryRow;
    let manifest: AppManifest;
    try {
      manifest = JSON.parse(appRow.manifest) as AppManifest;
    } catch (e) {
      throw createTypedError(
        ErrorCodes.INVALID_CONFIG,
        `Failed to parse manifest for app ${deployment.appName}: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    // Merge config
    const mergedConfig = { ...deployment.config, ...newConfig };

    // Get secrets
    const secrets = await secretsManager.getSecrets(deploymentId) || {};

    // Render config files
    const configFiles = await configRenderer.renderAppConfigs(manifest, mergedConfig, secrets);

    // Update deployment
    db.prepare(`
      UPDATE deployments SET config = ?, status = 'configuring', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(mergedConfig), deploymentId);

    // Send configure command
    const commandId = uuidv4();
    sendCommand(deployment.serverId, {
      id: commandId,
      action: 'configure',
      appName: deployment.appName,
      payload: {
        files: configFiles,
      },
    }, deploymentId);

    return (await this.getDeployment(deploymentId))!;
  }

  async start(deploymentId: string): Promise<Deployment> {
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      throw Errors.deploymentNotFound(deploymentId);
    }
    return startDeployment(deployment, this.getDeployment.bind(this));
  }

  async stop(deploymentId: string): Promise<Deployment> {
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      throw Errors.deploymentNotFound(deploymentId);
    }
    return stopDeployment(deployment, this.getDeployment.bind(this));
  }

  async restart(deploymentId: string): Promise<Deployment> {
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      throw Errors.deploymentNotFound(deploymentId);
    }
    return restartDeployment(deployment);
  }

  async uninstall(deploymentId: string): Promise<void> {
    const deployment = await this.getDeployment(deploymentId);
    if (!deployment) {
      throw Errors.deploymentNotFound(deploymentId);
    }

    requireAgentConnected(deployment.serverId);

    const db = getDb();
    const previousStatus = deployment.status;

    // Check if this is a mandatory app on the core server
    checkCanUninstall(deployment.appName, deployment.serverId);

    // Update status to uninstalling first
    setDeploymentStatus(deploymentId, 'uninstalling');

    try {
      // Send uninstall command and wait for completion before cleaning up DB
      // This prevents race conditions where DB is cleaned before agent finishes
      const commandId = uuidv4();
      try {
        await sendCommandAndWait(deployment.serverId, {
          id: commandId,
          action: 'uninstall',
          appName: deployment.appName,
        }, deploymentId);
        logger.info({ deploymentId, appName: deployment.appName }, 'Uninstall command completed');
      } catch (cmdErr) {
        // Log but continue with cleanup - the app files may already be partially removed
        // and we need to clean up routes/DB to avoid orphaned records
        logger.warn({ deploymentId, err: cmdErr }, 'Uninstall command failed, continuing with cleanup');
      }

      // Remove proxy routes (DB operations, done before transaction to use async proxyManager)
      await proxyManager.unregisterRoute(deploymentId);
      await proxyManager.unregisterServiceRoutesByDeployment(deploymentId);

      // Unregister Caddy instance from HA manager if this is a Caddy deployment
      await this.handleCaddyHARegistration(deployment.appName, deploymentId, 'unregister');

      // Atomic transaction: services + secrets + deployment deletion
      runInTransaction(() => {
        // Remove services
        serviceRegistry.unregisterServicesSync(deploymentId);

        // Delete secrets
        secretsManager.deleteSecretsSync(deploymentId);

        // Delete deployment record
        db.prepare('DELETE FROM deployments WHERE id = ?').run(deploymentId);
      });

      // Clean up deployment mutex to prevent memory leak
      mutexManager.cleanupDeploymentMutex(deploymentId);

      // Update Caddy config and reload (external operation, outside transaction)
      await proxyManager.updateAndReload();
    } catch (err) {
      // Rollback: restore previous status on failure
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ deploymentId, err }, 'Uninstall failed, rolling back status');
      updateDeploymentStatus(deploymentId, 'error', `Uninstall failed: ${errorMessage}`);
      throw err;
    }

    auditService.log({
      action: 'deployment_uninstalled',
      resourceType: 'deployment',
      resourceId: deploymentId,
      details: { appName: deployment.appName, serverId: deployment.serverId },
    });
  }

  async getDeployment(deploymentId: string): Promise<Deployment | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as DeploymentRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToDeployment(row);
  }

  async listDeployments(serverId?: string): Promise<Deployment[]> {
    const db = getDb();
    let rows: DeploymentRow[];

    if (serverId) {
      rows = db.prepare('SELECT * FROM deployments WHERE server_id = ? ORDER BY app_name').all(serverId) as DeploymentRow[];
    } else {
      rows = db.prepare('SELECT * FROM deployments ORDER BY server_id, app_name').all() as DeploymentRow[];
    }

    return rows.map(row => this.rowToDeployment(row));
  }

  async updateStatus(deploymentId: string, status: DeploymentStatus, message?: string): Promise<void> {
    updateDeploymentStatus(deploymentId, status, message);
  }

  private rowToDeployment(row: DeploymentRow): Deployment {
    let config: Record<string, unknown>;
    let torAddresses: Record<string, string> | undefined;

    try {
      config = JSON.parse(row.config);
    } catch (e) {
      logger.error({ deploymentId: row.id, error: e }, 'Failed to parse deployment config JSON');
      config = {}; // Fallback to empty config
    }

    if (row.tor_addresses) {
      try {
        torAddresses = JSON.parse(row.tor_addresses);
      } catch (e) {
        logger.error({ deploymentId: row.id, error: e }, 'Failed to parse tor_addresses JSON');
        torAddresses = undefined;
      }
    }

    return {
      id: row.id,
      serverId: row.server_id,
      appName: row.app_name,
      groupId: row.group_id || undefined,
      version: row.version,
      config,
      status: row.status as DeploymentStatus,
      statusMessage: row.status_message || undefined,
      torAddresses,
      installedAt: new Date(row.installed_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get CA root certificate content for distribution to Caddy instances.
   * Returns null if no CA certificate is available.
   */
  private async getCACertificate(): Promise<string | null> {
    for (const certPath of CA_CERT_PATHS) {
      try {
        const content = await readFile(certPath, 'utf-8');
        logger.debug({ certPath }, 'Found CA certificate');
        return content;
      } catch {
        // Try next path
      }
    }
    logger.debug('No CA certificate found for distribution');
    return null;
  }
}

export const deployer = new Deployer();
