import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { ErrorCodes, ErrorStatusCodes, type ErrorCode } from '@ownprem/shared';
import logger from '../../lib/logger.js';

const apiLogger = logger.child({ component: 'api-error' });

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
  isOperational?: boolean; // Marks errors that are safe to expose to clients
}

/**
 * Error codes that are safe to expose their messages to clients.
 * These are business logic errors where the message helps the user understand
 * what went wrong without exposing internal system details.
 */
const SAFE_ERROR_CODES = new Set<string>([
  // Validation errors - message explains what's wrong with input
  ErrorCodes.VALIDATION_ERROR,
  ErrorCodes.CONFIG_VALIDATION_ERROR,
  ErrorCodes.INVALID_CONFIG,
  ErrorCodes.INVALID_REQUEST,
  ErrorCodes.INVALID_STATE,

  // Not found errors - message identifies what wasn't found
  ErrorCodes.NOT_FOUND,
  ErrorCodes.SERVER_NOT_FOUND,
  ErrorCodes.DEPLOYMENT_NOT_FOUND,
  ErrorCodes.APP_NOT_FOUND,
  ErrorCodes.USER_NOT_FOUND,
  ErrorCodes.GROUP_NOT_FOUND,
  ErrorCodes.MOUNT_NOT_FOUND,
  ErrorCodes.CERTIFICATE_NOT_FOUND,
  ErrorCodes.SESSION_NOT_FOUND,

  // Conflict errors - message explains the conflict
  ErrorCodes.CONFLICT,
  ErrorCodes.SERVER_EXISTS,
  ErrorCodes.DEPLOYMENT_EXISTS,
  ErrorCodes.USER_EXISTS,
  ErrorCodes.MOUNT_EXISTS,
  ErrorCodes.MOUNT_POINT_EXISTS,
  ErrorCodes.CERTIFICATE_EXISTS,

  // Business logic errors - message explains why operation can't proceed
  ErrorCodes.CANNOT_DELETE_CORE,
  ErrorCodes.CANNOT_MODIFY_CORE,
  ErrorCodes.CANNOT_DELETE_SELF,
  ErrorCodes.MANDATORY_APP,
  ErrorCodes.MOUNT_IN_USE,
  ErrorCodes.DEPENDENCY_MISSING,
  ErrorCodes.OPERATION_IN_PROGRESS,

  // Auth errors with safe messages
  ErrorCodes.INVALID_CREDENTIALS,
  ErrorCodes.TOTP_REQUIRED,
  ErrorCodes.INVALID_TOTP,
  ErrorCodes.TOTP_ALREADY_ENABLED,
  ErrorCodes.TOTP_NOT_ENABLED,

  // Connection errors - generic messages are safe
  ErrorCodes.AGENT_NOT_CONNECTED,
  ErrorCodes.AGENT_DISCONNECTED,
  ErrorCodes.COMMAND_TIMEOUT,
]);

/**
 * Generic error messages for error codes that should not expose details.
 */
const GENERIC_ERROR_MESSAGES: Record<string, string> = {
  [ErrorCodes.INTERNAL_ERROR]: 'An internal error occurred. Please try again later.',
  [ErrorCodes.DATABASE_ERROR]: 'A database error occurred. Please try again later.',
  [ErrorCodes.UNAUTHORIZED]: 'Authentication required.',
  [ErrorCodes.FORBIDDEN]: 'You do not have permission to perform this action.',
  [ErrorCodes.INVALID_TOKEN]: 'Your session has expired. Please log in again.',
  [ErrorCodes.TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please try again later.',
  [ErrorCodes.COMMAND_FAILED]: 'Command execution failed. Please check the logs for details.',
  [ErrorCodes.CADDY_UPDATE_FAILED]: 'Failed to update proxy configuration. Please check the logs.',
  [ErrorCodes.BACKUP_FAILED]: 'Backup operation failed. Please check the logs.',
  [ErrorCodes.RESTORE_FAILED]: 'Restore operation failed. Please check the logs.',
  [ErrorCodes.CA_NOT_INITIALIZED]: 'Certificate authority is not initialized.',
  [ErrorCodes.TOKEN_THEFT_DETECTED]: 'Session security issue detected. Please log in again.',
  [ErrorCodes.BACKUP_CODE_ALREADY_USED]: 'This backup code has already been used.',
  [ErrorCodes.PATH_VALIDATION_FAILED]: 'Invalid path provided.',
  [ErrorCodes.SYMLINK_NOT_ALLOWED]: 'Invalid path provided.',
  [ErrorCodes.CREDENTIAL_INJECTION_ATTEMPT]: 'Invalid credentials format.',
};

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || ErrorCodes.INTERNAL_ERROR;

  // Generate a request ID for correlation
  const requestId = (req as { requestId?: string }).requestId || randomUUID();

  // Log at appropriate level based on status code
  // Always log full error details server-side
  if (statusCode >= 500) {
    apiLogger.error({
      err,
      statusCode,
      code,
      requestId,
      method: req.method,
      path: req.path,
      userId: (req as { user?: { userId: string } }).user?.userId,
    }, 'API error');
  } else {
    apiLogger.warn({
      err,
      statusCode,
      code,
      requestId,
      method: req.method,
      path: req.path,
    }, 'API client error');
  }

  // Determine what message to send to client
  const isOperational = err.isOperational ?? SAFE_ERROR_CODES.has(code);
  let clientMessage: string;

  if (isOperational) {
    // Safe to expose the actual error message
    clientMessage = err.message || 'An error occurred';
  } else {
    // Use generic message to avoid leaking sensitive information
    clientMessage = GENERIC_ERROR_MESSAGES[code] || 'An unexpected error occurred. Please try again later.';
  }

  const errorResponse: { code: string; message: string; requestId: string; details?: unknown } = {
    code,
    message: clientMessage,
    requestId, // Include for support correlation
  };

  // Only include details for operational errors (validation details, etc.)
  if (isOperational && err.details !== undefined) {
    errorResponse.details = err.details;
  }

  res.status(statusCode).json({
    error: errorResponse,
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: 'Resource not found',
    },
  });
}

/**
 * Create an API error with the given message, status code, and optional code.
 */
export function createError(message: string, statusCode: number, code?: string, details?: unknown): ApiError {
  const error: ApiError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Create an API error using a predefined error code.
 * Status code is automatically derived from the error code.
 */
export function createTypedError(code: ErrorCode, message: string, details?: unknown): ApiError {
  const error: ApiError = new Error(message);
  error.statusCode = ErrorStatusCodes[code];
  error.code = code;
  error.details = details;
  return error;
}

// Convenience error factories for common cases

export const Errors = {
  unauthorized(message = 'Authentication required'): ApiError {
    return createTypedError(ErrorCodes.UNAUTHORIZED, message);
  },

  forbidden(message = 'Permission denied'): ApiError {
    return createTypedError(ErrorCodes.FORBIDDEN, message);
  },

  notFound(resource: string, id?: string): ApiError {
    const message = id ? `${resource} '${id}' not found` : `${resource} not found`;
    return createTypedError(ErrorCodes.NOT_FOUND, message);
  },

  serverNotFound(id: string): ApiError {
    return createTypedError(ErrorCodes.SERVER_NOT_FOUND, `Server '${id}' not found`);
  },

  deploymentNotFound(id: string): ApiError {
    return createTypedError(ErrorCodes.DEPLOYMENT_NOT_FOUND, `Deployment '${id}' not found`);
  },

  appNotFound(name: string): ApiError {
    return createTypedError(ErrorCodes.APP_NOT_FOUND, `App '${name}' not found`);
  },

  userNotFound(id: string): ApiError {
    return createTypedError(ErrorCodes.USER_NOT_FOUND, `User '${id}' not found`);
  },

  groupNotFound(id: string): ApiError {
    return createTypedError(ErrorCodes.GROUP_NOT_FOUND, `Group '${id}' not found`);
  },

  mountNotFound(id: string): ApiError {
    return createTypedError(ErrorCodes.MOUNT_NOT_FOUND, `Mount '${id}' not found`);
  },

  validation(message: string, details?: unknown): ApiError {
    return createTypedError(ErrorCodes.VALIDATION_ERROR, message, details);
  },

  configValidation(message: string, details?: unknown): ApiError {
    return createTypedError(ErrorCodes.CONFIG_VALIDATION_ERROR, message, details);
  },

  conflict(message: string): ApiError {
    return createTypedError(ErrorCodes.CONFLICT, message);
  },

  agentNotConnected(serverId: string): ApiError {
    return createTypedError(ErrorCodes.AGENT_NOT_CONNECTED, `Agent for server '${serverId}' is not connected`);
  },

  operationInProgress(message: string): ApiError {
    return createTypedError(ErrorCodes.OPERATION_IN_PROGRESS, message);
  },

  internal(message = 'Internal server error'): ApiError {
    return createTypedError(ErrorCodes.INTERNAL_ERROR, message);
  },
};
