import cds from '@sap/cds';

import { demoUsers, isDemoLandscape } from './demo-mode';

/** Presenter helpers. Answers 403 in every landscape without mocked authentication. */
export default class DemoService extends cds.ApplicationService {
  override async init(): Promise<void> {
    this.before('*', (req) => {
      if (!isDemoLandscape()) return req.reject(403, 'DEMO_ONLY');
    });

    this.on('users', () =>
      Object.entries(demoUsers()).map(([id, user]) => ({ id, roles: user.roles }))
    );

    this.on('resetData', async () => {
      // Same approach as cds.test's data.reset(): empty every table (drafts
      // and the mocked S/4HANA tables included), then load the CSV files again.
      const db = await cds.connect.to('db');
      const deletes = [];
      for (const entity of db.model.each('entity') as Iterable<Record<string, unknown>>) {
        if (!entity.query && entity['@cds.persistence.skip'] !== true) deletes.push(DELETE.from(entity as any));
      }
      await db.run(deletes);
      // cds.deploy is not part of the public typings.
      await (cds as unknown as { deploy: { data: (db: unknown) => Promise<void> } }).deploy.data(db);
      return true;
    });

    await super.init();
  }
}
