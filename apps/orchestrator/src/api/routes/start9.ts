/**
 * Start9 Apps API - Browse and manage apps from Start9 Marketplace
 */

import { start9StoreService } from '../../services/start9StoreService.js';
import { createStoreRoutes } from './storeRouteFactory.js';

const { router, iconRouter } = createStoreRoutes({
  storeType: 'start9',
  displayName: 'Start9',
  service: start9StoreService,
  iconExtensions: ['png', 'svg'],
});

export default Object.assign(router, { iconRouter });
