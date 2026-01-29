import { Router, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { getDb } from '../../db/index.js';
import { createError } from '../middleware/error.js';
import { validateBody, validateParams, schemas } from '../middleware/validate.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { hashToken } from '../../websocket/agentHandler.js';
import { parsePaginationParams, paginateOrReturnAll } from '../../lib/pagination.js';
import type { Server, ServerMetrics } from '@ownprem/shared';

// Helper: Check if user can manage servers (system admin only for now)
function canManageServers(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  if (req.user.isSystemAdmin) {
    next();
    return;
  }
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'System admin permission required' } });
}

const router = Router();

interface ServerRow {
  id: string;
  name: string;
  host: string | null;
  is_core: number;
  agent_status: string;
  auth_token: string | null;
  metrics: string | null;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

function rowToServer(row: ServerRow): Server {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    isCore: Boolean(row.is_core),
    agentStatus: row.agent_status as Server['agentStatus'],
    authToken: row.auth_token,
    metrics: row.metrics ? JSON.parse(row.metrics) as ServerMetrics : undefined,
    lastSeen: row.last_seen ? new Date(row.last_seen) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// GET /api/servers - List all servers
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM servers ORDER BY is_core DESC, name').all() as ServerRow[];
  const servers = rows.map(rowToServer);

  // Apply pagination if requested, otherwise return full array for backward compatibility
  const paginationParams = parsePaginationParams(req);
  res.json(paginateOrReturnAll(servers, paginationParams));
});

// POST /api/servers - Add a new server (system admin only)
router.post('/', requireAuth, canManageServers, validateBody(schemas.servers.create), (req, res) => {
  const { name, host } = req.body;
  const db = getDb();
  const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Generate and hash the auth token
  const rawAuthToken = randomBytes(32).toString('hex');
  const hashedAuthToken = hashToken(rawAuthToken);

  const existing = db.prepare('SELECT id FROM servers WHERE id = ? OR name = ?').get(id, name);
  if (existing) {
    throw createError('Server with this name already exists', 409, 'SERVER_EXISTS');
  }

  // Store the hashed token in the database
  const stmt = db.prepare(`
    INSERT INTO servers (id, name, host, is_core, auth_token, agent_status)
    VALUES (?, ?, ?, FALSE, ?, 'offline')
  `);
  stmt.run(id, name, host, hashedAuthToken);

  const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as ServerRow;
  const server = rowToServer(row);

  // Return bootstrap command for the new server (using raw token, not hashed)
  const bootstrapCommand = `curl -sSL http://${req.get('host')}/agent/install.sh | sudo bash -s -- --orchestrator http://${req.get('host')} --token ${rawAuthToken} --id ${id}`;

  res.status(201).json({
    server,
    bootstrapCommand,
  });
});

// GET /api/servers/:id - Get server details
router.get('/:id', requireAuth, validateParams(schemas.serverIdParam), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as ServerRow | undefined;

  if (!row) {
    throw createError('Server not found', 404, 'SERVER_NOT_FOUND');
  }

  res.json(rowToServer(row));
});

// PUT /api/servers/:id - Update server (system admin only)
router.put('/:id', requireAuth, canManageServers, validateParams(schemas.serverIdParam), validateBody(schemas.servers.update), (req, res) => {
  const { name, host } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as ServerRow | undefined;
  if (!existing) {
    throw createError('Server not found', 404, 'SERVER_NOT_FOUND');
  }

  if (existing.is_core) {
    throw createError('Cannot modify core server', 400, 'CANNOT_MODIFY_CORE');
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (host !== undefined) {
    updates.push('host = ?');
    values.push(host);
  }

  if (updates.length === 0) {
    throw createError('No fields to update', 400, 'NO_UPDATES');
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);

  const stmt = db.prepare(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as ServerRow;
  res.json(rowToServer(row));
});

// DELETE /api/servers/:id - Remove server (system admin only)
router.delete('/:id', requireAuth, canManageServers, validateParams(schemas.serverIdParam), (req, res) => {
  const db = getDb();

  const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as ServerRow | undefined;
  if (!existing) {
    throw createError('Server not found', 404, 'SERVER_NOT_FOUND');
  }

  if (existing.is_core) {
    throw createError('Cannot delete core server', 400, 'CANNOT_DELETE_CORE');
  }

  db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// POST /api/servers/:id/regenerate-token - Regenerate auth token (system admin only)
router.post('/:id/regenerate-token', requireAuth, canManageServers, validateParams(schemas.serverIdParam), (req, res) => {
  const db = getDb();

  const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as ServerRow | undefined;
  if (!existing) {
    throw createError('Server not found', 404, 'SERVER_NOT_FOUND');
  }

  if (existing.is_core) {
    throw createError('Cannot regenerate token for core server', 400, 'CANNOT_MODIFY_CORE');
  }

  // Generate new token
  const rawAuthToken = randomBytes(32).toString('hex');
  const hashedAuthToken = hashToken(rawAuthToken);

  // Update the token in database
  db.prepare(`
    UPDATE servers SET auth_token = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hashedAuthToken, req.params.id);

  // Return bootstrap command with the new token
  const bootstrapCommand = `curl -sSL http://${req.get('host')}/agent/install.sh | sudo bash -s -- --orchestrator http://${req.get('host')} --token ${rawAuthToken} --id ${req.params.id}`;

  res.json({
    server: rowToServer(db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id) as ServerRow),
    bootstrapCommand,
  });
});

// ==================
// Agent Token Management
// ==================

// GET /api/servers/:id/tokens - List all tokens for a server
router.get('/:id/tokens', requireAuth, canManageServers, validateParams(schemas.serverIdParam), async (req: AuthenticatedRequest, res, next) => {
  try {
    const db = getDb();

    // Verify server exists
    const existing = db.prepare('SELECT id FROM servers WHERE id = ?').get(req.params.id);
    if (!existing) {
      throw createError('Server not found', 404, 'SERVER_NOT_FOUND');
    }

    const { agentTokenService } = await import('../../services/agentTokenService.js');
    const tokens = agentTokenService.listTokens(req.params.id);

    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

// POST /api/servers/:id/tokens - Create a new token for a server
router.post('/:id/tokens', requireAuth, canManageServers, validateParams(schemas.serverIdParam), validateBody(schemas.agentTokens.create), async (req: AuthenticatedRequest, res, next) => {
  try {
    const db = getDb();

    // Verify server exists
    const existing = db.prepare('SELECT id, is_core FROM servers WHERE id = ?').get(req.params.id) as { id: string; is_core: number } | undefined;
    if (!existing) {
      throw createError('Server not found', 404, 'SERVER_NOT_FOUND');
    }

    if (existing.is_core) {
      throw createError('Cannot create tokens for core server', 400, 'CANNOT_MODIFY_CORE');
    }

    const { agentTokenService } = await import('../../services/agentTokenService.js');
    const { name, expiresIn } = req.body;

    const result = agentTokenService.createToken(
      req.params.id,
      { name, expiresIn },
      req.user?.userId
    );

    // Return token info with raw token (only visible once)
    res.status(201).json({
      token: result.token,
      rawToken: result.rawToken,
      message: 'Token created successfully. Save the raw token now - it will not be shown again.',
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/servers/:id/tokens/:tokenId - Revoke a specific token
router.delete('/:id/tokens/:tokenId', requireAuth, canManageServers, validateParams(schemas.serverTokenParams), async (req: AuthenticatedRequest, res, next) => {
  try {
    const db = getDb();

    // Verify server exists
    const existing = db.prepare('SELECT id FROM servers WHERE id = ?').get(req.params.id);
    if (!existing) {
      throw createError('Server not found', 404, 'SERVER_NOT_FOUND');
    }

    const { agentTokenService } = await import('../../services/agentTokenService.js');
    const revoked = agentTokenService.revokeToken(
      req.params.tokenId,
      req.params.id,
      req.user?.userId
    );

    if (!revoked) {
      throw createError('Token not found', 404, 'TOKEN_NOT_FOUND');
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
