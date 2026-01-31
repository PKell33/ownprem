import type { Request, Response, NextFunction } from 'express';
import { ErrorCodes, ErrorStatusCodes, type ErrorCode } from '@ownprem/shared';
import logger from '../../lib/logger.js';

const apiLogger = logger.child({ component: 'api-error' });

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;

  // Log at appropriate level based on status code
  if (statusCode >= 500) {
    apiLogger.error({ err, statusCode }, 'API error');
  } else {
    apiLogger.warn({ err, statusCode }, 'API client error');
  }

  const message = err.message || 'Internal server error';
  const code = err.code || ErrorCodes.INTERNAL_ERROR;

  const errorResponse: { code: string; message: string; details?: unknown } = {
    code,
    message,
  };

  if (err.details !== undefined) {
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
