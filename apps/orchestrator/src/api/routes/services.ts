import { Router } from 'express';
import { serviceRegistry } from '../../services/serviceRegistry.js';
import { createError } from '../middleware/error.js';
import { validateParams, schemas } from '../middleware/validate.js';

const router = Router();

// GET /api/services - List all available services
router.get('/', async (_req, res, next) => {
  try {
    const services = await serviceRegistry.listAllServices();
    res.json(services);
  } catch (err) {
    next(err);
  }
});

// GET /api/services/:name - Get providers for a service
router.get('/:name', validateParams(schemas.serviceNameParam), async (req, res, next) => {
  try {
    const services = await serviceRegistry.findAllServices(req.params.name);

    if (services.length === 0) {
      throw createError(`No providers found for service ${req.params.name}`, 404, 'SERVICE_NOT_FOUND');
    }

    res.json({
      serviceName: req.params.name,
      providers: services.map(s => ({
        id: s.id,
        serverId: s.serverId,
        host: s.host,
        port: s.port,
        status: s.status,
        deploymentId: s.deploymentId,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
