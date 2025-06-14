import type cds from '@sap/cds';

import * as policy from './lib/approval-policy';
import type { Finding, ValidatableRequisition } from './lib/approval-policy';
import type { Amount } from './lib/money';

/**
 * Small helpers shared by the service implementation and the S/4HANA
 * integration handlers: reading keys off a request, the roles a user holds,
 * and turning rule findings into OData errors.
 */

/** Audit trail event types (db/code-lists.cds, RequisitionEventTypes). */
export const EVENT = {
  SUBMITTED: 'SUBM',
  APPROVED: 'APPR',
  REJECTED: 'REJE',
  WITHDRAWN: 'WDRW',
  REOPENED: 'REOP',
  ORDERED: 'ORDR',
  PATH_ADJUSTED: 'PATH'
} as const;

export type EventType = (typeof EVENT)[keyof typeof EVENT];

/** A requisition row as the database hands it back. */
export interface RequisitionRow extends ValidatableRequisition {
  ID: string;
  requisitionNumber?: string | null;
  currency_code?: string | null;
  totalValue?: Amount;
  supplierRiskClass_code?: string | null;
}

/**
 * Extracts the entity key from a bound action request. Draft enabled entities
 * carry a composite key (ID + IsActiveEntity), plain ones just the ID.
 */
export function keyOf(req: cds.Request): string | undefined {
  const params = req.params as ReadonlyArray<unknown> | undefined;
  const key = params?.[params.length - 1];
  if (!key) return undefined;
  return typeof key === 'object' ? (key as { ID?: string }).ID : (key as string);
}

/** The request timestamp as an ISO calendar date (YYYY-MM-DD). */
export function today(req: cds.Request): string {
  return new Date(req.timestamp).toISOString().slice(0, 10);
}

/** Approval roles the user actually holds. */
export function rolesOf(user: cds.User): string[] {
  const roles: string[] = [];
  for (let level = 1; level <= policy.MAX_APPROVAL_LEVEL; level++) {
    const role = policy.approvalRole(level);
    if (user.is(role)) roles.push(role);
  }
  if (user.is('ProcurementAdmin')) roles.push('ProcurementAdmin');
  return roles;
}

/** Approval levels the user may decide on, derived from their roles. */
export function decidableLevels(user: cds.User): number[] {
  const levels: number[] = [];
  for (let level = 1; level <= policy.MAX_APPROVAL_LEVEL; level++) {
    if (user.is(policy.approvalRole(level))) levels.push(level);
  }
  return levels;
}

/** Every role of this service the user holds, requester side included. */
export function knownRolesOf(user: cds.User): string[] {
  const roles = user.is('Requester') ? ['Requester'] : [];
  return [...roles, ...rolesOf(user)];
}

/**
 * Turns rule findings into OData error details. The message is sent as an i18n
 * key: CAP looks it up in `_i18n/messages*.properties` for the request locale.
 */
export function raise(req: cds.Request, findings: readonly Finding[]): void {
  for (const finding of findings) {
    req.error({
      code: finding.code,
      message: finding.messageKey,
      args: finding.args ? [...finding.args] : undefined,
      target: finding.target,
      status: 400
    });
  }
}

/** Fiori criticality for a risk class: 1 = red, 2 = yellow, 3 = green. */
export function criticalityForRiskClass(riskClass: string | null | undefined): number {
  const map: Record<string, number> = { A: 3, B: 2, C: 1 };
  // `riskClass && map[riskClass]` would return '' for an empty risk class -
  // a string where the caller expects a number. noUncheckedIndexedAccess
  // caught it.
  return map[riskClass ?? ''] ?? 0;
}
