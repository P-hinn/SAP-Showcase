import cds from '@sap/cds';

import { notificationsFor, type LifecycleEvent } from './lib/notifications';
import { rolesOf } from './service-helpers';

/**
 * Stores the notifications a lifecycle event triggers and restricts reading
 * them to their recipients. Who gets notified is decided in
 * lib/notifications.ts.
 *
 * No message leaves the application here. Every stored notification is also
 * emitted as a `NotificationCreated` event on the service - the seam where a
 * mail or SAP Build Work Zone channel subscribes (ADR 0010). Locally the event
 * is only logged.
 */

const LOG = cds.log('notifications');

/** Writes the notifications for one audit trail event. */
export async function recordNotifications(
  service: cds.Service,
  entities: { Notifications: unknown; PurchaseRequisitions: unknown },
  requisitionId: string,
  event: LifecycleEvent,
  approvalLevel?: number | null
): Promise<void> {
  const requisition: { requester?: string; requiredApprovalLevel_code?: number; requisitionNumber?: string } | undefined =
    await SELECT.one
      .from(entities.PurchaseRequisitions as string)
      .columns('requester', 'requiredApprovalLevel_code', 'requisitionNumber')
      .where({ ID: requisitionId });
  if (!requisition) return;

  const notifications = notificationsFor({
    event,
    requester: requisition.requester,
    approvalLevel,
    requiredLevel: requisition.requiredApprovalLevel_code
  });
  if (!notifications.length) return;

  const rows = notifications.map((notification) => ({
    requisition_ID: requisitionId,
    kind_code: notification.kind,
    recipientUser: 'user' in notification.audience ? notification.audience.user : null,
    recipientRole: 'role' in notification.audience ? notification.audience.role : null,
    requester: requisition.requester ?? null,
    approvalLevel: notification.approvalLevel ?? null
  }));
  await INSERT.into(entities.Notifications as string).entries(rows);

  for (const row of rows) {
    const to = row.recipientUser ?? `role ${row.recipientRole}`;
    LOG.info(`${row.kind_code} for ${requisition.requisitionNumber ?? requisitionId} -> ${to}`);
    await service.emit('NotificationCreated', { ...row, requisitionNumber: requisition.requisitionNumber });
  }
}

/**
 * Before READ of MyNotifications: what is addressed to the caller by name, plus
 * what is addressed to one of their approval roles - except approval requests
 * for requisitions they raised themselves, which they may not decide anyway.
 */
export function restrictToMyNotifications(req: cds.Request): void {
  const user = req.user.id;
  const roles = rolesOf(req.user);
  // Tagged template: CAP binds the values as parameters, the user id never
  // becomes part of the SQL text. A tagged template is a call, but the lint
  // rule cannot tell - same situation as the CAP column projections.
  /* eslint-disable @typescript-eslint/no-unused-expressions */
  const query = req.query as unknown as { where(strings: TemplateStringsArray, ...values: unknown[]): void };
  if (roles.length) {
    query.where`recipientUser = ${user} or (recipientRole in ${roles} and requester != ${user})`;
  } else {
    query.where`recipientUser = ${user}`;
  }
  /* eslint-enable @typescript-eslint/no-unused-expressions */
}
