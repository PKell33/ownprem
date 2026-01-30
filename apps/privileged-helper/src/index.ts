/**
 * Privileged Helper Service
 *
 * A minimal root service that executes validated privileged operations
 * on behalf of the ownprem agent. Communicates via Unix socket.
 *
 * Security model:
 * - Runs as root
 * - Only accepts connections from ownprem user (via socket permissions)
 * - Validates ALL requests against strict whitelist before execution
 * - Logs all operations for audit
 */

import { createServer, Socket } from 'net';
import { unlinkSync, existsSync, mkdirSync, chownSync } from 'fs';
import { spawnSync } from 'child_process';
import { validateRequest, ValidationError } from './validator.js';
import { executeRequest } from './executor.js';
import type { HelperRequest, HelperResponse } from './types.js';

const SOCKET_PATH = '/run/ownprem/helper.sock';
const SOCKET_DIR = '/run/ownprem';

// Get ownprem user ID for socket permissions
function getOwnpremUid(): number {
  const result = spawnSync('id', ['-u', 'ownprem'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    console.error('Failed to get ownprem user ID. Is the ownprem user created?');
    process.exit(1);
  }
  return parseInt(result.stdout.trim(), 10);
}

function log(level: string, message: string, data?: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

function handleRequest(data: string): HelperResponse {
  let request: HelperRequest;

  try {
    request = JSON.parse(data);
  } catch {
    return { success: false, error: 'Invalid JSON' };
  }

  // Log the incoming request (without sensitive content)
  const logData = request.action !== 'write_file'
    ? { ...request }
    : { action: 'write_file', path: (request as any).path };
  log('info', 'Request received', logData);

  try {
    // Validate against whitelist
    validateRequest(request);
  } catch (err) {
    if (err instanceof ValidationError) {
      log('warn', 'Request rejected', { action: request.action, error: err.message });
      return { success: false, error: `Validation failed: ${err.message}` };
    }
    throw err;
  }

  // Execute the validated request
  const response = executeRequest(request);

  log(response.success ? 'info' : 'error', 'Request completed', {
    action: request.action,
    success: response.success,
    error: response.error,
  });

  return response;
}

function handleConnection(socket: Socket): void {
  let buffer = '';

  socket.on('data', (data) => {
    buffer += data.toString();

    // Protocol: newline-delimited JSON
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        const response = handleRequest(line);
        socket.write(JSON.stringify(response) + '\n');
      }
    }
  });

  socket.on('error', (err) => {
    log('error', 'Socket error', { error: err.message });
  });

  socket.on('close', () => {
    // Connection closed
  });
}

function main(): void {
  // Must run as root
  if (process.getuid?.() !== 0) {
    console.error('Privileged helper must run as root');
    process.exit(1);
  }

  const ownpremUid = getOwnpremUid();

  // Ensure socket directory exists
  if (!existsSync(SOCKET_DIR)) {
    mkdirSync(SOCKET_DIR, { recursive: true, mode: 0o755 });
  }

  // Remove old socket if it exists
  if (existsSync(SOCKET_PATH)) {
    unlinkSync(SOCKET_PATH);
  }

  const server = createServer(handleConnection);

  server.listen(SOCKET_PATH, () => {
    // Set socket permissions: only ownprem user can connect
    chownSync(SOCKET_PATH, ownpremUid, ownpremUid);
    // Mode 0600 = owner read/write only
    spawnSync('chmod', ['0600', SOCKET_PATH]);

    log('info', 'Privileged helper started', { socket: SOCKET_PATH });
  });

  server.on('error', (err) => {
    log('error', 'Server error', { error: err.message });
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = (): void => {
    log('info', 'Shutting down');
    server.close(() => {
      if (existsSync(SOCKET_PATH)) {
        unlinkSync(SOCKET_PATH);
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
