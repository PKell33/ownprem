import forge from 'node-forge';

/**
 * Certificate Generator
 *
 * Generates X.509 certificates using node-forge.
 * Used as a fallback when step-ca isn't available or during development.
 */

export interface GenerateCertOptions {
  commonName: string;
  sans?: string[];           // Subject Alternative Names
  validityHours?: number;    // Default 720 (30 days)
  isCA?: boolean;            // Generate a CA certificate
  keySize?: number;          // RSA key size, default 2048
  signingKey?: forge.pki.rsa.PrivateKey;   // CA key for signing
  signingCert?: forge.pki.Certificate;     // CA cert for chain
}

export interface GeneratedCert {
  certPem: string;
  keyPem: string;
  caCertPem?: string;
}

// Store CA key/cert in memory for development
// In production, this comes from step-ca
let devCACert: forge.pki.Certificate | null = null;
let devCAKey: forge.pki.rsa.PrivateKey | null = null;

/**
 * Generate a self-signed certificate (or CA-signed if CA is available)
 */
export function generateSelfSignedCert(options: GenerateCertOptions): GeneratedCert {
  const keySize = options.keySize || 2048;
  const validityHours = options.validityHours || 720;

  // Generate key pair
  const keys = forge.pki.rsa.generateKeyPair(keySize);

  // Create certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = generateSerialNumber();

  // Set validity
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setTime(cert.validity.notBefore.getTime() + validityHours * 60 * 60 * 1000);

  // Set subject
  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: options.commonName },
    { name: 'organizationName', value: 'OwnPrem' },
  ];
  cert.setSubject(attrs);

  // Set issuer (self-signed or CA)
  if (options.signingCert) {
    cert.setIssuer(options.signingCert.subject.attributes);
  } else if (devCACert && !options.isCA) {
    cert.setIssuer(devCACert.subject.attributes);
  } else {
    cert.setIssuer(attrs); // Self-signed
  }

  // Set extensions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extensions: any[] = [];

  if (options.isCA) {
    // CA certificate extensions
    extensions.push({
      name: 'basicConstraints',
      cA: true,
      critical: true,
    });
    extensions.push({
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      critical: true,
    });
  } else {
    // Server/client certificate extensions
    extensions.push({
      name: 'basicConstraints',
      cA: false,
    });
    extensions.push({
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    });
    extensions.push({
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
    });
  }

  // Subject Alternative Names
  if (options.sans && options.sans.length > 0) {
    const altNames: Array<{ type: number; value?: string; ip?: string }> = [];

    for (const san of options.sans) {
      if (isIPAddress(san)) {
        altNames.push({ type: 7, ip: san }); // IP address
      } else {
        altNames.push({ type: 2, value: san }); // DNS name
      }
    }

    extensions.push({
      name: 'subjectAltName',
      altNames,
    });
  }

  cert.setExtensions(extensions);

  // Sign the certificate
  if (options.signingKey) {
    cert.sign(options.signingKey, forge.md.sha256.create());
  } else if (devCAKey && !options.isCA) {
    cert.sign(devCAKey, forge.md.sha256.create());
  } else {
    cert.sign(keys.privateKey, forge.md.sha256.create());
  }

  // If this is a CA cert, store it for signing other certs
  if (options.isCA) {
    devCACert = cert;
    devCAKey = keys.privateKey;
  }

  // Convert to PEM
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  const result: GeneratedCert = {
    certPem,
    keyPem,
  };

  // Include CA cert if we used one
  if (options.signingCert) {
    result.caCertPem = forge.pki.certificateToPem(options.signingCert);
  } else if (devCACert && !options.isCA) {
    result.caCertPem = forge.pki.certificateToPem(devCACert);
  }

  return result;
}

/**
 * Generate a CA certificate
 */
export function generateCACert(commonName: string, validityYears: number = 10): GeneratedCert {
  return generateSelfSignedCert({
    commonName,
    validityHours: validityYears * 365 * 24,
    isCA: true,
    keySize: 4096, // Larger key for CA
  });
}

/**
 * Get the development CA certificate (if initialized)
 */
export function getDevCACert(): string | null {
  if (devCACert) {
    return forge.pki.certificateToPem(devCACert);
  }
  return null;
}

/**
 * Initialize or get the development CA
 * This is used when step-ca isn't available
 */
export function initializeDevCA(): GeneratedCert {
  if (!devCACert || !devCAKey) {
    const caCert = generateCACert('OwnPrem Development CA');
    return caCert;
  }

  return {
    certPem: forge.pki.certificateToPem(devCACert),
    keyPem: forge.pki.privateKeyToPem(devCAKey),
  };
}

/**
 * Parse a PEM certificate and extract information
 */
export function parseCertificate(certPem: string): {
  commonName: string;
  sans: string[];
  notBefore: Date;
  notAfter: Date;
  serialNumber: string;
  issuer: string;
  isCA: boolean;
} {
  const cert = forge.pki.certificateFromPem(certPem);

  const commonName = cert.subject.getField('CN')?.value as string || '';
  const issuer = cert.issuer.getField('CN')?.value as string || '';

  // Extract SANs
  const sans: string[] = [];
  const sanExt = cert.getExtension('subjectAltName');
  if (sanExt && 'altNames' in sanExt) {
    for (const altName of (sanExt as { altNames: Array<{ type: number; value?: string; ip?: string }> }).altNames) {
      if (altName.value) {
        sans.push(altName.value);
      } else if (altName.ip) {
        sans.push(altName.ip);
      }
    }
  }

  // Check if CA
  const basicConstraints = cert.getExtension('basicConstraints');
  const isCA = basicConstraints && 'cA' in basicConstraints ? (basicConstraints as { cA: boolean }).cA : false;

  return {
    commonName,
    sans,
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    serialNumber: cert.serialNumber,
    issuer,
    isCA,
  };
}

/**
 * Verify a certificate against a CA certificate
 */
export function verifyCertificate(certPem: string, caCertPem: string): boolean {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    const caCert = forge.pki.certificateFromPem(caCertPem);

    // Create a CA store and verify
    const caStore = forge.pki.createCaStore([caCert]);
    const verified = forge.pki.verifyCertificateChain(caStore, [cert]);

    return verified;
  } catch {
    return false;
  }
}

// Helper functions

function generateSerialNumber(): string {
  // Generate a random 128-bit serial number
  const bytes = forge.random.getBytesSync(16);
  return forge.util.bytesToHex(bytes);
}

function isIPAddress(value: string): boolean {
  // Simple check for IPv4 or IPv6
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv4Regex.test(value) || ipv6Regex.test(value);
}
