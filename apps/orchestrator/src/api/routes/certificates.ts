import { Router, Response, NextFunction } from 'express';
import { certificateAuthority } from '../../services/certificateAuthority.js';
import { getRenewalStatus, triggerRenewalCheck } from '../../jobs/certRenewal.js';
import { createError, Errors, createTypedError } from '../middleware/error.js';
import { validateBody, validateParams, schemas } from '../middleware/validate.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { auditService } from '../../services/auditService.js';
import { ErrorCodes } from '@ownprem/shared';

const router = Router();

// Helper: Check if user can manage certificates (system admin only)
function canManageCertificates(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: ErrorCodes.UNAUTHORIZED, message: 'Authentication required' } });
    return;
  }
  if (req.user.isSystemAdmin) {
    next();
    return;
  }
  res.status(403).json({ error: { code: ErrorCodes.FORBIDDEN, message: 'System admin permission required' } });
}

// GET /api/certificates - List all certificates
router.get('/', requireAuth, canManageCertificates, async (req: AuthenticatedRequest, res, next) => {
  try {
    const type = req.query.type as 'server' | 'client' | undefined;
    const serverId = req.query.serverId as string | undefined;
    const includeRevoked = req.query.includeRevoked === 'true';
    const expiringWithinDays = req.query.expiringWithinDays
      ? parseInt(req.query.expiringWithinDays as string, 10)
      : undefined;

    const certificates = await certificateAuthority.listCertificates({
      type,
      issuedToServerId: serverId,
      includeRevoked,
      expiringWithinDays,
    });

    res.json(certificates);
  } catch (err) {
    next(err);
  }
});

// GET /api/certificates/ca - Get CA certificate (public)
router.get('/ca', requireAuth, async (req, res, next) => {
  try {
    const caCert = await certificateAuthority.getCACertificate();

    if (!caCert) {
      throw createTypedError(ErrorCodes.CA_NOT_INITIALIZED, 'CA certificate not available');
    }

    // Return as PEM or JSON based on Accept header
    if (req.accepts('application/x-pem-file')) {
      res.type('application/x-pem-file').send(caCert);
    } else {
      res.json({ certificate: caCert });
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/certificates/ca/status - Check CA status
router.get('/ca/status', requireAuth, async (req, res, next) => {
  try {
    const available = await certificateAuthority.isCAAvailable();
    const acmeUrl = await certificateAuthority.getACMEDirectoryURL();

    res.json({
      available,
      acmeDirectoryUrl: acmeUrl,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/certificates - Issue a new certificate
router.post('/', requireAuth, canManageCertificates, validateBody(schemas.certificates.issue), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name, type, commonName, sans, validityHours, issuedToServerId, issuedToDeploymentId } = req.body;

    const certificate = await certificateAuthority.issueCertificate({
      name,
      type,
      commonName,
      sans,
      validityHours,
      issuedToServerId,
      issuedToDeploymentId,
    });

    auditService.log({
      userId: req.user?.userId,
      action: 'certificate_issued',
      resourceType: 'certificate',
      resourceId: certificate.id,
      details: { name, type, commonName, sans },
    });

    // Return certificate info (include cert and key for download)
    res.status(201).json({
      id: certificate.id,
      name: certificate.name,
      type: certificate.type,
      subjectCn: certificate.subjectCn,
      subjectSans: certificate.subjectSans,
      serialNumber: certificate.serialNumber,
      notBefore: certificate.notBefore,
      notAfter: certificate.notAfter,
      certPem: certificate.certPem,
      keyPem: certificate.keyPem,
      caCertPem: certificate.caCertPem,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/certificates/:id - Get certificate details
router.get('/:id', requireAuth, canManageCertificates, validateParams(schemas.idParam), async (req, res, next) => {
  try {
    const certificate = await certificateAuthority.getCertificate(req.params.id);

    if (!certificate) {
      throw createError('Certificate not found', 404, 'CERTIFICATE_NOT_FOUND');
    }

    res.json({
      id: certificate.id,
      name: certificate.name,
      type: certificate.type,
      subjectCn: certificate.subjectCn,
      subjectSans: certificate.subjectSans,
      serialNumber: certificate.serialNumber,
      notBefore: certificate.notBefore,
      notAfter: certificate.notAfter,
      issuedToServerId: certificate.issuedToServerId,
      issuedToDeploymentId: certificate.issuedToDeploymentId,
      revokedAt: certificate.revokedAt,
      createdAt: certificate.createdAt,
      certPem: certificate.certPem,
      keyPem: certificate.keyPem,
      caCertPem: certificate.caCertPem,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/certificates/:id/download - Download certificate bundle
router.get('/:id/download', requireAuth, canManageCertificates, validateParams(schemas.idParam), async (req, res, next) => {
  try {
    const certificate = await certificateAuthority.getCertificate(req.params.id);

    if (!certificate) {
      throw createError('Certificate not found', 404, 'CERTIFICATE_NOT_FOUND');
    }

    const format = req.query.format as string || 'pem';

    if (format === 'pem') {
      // Return as separate PEM files in JSON
      res.json({
        cert: certificate.certPem,
        key: certificate.keyPem,
        ca: certificate.caCertPem,
      });
    } else if (format === 'combined') {
      // Return as combined PEM (cert + chain)
      const combined = certificate.certPem + '\n' + (certificate.caCertPem || '');
      res.type('application/x-pem-file').send(combined);
    } else {
      throw createError('Invalid format. Use "pem" or "combined"', 400, 'INVALID_FORMAT');
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/certificates/:id/renew - Renew a certificate
router.post('/:id/renew', requireAuth, canManageCertificates, validateParams(schemas.idParam), validateBody(schemas.certificates.renew), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { validityHours } = req.body;
    const oldCertId = req.params.id;

    const newCertificate = await certificateAuthority.renewCertificate(oldCertId, validityHours);

    auditService.log({
      userId: req.user?.userId,
      action: 'certificate_renewed',
      resourceType: 'certificate',
      resourceId: newCertificate.id,
      details: { oldCertificateId: oldCertId },
    });

    res.json({
      id: newCertificate.id,
      name: newCertificate.name,
      type: newCertificate.type,
      subjectCn: newCertificate.subjectCn,
      serialNumber: newCertificate.serialNumber,
      notBefore: newCertificate.notBefore,
      notAfter: newCertificate.notAfter,
      certPem: newCertificate.certPem,
      keyPem: newCertificate.keyPem,
      caCertPem: newCertificate.caCertPem,
      oldCertificateId: oldCertId,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/certificates/:id/revoke - Revoke a certificate
router.post('/:id/revoke', requireAuth, canManageCertificates, validateParams(schemas.idParam), validateBody(schemas.certificates.revoke), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { reason } = req.body;

    await certificateAuthority.revokeCertificate(req.params.id, reason);

    auditService.log({
      userId: req.user?.userId,
      action: 'certificate_revoked',
      resourceType: 'certificate',
      resourceId: req.params.id,
      details: { reason },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/certificates/renewal/status - Get certificate renewal status
router.get('/renewal/status', requireAuth, canManageCertificates, (_req, res) => {
  const status = getRenewalStatus();
  res.json(status);
});

// POST /api/certificates/renewal/trigger - Manually trigger renewal check
router.post('/renewal/trigger', requireAuth, canManageCertificates, csrfProtection, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await triggerRenewalCheck();

    auditService.log({
      userId: req.user?.userId,
      action: 'certificate_renewed',
      resourceType: 'certificate',
      details: {
        manual: true,
        checked: result.checked,
        renewed: result.renewed,
        failed: result.failed,
      },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/certificates/expiring/:days - Get certificates expiring within N days
router.get('/expiring/:days', requireAuth, canManageCertificates, async (req, res, next) => {
  try {
    const days = parseInt(req.params.days, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      throw createError('Days must be between 1 and 365', 400, 'INVALID_DAYS');
    }

    const certificates = await certificateAuthority.getExpiringCertificates(days);
    res.json(certificates);
  } catch (err) {
    next(err);
  }
});

export default router;
