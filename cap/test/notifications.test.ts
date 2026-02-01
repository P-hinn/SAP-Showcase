import { NOTIFICATION, notificationsFor } from '../srv/lib/notifications';

describe('notifications', () => {
  const base = { requester: 'rita', requiredLevel: 3 };

  it('asks the first approval level when a requisition is submitted', () => {
    expect(notificationsFor({ ...base, event: 'SUBM' })).toEqual([
      { audience: { role: 'ApproverL1' }, kind: NOTIFICATION.APPROVAL_NEEDED, approvalLevel: 1 }
    ]);
  });

  it('asks the next level after an approval that does not complete the chain', () => {
    expect(notificationsFor({ ...base, event: 'APPR', approvalLevel: 2 })).toEqual([
      { audience: { role: 'ApproverL3' }, kind: NOTIFICATION.APPROVAL_NEEDED, approvalLevel: 3 }
    ]);
  });

  it('tells the requester once the last level has approved', () => {
    expect(notificationsFor({ ...base, event: 'APPR', approvalLevel: 3 })).toEqual([
      { audience: { user: 'rita' }, kind: NOTIFICATION.APPROVED }
    ]);
  });

  it.each([
    ['REJE', NOTIFICATION.REJECTED],
    ['PATH', NOTIFICATION.PATH_ADJUSTED],
    ['ORDR', NOTIFICATION.ORDERED]
  ] as const)('tells the requester about %s', (event, kind) => {
    expect(notificationsFor({ ...base, event })).toEqual([{ audience: { user: 'rita' }, kind }]);
  });

  it('stays silent about what the requester did themselves', () => {
    expect(notificationsFor({ ...base, event: 'WDRW' })).toEqual([]);
    expect(notificationsFor({ ...base, event: 'REOP' })).toEqual([]);
  });

  it('has nobody to tell about an outcome when the requester is unknown', () => {
    expect(notificationsFor({ event: 'REJE', requester: null })).toEqual([]);
  });
});
