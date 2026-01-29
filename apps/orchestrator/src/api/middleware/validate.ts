import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';

/**
 * Middleware factory for validating request body with Zod schemas
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: err.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(err);
    }
  };
}

/**
 * Middleware factory for validating request params with Zod schemas
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: err.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(err);
    }
  };
}

/**
 * Middleware factory for validating query parameters with Zod schemas
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: err.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(err);
    }
  };
}

// ===============================
// Common Validation Schemas
// ===============================

// UUID pattern for IDs
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server/resource ID pattern (lowercase alphanumeric with hyphens)
const resourceIdPattern = /^[a-z0-9-]+$/;

export const schemas = {
  // ===============================
  // Common Parameter Schemas
  // ===============================

  // UUID ID param (for deployments, sessions, etc.)
  idParam: z.object({
    id: z.string().regex(uuidPattern, 'Invalid ID format'),
  }),

  // Server ID param (not UUID, uses name-based IDs like 'core')
  serverIdParam: z.object({
    id: z.string().min(1).max(50).regex(resourceIdPattern, 'Server ID must be lowercase alphanumeric with hyphens'),
  }),

  // App name param
  appNameParam: z.object({
    name: z.string().min(1).max(50).regex(resourceIdPattern, 'App name must be lowercase alphanumeric with hyphens'),
  }),

  // Service name param
  serviceNameParam: z.object({
    name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Service name must be lowercase alphanumeric with hyphens'),
  }),

  // User ID param (UUID)
  userIdParam: z.object({
    userId: z.string().regex(uuidPattern, 'Invalid user ID format'),
  }),

  // Group ID param (UUID or 'default')
  groupIdParam: z.object({
    id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Group ID must be lowercase alphanumeric with hyphens'),
  }),

  // Combined params for nested routes (e.g., /groups/:id/members/:userId)
  groupMemberParams: z.object({
    id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Group ID must be lowercase alphanumeric with hyphens'),
    userId: z.string().regex(uuidPattern, 'Invalid user ID format'),
  }),

  // Token ID param (UUID)
  tokenIdParam: z.object({
    tokenId: z.string().regex(uuidPattern, 'Invalid token ID format'),
  }),

  // Server with token params
  serverTokenParams: z.object({
    id: z.string().min(1).max(50).regex(resourceIdPattern, 'Server ID must be lowercase alphanumeric with hyphens'),
    tokenId: z.string().regex(uuidPattern, 'Invalid token ID format'),
  }),

  // ===============================
  // Common Query Schemas
  // ===============================
  query: {
    // Pagination query params
    pagination: z.object({
      limit: z.coerce.number().int().min(1).max(500).optional().default(100),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }),

    // Logs query params
    logs: z.object({
      lines: z.coerce.number().int().min(1).max(1000).optional().default(100),
      since: z.string().max(50).optional(),
      grep: z.string().max(100).optional(),
    }),

    // Command log query params
    commands: z.object({
      serverId: z.string().min(1).max(50).regex(resourceIdPattern).optional(),
      deploymentId: z.string().regex(uuidPattern).optional(),
      action: z.string().min(1).max(50).optional(),
      status: z.enum(['pending', 'success', 'error', 'timeout']).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional().default(100),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }),

    // Audit log query params
    audit: z.object({
      action: z.string().min(1).max(100).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional().default(100),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }),

    // Deployments list query params
    deployments: z.object({
      serverId: z.string().min(1).max(50).regex(resourceIdPattern).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }),
  },

  // Legacy alias for backward compatibility
  serverNameParam: z.object({
    id: z.string().min(1).max(50).regex(resourceIdPattern, 'Server ID must be lowercase alphanumeric with hyphens'),
  }),

  // Auth schemas
  auth: {
    login: z.object({
      username: z.string().min(1, 'Username is required').max(50),
      password: z.string().min(1, 'Password is required'),
    }),

    setup: z.object({
      username: z.string()
        .min(3, 'Username must be at least 3 characters')
        .max(50)
        .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
      password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(100),
    }),

    changePassword: z.object({
      oldPassword: z.string().min(1, 'Old password is required'),
      newPassword: z.string()
        .min(8, 'New password must be at least 8 characters')
        .max(100),
    }),

    refresh: z.object({
      refreshToken: z.string().min(1, 'Refresh token is required'),
    }),

    createUser: z.object({
      username: z.string()
        .min(3, 'Username must be at least 3 characters')
        .max(50)
        .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
      password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(100),
      groupId: z.string().optional(),
      role: z.enum(['admin', 'operator', 'viewer']).optional(),
    }),

    // TOTP schemas
    loginWithTotp: z.object({
      username: z.string().min(1, 'Username is required').max(50),
      password: z.string().min(1, 'Password is required'),
      totpCode: z.string().min(6, 'TOTP code is required').max(8),
    }),

    totpVerify: z.object({
      code: z.string().min(6, 'Code is required').max(8),
    }),

    totpDisable: z.object({
      password: z.string().min(1, 'Password is required'),
    }),

    // Session schemas
    sessionRevoke: z.object({
      refreshToken: z.string().min(1, 'Refresh token is required'),
    }),

    // System admin schema
    setSystemAdmin: z.object({
      isSystemAdmin: z.boolean(),
    }),
  },

  // Group schemas
  groups: {
    create: z.object({
      name: z.string()
        .min(2, 'Group name must be at least 2 characters')
        .max(50)
        .regex(/^[a-zA-Z0-9_-]+$/, 'Group name can only contain letters, numbers, underscores, and hyphens'),
      description: z.string().max(200).optional(),
      totpRequired: z.boolean().optional(),
    }),

    update: z.object({
      name: z.string()
        .min(2, 'Group name must be at least 2 characters')
        .max(50)
        .regex(/^[a-zA-Z0-9_-]+$/, 'Group name can only contain letters, numbers, underscores, and hyphens')
        .optional(),
      description: z.string().max(200).optional(),
      totpRequired: z.boolean().optional(),
    }),

    addMember: z.object({
      userId: z.string().regex(uuidPattern, 'Invalid user ID format'),
      role: z.enum(['admin', 'operator', 'viewer']),
    }),

    updateMember: z.object({
      role: z.enum(['admin', 'operator', 'viewer']),
    }),
  },

  // Server schemas
  servers: {
    create: z.object({
      name: z.string()
        .min(1, 'Name is required')
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens'),
      host: z.string()
        .min(1, 'Host is required')
        .max(255)
        .regex(/^[a-zA-Z0-9.-]+$/, 'Invalid host format'),
    }),

    update: z.object({
      name: z.string()
        .min(1)
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens')
        .optional(),
      host: z.string()
        .min(1)
        .max(255)
        .regex(/^[a-zA-Z0-9.-]+$/, 'Invalid host format')
        .optional(),
    }),
  },

  // Deployment schemas
  deployments: {
    create: z.object({
      serverId: z.string().min(1, 'Server ID is required'),
      appName: z.string()
        .min(1, 'App name is required')
        .regex(/^[a-z0-9-]+$/, 'App name must be lowercase alphanumeric with hyphens'),
      groupId: z.string().optional(),
      config: z.record(z.unknown()).optional().default({}),
      version: z.string().optional(),
    }),

    update: z.object({
      config: z.record(z.unknown()),
    }),

    validate: z.object({
      serverId: z.string().min(1, 'Server ID is required'),
      appName: z.string()
        .min(1, 'App name is required')
        .regex(/^[a-z0-9-]+$/, 'App name must be lowercase alphanumeric with hyphens'),
    }),

    rotateSecrets: z.object({
      fields: z.array(z.string().min(1).max(100)).optional(),
    }),
  },

  // Agent token schemas
  agentTokens: {
    create: z.object({
      name: z.string().min(1).max(100).optional(),
      expiresIn: z.string()
        .regex(/^\d+[smhd]$/, 'Invalid duration format (e.g., "30d", "24h", "1h")')
        .optional(),
    }),
  },
};
