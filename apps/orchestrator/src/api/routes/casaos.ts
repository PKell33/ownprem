/**
 * CasaOS Apps API - Browse and manage apps from CasaOS-compatible stores
 */

import { casaosStoreService } from '../../services/casaosStoreService.js';
import { createStoreRoutes } from './storeRouteFactory.js';

const { router, iconRouter } = createStoreRoutes({
  storeType: 'casaos',
  displayName: 'CasaOS',
  service: casaosStoreService,
  iconExtensions: ['png', 'svg'],
});

export default Object.assign(router, { iconRouter });
