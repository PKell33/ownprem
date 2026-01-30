import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import { secretsManager } from './secretsManager.js';
import logger from '../lib/logger.js';

/**
 * Certificate Authority Service
 *
 * Manages certificates issued by the internal step-ca instance.
 * Handles issuing, renewal, revocation, and distribution of certificates.
 */

const caLogger = logger.child({ component: 'ca' });

// Types
export type CertificateType = 'server' | 'client' | 'ca';

export interface IssueCertificateOptions {
  name: string;
  type: CertificateType;
  commonName: string;
  sans?: string[];              // Subject Alternative Names (DNS names, IPs)
  validityHours?: number;       // Default from CA config
  issuedToServerId?: string;    // Server this cert is for
  issuedToDeploymentId?: string; // Deployment this cert is for
}

export interface Certificate {
  id: string;
  name: string;
  type: CertificateType;
  subjectCn: string;
  subjectSans: string[] | null;
  certPem: string;
  keyPem: string;               // Decrypted for delivery
  caCertPem: string;            // CA cert for trust chain
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  issuedToServerId: string | null;
  issuedToDeploymentId: string | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CertificateInfo {
  id: string;
  name: string;
  type: CertificateType;
  subjectCn: string;
  subjectSans: string[] | null;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  issuedToServerId: string | null;
  issuedToDeploymentId: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  expiresInDays: number;
}

interface CertificateRow {
  id: string;
  ca_deployment_id: string | null;
  name: string;
  type: string;
  subject_cn: string;
  subject_sans: string | null;
  cert_pem: string;
  key_encrypted: string;
  ca_cert_pem: string | null;
  serial_number: string;
  not_before: string;
  not_after: string;
  issued_to_server_id: string | null;
  issued_to_deployment_id: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  created_at: string;
}

interface CADeploymentInfo {
  deploymentId: string;
  serverId: string;
  serverHost: string;
  config: {
    ca_dns?: string;
    acme_enabled?: boolean;
  };
}

class CertificateAuthorityService {
  /**
   * Get the CA deployment info (finds ownprem-ca on core or specified server)
   */
  async getCADeployment(serverId?: string): Promise<CADeploymentInfo | null> {
    const db = getDb();

    const query = serverId
      ? `SELECT d.id, d.server_id, d.config, s.host
         FROM deployments d
         JOIN servers s ON s.id = d.server_id
         WHERE d.app_name = 'ownprem-ca' AND d.server_id = ? AND d.status = 'running'`
      : `SELECT d.id, d.server_id, d.config, s.host
         FROM deployments d
         JOIN servers s ON s.id = d.server_id
         WHERE d.app_name = 'ownprem-ca' AND d.status = 'running'
         ORDER BY s.is_core DESC
         LIMIT 1`;

    const row = serverId
      ? db.prepare(query).get(serverId) as { id: string; server_id: string; config: string; host: string } | undefined
      : db.prepare(query).get() as { id: string; server_id: string; config: string; host: string } | undefined;

    if (!row) {
      return null;
    }

    return {
      deploymentId: row.id,
      serverId: row.server_id,
      serverHost: row.host || 'localhost',
      config: JSON.parse(row.config || '{}'),
    };
  }

  /**
   * Get the CA's root certificate
   */
  async getCACertificate(caDeploymentId?: string): Promise<string | null> {
    const db = getDb();

    // First try to get from certificates table (CA's own cert)
    const query = caDeploymentId
      ? `SELECT cert_pem FROM certificates WHERE ca_deployment_id = ? AND type = 'ca' LIMIT 1`
      : `SELECT cert_pem FROM certificates WHERE type = 'ca' LIMIT 1`;

    const row = caDeploymentId
      ? db.prepare(query).get(caDeploymentId) as { cert_pem: string } | undefined
      : db.prepare(query).get() as { cert_pem: string } | undefined;

    if (row) {
      return row.cert_pem;
    }

    // If not in DB, try to read from step-ca config directory
    // This would be done via agent command in production
    caLogger.warn('CA certificate not found in database');
    return null;
  }

  /**
   * Issue a new certificate
   */
  async issueCertificate(options: IssueCertificateOptions): Promise<Certificate> {
    const caDeployment = await this.getCADeployment();
    if (!caDeployment) {
      throw new Error('No CA deployment found. Please install ownprem-ca first.');
    }

    const db = getDb();
    const id = randomUUID();
    const serialNumber = this.generateSerialNumber();

    // Calculate validity
    const validityHours = options.validityHours || 720; // Default 30 days
    const notBefore = new Date();
    const notAfter = new Date(notBefore.getTime() + validityHours * 60 * 60 * 1000);

    // Build SANs array
    const sans = options.sans || [];
    if (!sans.includes(options.commonName) && !options.commonName.includes(' ')) {
      sans.unshift(options.commonName);
    }

    caLogger.info({
      name: options.name,
      cn: options.commonName,
      sans,
      validityHours
    }, 'Issuing certificate');

    // Request certificate from step-ca
    // In production, this calls the step-ca API or uses the step CLI via agent
    const { certPem, keyPem } = await this.requestCertFromCA(
      caDeployment,
      options.commonName,
      sans,
      options.type,
      validityHours
    );

    // Get CA certificate for chain
    const caCertPem = await this.getCACertificate(caDeployment.deploymentId) || '';

    // Encrypt the private key before storage
    const keyEncrypted = secretsManager.encrypt({ key: keyPem });

    // Store in database
    db.prepare(`
      INSERT INTO certificates (
        id, ca_deployment_id, name, type, subject_cn, subject_sans,
        cert_pem, key_encrypted, ca_cert_pem, serial_number,
        not_before, not_after, issued_to_server_id, issued_to_deployment_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      caDeployment.deploymentId,
      options.name,
      options.type,
      options.commonName,
      sans.length > 0 ? JSON.stringify(sans) : null,
      certPem,
      keyEncrypted,
      caCertPem,
      serialNumber,
      notBefore.toISOString(),
      notAfter.toISOString(),
      options.issuedToServerId || null,
      options.issuedToDeploymentId || null
    );

    caLogger.info({ id, name: options.name, serialNumber }, 'Certificate issued');

    return {
      id,
      name: options.name,
      type: options.type,
      subjectCn: options.commonName,
      subjectSans: sans.length > 0 ? sans : null,
      certPem,
      keyPem,
      caCertPem,
      serialNumber,
      notBefore,
      notAfter,
      issuedToServerId: options.issuedToServerId || null,
      issuedToDeploymentId: options.issuedToDeploymentId || null,
      revokedAt: null,
      createdAt: new Date(),
    };
  }

  /**
   * Get a certificate by ID (with decrypted key)
   */
  async getCertificate(certId: string): Promise<Certificate | null> {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM certificates WHERE id = ?`).get(certId) as CertificateRow | undefined;

    if (!row) {
      return null;
    }

    // Decrypt the private key
    const decrypted = secretsManager.decrypt(row.key_encrypted) as { key: string };

    return this.rowToCertificate(row, decrypted.key);
  }

  /**
   * Get a certificate by name
   */
  async getCertificateByName(name: string): Promise<Certificate | null> {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM certificates WHERE name = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`)
      .get(name) as CertificateRow | undefined;

    if (!row) {
      return null;
    }

    const decrypted = secretsManager.decrypt(row.key_encrypted) as { key: string };
    return this.rowToCertificate(row, decrypted.key);
  }

  /**
   * List all certificates (without private keys)
   */
  async listCertificates(filters?: {
    type?: CertificateType;
    issuedToServerId?: string;
    includeRevoked?: boolean;
    expiringWithinDays?: number;
  }): Promise<CertificateInfo[]> {
    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.type) {
      conditions.push('type = ?');
      params.push(filters.type);
    }
    if (filters?.issuedToServerId) {
      conditions.push('issued_to_server_id = ?');
      params.push(filters.issuedToServerId);
    }
    if (!filters?.includeRevoked) {
      conditions.push('revoked_at IS NULL');
    }
    if (filters?.expiringWithinDays) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + filters.expiringWithinDays);
      conditions.push('not_after <= ?');
      params.push(expiryDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM certificates ${whereClause} ORDER BY not_after ASC`)
      .all(...params) as CertificateRow[];

    return rows.map(row => this.rowToCertificateInfo(row));
  }

  /**
   * Renew a certificate (issues new cert with same options)
   */
  async renewCertificate(certId: string, validityHours?: number): Promise<Certificate> {
    const existing = await this.getCertificate(certId);
    if (!existing) {
      throw new Error('Certificate not found');
    }
    if (existing.revokedAt) {
      throw new Error('Cannot renew a revoked certificate');
    }

    caLogger.info({ certId, name: existing.name }, 'Renewing certificate');

    // Issue new cert with same options
    const newCert = await this.issueCertificate({
      name: existing.name,
      type: existing.type,
      commonName: existing.subjectCn,
      sans: existing.subjectSans || undefined,
      validityHours,
      issuedToServerId: existing.issuedToServerId || undefined,
      issuedToDeploymentId: existing.issuedToDeploymentId || undefined,
    });

    // Revoke the old certificate
    await this.revokeCertificate(certId, 'superseded');

    return newCert;
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(certId: string, reason: string): Promise<void> {
    const db = getDb();

    const result = db.prepare(`
      UPDATE certificates
      SET revoked_at = CURRENT_TIMESTAMP, revocation_reason = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(reason, certId);

    if (result.changes === 0) {
      throw new Error('Certificate not found or already revoked');
    }

    caLogger.info({ certId, reason }, 'Certificate revoked');

    // TODO: Notify step-ca about revocation for CRL/OCSP
  }

  /**
   * Get certificates expiring within N days
   */
  async getExpiringCertificates(withinDays: number): Promise<CertificateInfo[]> {
    return this.listCertificates({ expiringWithinDays: withinDays });
  }

  /**
   * Check if CA is available and running
   */
  async isCAAvailable(): Promise<boolean> {
    const caDeployment = await this.getCADeployment();
    return caDeployment !== null;
  }

  /**
   * Get the ACME directory URL for the CA
   */
  async getACMEDirectoryURL(): Promise<string | null> {
    const caDeployment = await this.getCADeployment();
    if (!caDeployment) {
      return null;
    }

    const caDns = caDeployment.config.ca_dns || 'ca.ownprem.local';
    return `https://${caDns}:8443/acme/acme/directory`;
  }

  // Private methods

  private generateSerialNumber(): string {
    // Generate a random 128-bit serial number (hex encoded)
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async requestCertFromCA(
    caDeployment: CADeploymentInfo,
    commonName: string,
    sans: string[],
    type: CertificateType,
    validityHours: number
  ): Promise<{ certPem: string; keyPem: string }> {
    // In a full implementation, this would:
    // 1. Call the step-ca API directly, or
    // 2. Use the step CLI via an agent command
    //
    // For now, we'll generate self-signed certs using Node.js crypto
    // This allows the system to work without step-ca during development

    caLogger.debug({ commonName, sans, type }, 'Requesting certificate from CA');

    // Use node-forge or similar for cert generation
    // For MVP, use a simplified approach
    const { generateSelfSignedCert } = await import('../lib/certGenerator.js');

    return generateSelfSignedCert({
      commonName,
      sans,
      validityHours,
      isCA: type === 'ca',
    });
  }

  private rowToCertificate(row: CertificateRow, keyPem: string): Certificate {
    return {
      id: row.id,
      name: row.name,
      type: row.type as CertificateType,
      subjectCn: row.subject_cn,
      subjectSans: row.subject_sans ? JSON.parse(row.subject_sans) : null,
      certPem: row.cert_pem,
      keyPem,
      caCertPem: row.ca_cert_pem || '',
      serialNumber: row.serial_number,
      notBefore: new Date(row.not_before),
      notAfter: new Date(row.not_after),
      issuedToServerId: row.issued_to_server_id,
      issuedToDeploymentId: row.issued_to_deployment_id,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  private rowToCertificateInfo(row: CertificateRow): CertificateInfo {
    const notAfter = new Date(row.not_after);
    const now = new Date();
    const expiresInDays = Math.ceil((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: row.id,
      name: row.name,
      type: row.type as CertificateType,
      subjectCn: row.subject_cn,
      subjectSans: row.subject_sans ? JSON.parse(row.subject_sans) : null,
      serialNumber: row.serial_number,
      notBefore: new Date(row.not_before),
      notAfter,
      issuedToServerId: row.issued_to_server_id,
      issuedToDeploymentId: row.issued_to_deployment_id,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      createdAt: new Date(row.created_at),
      expiresInDays,
    };
  }
}

export const certificateAuthority = new CertificateAuthorityService();
