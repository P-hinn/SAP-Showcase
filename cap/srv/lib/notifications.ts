import { approvalRole, isFinalApproval, nextApprovalLevel } from './approval-policy';

/**
 * Who has to hear about a lifecycle event.
 *
 * Approval requests go to a **role**, not to a person: the identity provider
 * (XSUAA/IAS) knows who holds `ApproverL2`, this application does not - and it
 * should not keep its own copy of that list. Outcomes go to the requester by
 * name, because that is a known user.
 *
 * Pure, like the other rule modules: the service stores what this returns and
 * hands it to whatever channel is configured.
 */

export const NOTIFICATION = {
  APPROVAL_NEEDED: 'NEED',
  APPROVED: 'APPR',
  REJECTED: 'REJE',
  PATH_ADJUSTED: 'PATH',
  ORDERED: 'ORDR'
} as const;

export type NotificationKind = (typeof NOTIFICATION)[keyof typeof NOTIFICATION];

export type Audience = { role: string } | { user: string };

export interface Notification {
  audience: Audience;
  kind: NotificationKind;
  /** The approval level the notification is about, if any. */
  approvalLevel?: number;
}

/** What happened to the requisition, in the words of the audit trail. */
export type LifecycleEvent = 'SUBM' | 'APPR' | 'REJE' | 'WDRW' | 'REOP' | 'ORDR' | 'PATH';

/**
 * @param input.approvalLevel for APPR: the level that just approved
 * @param input.requiredLevel the level the chain has to reach
 */
export function notificationsFor(input: {
  event: LifecycleEvent;
  requester: string | null | undefined;
  approvalLevel?: number | null;
  requiredLevel?: number | null;
}): Notification[] {
  const requester = input.requester ? [{ user: input.requester }] : [];
  const toRequester = (kind: NotificationKind): Notification[] => requester.map((audience) => ({ audience, kind }));
  const askLevel = (level: number): Notification[] => [
    { audience: { role: approvalRole(level) }, kind: NOTIFICATION.APPROVAL_NEEDED, approvalLevel: level }
  ];

  switch (input.event) {
    case 'SUBM':
      return askLevel(1);

    case 'APPR': {
      const level = Number(input.approvalLevel ?? 0);
      if (isFinalApproval(level, input.requiredLevel)) return toRequester(NOTIFICATION.APPROVED);
      return askLevel(nextApprovalLevel(level));
    }

    case 'REJE':
      return toRequester(NOTIFICATION.REJECTED);

    case 'PATH':
      return toRequester(NOTIFICATION.PATH_ADJUSTED);

    case 'ORDR':
      return toRequester(NOTIFICATION.ORDERED);

    // Withdrawing and reopening are the requester's own actions - nobody else
    // is waiting for them, and the requester knows what they just did.
    case 'WDRW':
    case 'REOP':
      return [];
  }
}
