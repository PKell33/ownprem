/**
 * Runtipi Apps API - Browse and manage apps from Runtipi-compatible stores
 */

import { runtipiStoreService } from '../../services/runtipiStoreService.js';
import { createStoreRoutes } from './storeRouteFactory.js';

const { router, iconRouter } = createStoreRoutes({
  storeType: 'runtipi',
  displayName: 'Runtipi',
  service: runtipiStoreService,
  iconExtensions: ['jpg', 'png'],
});

export default Object.assign(router, { iconRouter });
