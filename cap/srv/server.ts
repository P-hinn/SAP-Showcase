import cds from '@sap/cds';

import { demoUserMiddleware, isDemoLandscape } from './demo-mode';

/**
 * Custom bootstrap. Adds one-click user switching for demos, before CAP mounts
 * its authentication - and only when authentication is mocked.
 */
cds.on('bootstrap', (app: { use: (fn: unknown) => void }) => {
  if (isDemoLandscape()) app.use(demoUserMiddleware());
});

export default cds.server;
