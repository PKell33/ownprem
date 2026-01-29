import { getDb } from '../db/index.js';
import { secretsManager } from './secretsManager.js';
import { deployer } from './deployer.js';
import { auditService } from './auditService.js';
import { configRenderer } from './configRenderer.js';
import { sendCommand, isAgentConnected } from '../websocket/agentHandler.js';
import { v4 as uuidv4 } from 'uuid';
import type { AppManifest } from '@ownprem/shared';

export interface RotationResult {
  deploymentId: string;
  rotatedFields: string[];
  success: boolean;
  error?: string;
}

interface AppRegistryRow {
  name: string;
  manifest: string;
}

interface DeploymentRow {
  id: string;
  server_id: string;
  app_name: string;
  version: string;
  config: string;
  status: string;
}

interface SecretsRow {
  deployment_id: string;
  data: string;
  created_at: string;
  updated_at: string;
  rotated_at: string | null;
}

class SecretsRotationService {
  /**
   * Rotate secrets for a deployment.
   * If fields is provided, only those fields are rotated.
   * Otherwise, all generated secret fields are rotated.
   */
  async rotateSecrets(
    deploymentId: string,
    fields?: string[],
    userId?: string
  ): Promise<RotationResult> {
    const db = getDb();

    // Get deployment
    const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as DeploymentRow | undefined;
    if (!deployment) {
      return {
        deploymentId,
        rotatedFields: [],
        success: false,
        error: 'Deployment not found',
      };
    }

    // Get app manifest
    const appRow = db.prepare('SELECT manifest FROM app_registry WHERE name = ?').get(deployment.app_name) as AppRegistryRow | undefined;
    if (!appRow) {
      return {
        deploymentId,
        rotatedFields: [],
        success: false,
        error: 'App manifest not found',
      };
    }
    const manifest = JSON.parse(appRow.manifest) as AppManifest;

    // Get current secrets
    const currentSecrets = await secretsManager.getSecrets(deploymentId);
    if (!currentSecrets) {
      return {
        deploymentId,
        rotatedFields: [],
        success: false,
        error: 'No secrets found for deployment',
      };
    }

    // Determine which fields to rotate
    const fieldsToRotate: string[] = [];
    for (const field of manifest.configSchema) {
      if (field.generated && field.secret) {
        // If specific fields requested, only rotate those
        if (fields && fields.length > 0) {
          if (fields.includes(field.name)) {
            fieldsToRotate.push(field.name);
          }
        } else {
          // Rotate all generated secrets
          fieldsToRotate.push(field.name);
        }
      }
    }

    if (fieldsToRotate.length === 0) {
      return {
        deploymentId,
        rotatedFields: [],
        success: false,
        error: fields && fields.length > 0
          ? 'No matching generated secret fields found'
          : 'No generated secrets found for this app',
      };
    }

    // Generate new secrets for the fields to rotate
    const newSecrets = { ...currentSecrets };
    for (const fieldName of fieldsToRotate) {
      const field = manifest.configSchema.find(f => f.name === fieldName);
      if (field) {
        if (field.type === 'password') {
          newSecrets[fieldName] = secretsManager.generatePassword();
        } else if (fieldName.toLowerCase().includes('user')) {
          newSecrets[fieldName] = secretsManager.generateUsername(deployment.app_name);
        } else {
          newSecrets[fieldName] = secretsManager.generatePassword(16);
        }
      }
    }

    // Store updated secrets with rotated_at timestamp
    db.prepare(`
      UPDATE secrets
      SET data = ?, updated_at = CURRENT_TIMESTAMP, rotated_at = CURRENT_TIMESTAMP
      WHERE deployment_id = ?
    `).run(secretsManager.encrypt(newSecrets), deploymentId);

    // Audit log the rotation
    auditService.log({
      userId,
      action: 'secrets_rotated',
      resourceType: 'deployment',
      resourceId: deploymentId,
      details: {
        appName: deployment.app_name,
        serverId: deployment.server_id,
        rotatedFields: fieldsToRotate,
      },
    });

    return {
      deploymentId,
      rotatedFields: fieldsToRotate,
      success: true,
    };
  }

  /**
   * Rotate secrets and reconfigure the deployment with new config files.
   */
  async rotateAndReconfigure(
    deploymentId: string,
    fields?: string[],
    userId?: string
  ): Promise<RotationResult> {
    const db = getDb();

    // Get deployment
    const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as DeploymentRow | undefined;
    if (!deployment) {
      return {
        deploymentId,
        rotatedFields: [],
        success: false,
        error: 'Deployment not found',
      };
    }

    // Check if agent is connected
    if (!isAgentConnected(deployment.server_id)) {
      return {
        deploymentId,
        rotatedFields: [],
        success: false,
        error: `Server ${deployment.server_id} is not connected`,
      };
    }

    // Check if deployment is in a state where we can reconfigure
    if (!['stopped', 'running', 'error'].includes(deployment.status)) {
      return {
        deploymentId,
        rotatedFields: [],
        success: false,
        error: `Cannot rotate secrets while deployment is in '${deployment.status}' state`,
      };
    }

    // Rotate the secrets
    const rotationResult = await this.rotateSecrets(deploymentId, fields, userId);
    if (!rotationResult.success) {
      return rotationResult;
    }

    // Get app manifest
    const appRow = db.prepare('SELECT manifest FROM app_registry WHERE name = ?').get(deployment.app_name) as AppRegistryRow | undefined;
    if (!appRow) {
      return {
        deploymentId,
        rotatedFields: rotationResult.rotatedFields,
        success: false,
        error: 'App manifest not found',
      };
    }
    const manifest = JSON.parse(appRow.manifest) as AppManifest;

    // Get updated secrets
    const secrets = await secretsManager.getSecrets(deploymentId);
    if (!secrets) {
      return {
        deploymentId,
        rotatedFields: rotationResult.rotatedFields,
        success: false,
        error: 'Failed to retrieve updated secrets',
      };
    }

    // Render config files with new secrets
    const config = JSON.parse(deployment.config);
    const configFiles = await configRenderer.renderAppConfigs(manifest, config, secrets);

    // Update deployment status
    db.prepare(`
      UPDATE deployments SET status = 'configuring', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(deploymentId);

    // Send configure command to agent
    const commandId = uuidv4();
    const sent = sendCommand(deployment.server_id, {
      id: commandId,
      action: 'configure',
      appName: deployment.app_name,
      payload: {
        files: configFiles,
      },
    }, deploymentId);

    if (!sent) {
      // Revert status
      db.prepare(`
        UPDATE deployments SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(deployment.status, deploymentId);

      return {
        deploymentId,
        rotatedFields: rotationResult.rotatedFields,
        success: false,
        error: 'Failed to send configure command to agent',
      };
    }

    return {
      deploymentId,
      rotatedFields: rotationResult.rotatedFields,
      success: true,
    };
  }

  /**
   * Check if secrets need rotation based on age policy.
   */
  async checkRotationNeeded(deploymentId: string, maxAgeDays: number): Promise<boolean> {
    const db = getDb();

    const row = db.prepare(`
      SELECT rotated_at, updated_at, created_at
      FROM secrets
      WHERE deployment_id = ?
    `).get(deploymentId) as SecretsRow | undefined;

    if (!row) {
      return false;
    }

    // Use rotated_at if available, otherwise fall back to updated_at or created_at
    const lastRotation = row.rotated_at || row.updated_at || row.created_at;
    const lastRotationDate = new Date(lastRotation);
    const now = new Date();
    const ageMs = now.getTime() - lastRotationDate.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    return ageDays > maxAgeDays;
  }

  /**
   * Get the last rotation timestamp for a deployment's secrets.
   */
  async getLastRotation(deploymentId: string): Promise<Date | null> {
    const db = getDb();

    const row = db.prepare(`
      SELECT rotated_at, updated_at, created_at
      FROM secrets
      WHERE deployment_id = ?
    `).get(deploymentId) as SecretsRow | undefined;

    if (!row) {
      return null;
    }

    const lastRotation = row.rotated_at || row.updated_at || row.created_at;
    return new Date(lastRotation);
  }
}

export const secretsRotationService = new SecretsRotationService();
