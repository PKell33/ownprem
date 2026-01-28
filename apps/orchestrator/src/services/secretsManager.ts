import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { getDb } from '../db/index.js';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

export class SecretsManager {
  private key: Buffer | null = null;

  private getKey(): Buffer {
    if (this.key) {
      return this.key;
    }

    const secretsKey = config.secrets.key;
    if (!secretsKey) {
      // Generate a random key for development
      console.warn('No SECRETS_KEY configured, using random key (secrets will not persist across restarts)');
      this.key = randomBytes(32);
      return this.key;
    }

    // Derive a key from the configured secret
    this.key = scryptSync(secretsKey, 'nodefoundry-secrets', 32);
    return this.key;
  }

  encrypt(data: Record<string, unknown>): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const plaintext = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // Format: iv:tag:encrypted (all base64)
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(encryptedData: string): Record<string, unknown> {
    const key = this.getKey();
    const [ivB64, tagB64, dataB64] = encryptedData.split(':');

    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  generatePassword(length: number = 32): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset[bytes[i] % charset.length];
    }
    return password;
  }

  generateUsername(prefix: string = 'user'): string {
    return `${prefix}_${randomBytes(4).toString('hex')}`;
  }

  async storeSecrets(deploymentId: string, secrets: Record<string, unknown>): Promise<void> {
    const db = getDb();
    const encrypted = this.encrypt(secrets);

    db.prepare(`
      INSERT INTO secrets (deployment_id, data, created_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(deployment_id) DO UPDATE SET
        data = excluded.data,
        updated_at = CURRENT_TIMESTAMP
    `).run(deploymentId, encrypted);
  }

  async getSecrets(deploymentId: string): Promise<Record<string, unknown> | null> {
    const db = getDb();
    const row = db.prepare('SELECT data FROM secrets WHERE deployment_id = ?').get(deploymentId) as { data: string } | undefined;

    if (!row) {
      return null;
    }

    return this.decrypt(row.data);
  }

  async deleteSecrets(deploymentId: string): Promise<void> {
    const db = getDb();
    db.prepare('DELETE FROM secrets WHERE deployment_id = ?').run(deploymentId);
  }

  async getServiceCredentials(deploymentId: string, fields: string[]): Promise<Record<string, string> | null> {
    const secrets = await this.getSecrets(deploymentId);
    if (!secrets) {
      return null;
    }

    const credentials: Record<string, string> = {};
    for (const field of fields) {
      if (secrets[field] !== undefined) {
        credentials[field] = String(secrets[field]);
      }
    }

    return Object.keys(credentials).length > 0 ? credentials : null;
  }
}

export const secretsManager = new SecretsManager();
