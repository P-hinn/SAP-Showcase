import { sumAmounts, toMinorUnits, type Amount } from './money';
import type { RiskClass } from './risk-scoring';

/**
 * Approval policy for purchase requisitions.
 *
 * Contains three things, and nothing else:
 *   1. the approval matrix (how many signatures does this requisition need),
 *   2. the lifecycle state machine (which action is allowed in which status),
 *   3. the submit-time validations.
 *
 * The module is pure: it neither reads from the database nor throws framework
 * specific errors. Callers pass in plain objects and receive plain findings,
 * which the service layer turns into `req.error(...)` calls and the ABAP
 * implementation turns into `reported-purchaserequisition` entries.
 *
 * Message codes are shared with the ABAP message class ZPR_MSG so that both
 * stacks quote the same numbers in an incident ticket.
 */

/** Requisition lifecycle status codes (see db/code-lists.cds). */
export const STATUS = {
  DRAFT: 'DR',
  IN_APPROVAL: 'IA',
  APPROVED: 'AP',
  REJECTED: 'RE',
  CLOSED: 'CL'
} as const;

export type Status = (typeof STATUS)[keyof typeof STATUS];

/** Decision codes of a single approval step. */
export const DECISION = {
  PENDING: 'PEND',
  APPROVED: 'APPR',
  REJECTED: 'REJE',
  SKIPPED: 'SKIP'
} as const;

export type Decision = (typeof DECISION)[keyof typeof DECISION];

/** The actions of the state machine. */
export type LifecycleAction = 'submit' | 'approve' | 'reject' | 'withdraw' | 'close' | 'reopen';

/** An approval level. There are exactly three. */
export type ApprovalLevel = 1 | 2 | 3;

/**
 * Allowed lifecycle transitions, keyed by action.
 * Anything not listed here is rejected with PR009.
 */
export const TRANSITIONS: Readonly<Record<LifecycleAction, { from: readonly Status[]; to: Status }>> = {
  submit: { from: [STATUS.DRAFT], to: STATUS.IN_APPROVAL },
  approve: { from: [STATUS.IN_APPROVAL], to: STATUS.IN_APPROVAL },
  reject: { from: [STATUS.IN_APPROVAL], to: STATUS.REJECTED },
  withdraw: { from: [STATUS.IN_APPROVAL], to: STATUS.DRAFT },
  close: { from: [STATUS.APPROVED], to: STATUS.CLOSED },
  reopen: { from: [STATUS.REJECTED], to: STATUS.DRAFT }
};

/** One tier of the approval matrix. `maxValue` is exclusive. */
export interface ApprovalTier {
  maxValue: number;
  levels: Readonly<Record<RiskClass, ApprovalLevel>>;
}

/**
 * The approval matrix.
 *
 * Read as: "up to `maxValue` (exclusive) EUR net, a supplier of risk class X
 * requires approval up to level `levels[X]`". The last tier is open ended.
 * Changing a number here changes both the runtime behaviour and the table in
 * docs/business-rules.md, which is generated from this constant.
 */
export const APPROVAL_MATRIX: readonly ApprovalTier[] = [
  { maxValue: 5_000, levels: { A: 1, B: 1, C: 2 } },
  { maxValue: 25_000, levels: { A: 1, B: 2, C: 2 } },
  { maxValue: 100_000, levels: { A: 2, B: 2, C: 3 } },
  { maxValue: Infinity, levels: { A: 3, B: 3, C: 3 } }
];

/** Highest level that exists. */
export const MAX_APPROVAL_LEVEL: ApprovalLevel = 3;

/** Message codes, mirrored by the ABAP message class ZPR_MSG. */
export const MSG = {
  NO_ITEMS: 'PR001',
  QUANTITY_NOT_POSITIVE: 'PR002',
  PRICE_NEGATIVE: 'PR003',
  DELIVERY_DATE_IN_PAST: 'PR004',
  SUPPLIER_BLOCKED: 'PR005',
  BUDGET_EXCEEDED: 'PR006',
  TITLE_MISSING: 'PR007',
  SELF_APPROVAL: 'PR008',
  INVALID_TRANSITION: 'PR009',
  MISSING_APPROVAL_ROLE: 'PR010',
  NO_PENDING_STEP: 'PR011',
  COST_CENTER_MISSING: 'PR012'
} as const;

export type MessageCode = (typeof MSG)[keyof typeof MSG];

/** One rule violation. `target` is the field path the message points at. */
export interface Finding {
  code: MessageCode;
  message: string;
  target?: string;
}

/** The supplier attributes the validations look at, resolved by the caller. */
export interface ItemSupplier {
  name?: string | null;
  isBlocked?: boolean | null;
}

/** Item fields the rules look at. */
export interface ValidatableItem {
  itemNumber?: number | null;
  quantity?: Amount;
  unitPrice?: Amount;
  netAmount?: Amount;
  deliveryDate?: string | null;
  supplier?: ItemSupplier | null;
}

/** Header fields the rules look at. */
export interface ValidatableRequisition {
  title?: string | null;
  costCenter_ID?: string | null;
  requester?: string | null;
  createdBy?: string | null;
  status_code?: string | null;
  currentApprovalLevel?: number | null;
  requiredApprovalLevel_code?: number | null;
}

/** Budget figures of the cost center the requisition is booked on. */
export interface ValidatableCostCenter {
  costCenterCode?: string | null;
  annualBudget?: Amount;
  consumedBudget?: Amount;
}

/**
 * Role required to decide on an approval level.
 * Naming convention, mirrored by the `requiredRole` column of ApprovalLevels
 * (which exists so the Fiori UI can display it without hard coding it).
 */
export function approvalRole(level: number): string {
  return `ApproverL${level}`;
}

/** Narrows a plain string from the database to a known risk class. */
function toRiskClass(code: string | null | undefined): RiskClass {
  // Unknown risk class is treated as medium: an unassessed supplier must not
  // be cheaper to approve than an assessed one.
  return code === 'A' || code === 'B' || code === 'C' ? code : 'B';
}

/**
 * Determines how many approval levels a requisition needs.
 *
 * @param input.totalValue net value of the requisition
 * @param input.riskClass worst supplier risk class
 */
export function determineRequiredLevel(input: {
  totalValue: Amount;
  riskClass?: string | null;
}): ApprovalLevel {
  const effectiveClass = toRiskClass(input.riskClass);
  const valueInCents = toMinorUnits(input.totalValue);

  // The open ended last tier carries Infinity, which has no minor unit
  // representation - it matches unconditionally.
  const tier = APPROVAL_MATRIX.find(
    (row) => !Number.isFinite(row.maxValue) || valueInCents < toMinorUnits(row.maxValue)
  );

  return tier?.levels[effectiveClass] ?? MAX_APPROVAL_LEVEL;
}

/**
 * Builds the full approval chain for a requisition: one step per level from 1
 * up to the required level. The chain is materialised on submit so that the
 * object page can show the complete path instead of revealing it step by step.
 */
export function buildApprovalChain(requiredLevel: number): Array<{ level: number; decision: Decision }> {
  const levels: Array<{ level: number; decision: Decision }> = [];
  for (let level = 1; level <= Math.min(requiredLevel, MAX_APPROVAL_LEVEL); level++) {
    levels.push({ level, decision: DECISION.PENDING });
  }
  return levels;
}

/** Type guard: is this one of the actions the state machine knows? */
function isLifecycleAction(action: string): action is LifecycleAction {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS, action);
}

/** Checks whether an action is allowed in the current status. */
export function canPerform(action: string, currentStatus: string | null | undefined): boolean {
  if (!isLifecycleAction(action)) return false;
  return TRANSITIONS[action].from.includes(currentStatus as Status);
}

/** Target status after an action. Returns null for a forbidden transition. */
export function targetStatus(action: string, currentStatus: string | null | undefined): Status | null {
  if (!canPerform(action, currentStatus)) return null;
  return TRANSITIONS[action as LifecycleAction].to;
}

/** The level that has to sign off next. */
export function nextApprovalLevel(currentApprovalLevel: number | null | undefined): number {
  return Number(currentApprovalLevel ?? 0) + 1;
}

/** True if approving `level` completes the approval chain. */
export function isFinalApproval(level: number, requiredLevel: number | null | undefined): boolean {
  return Number(level) >= Number(requiredLevel);
}

/**
 * Validates one item on its own.
 *
 * Called per item by `validateForSubmission` and directly by the item level
 * handler, so an item is checked by the same code whether it is saved on its
 * own or as part of a submit. The ABAP counterpart is
 * ZCL_PR_APPROVAL_POLICY=>VALIDATE_ITEM.
 *
 * @param input.index zero based position, used for the error target
 * @param input.today ISO date (YYYY-MM-DD) used as "now"
 */
export function validateItem(input: {
  item: ValidatableItem;
  index?: number;
  today: string;
}): Finding[] {
  const { item, index = 0, today } = input;
  const findings: Finding[] = [];
  const label = item.itemNumber ?? (index + 1) * 10;
  const target = `items(${index})`;

  if (!(Number(item.quantity) > 0)) {
    findings.push({
      code: MSG.QUANTITY_NOT_POSITIVE,
      message: `Item ${label}: enter a quantity greater than zero.`,
      target: `${target}/quantity`
    });
  }

  if (Number(item.unitPrice) < 0) {
    findings.push({
      code: MSG.PRICE_NEGATIVE,
      message: `Item ${label}: the unit price must not be negative.`,
      target: `${target}/unitPrice`
    });
  }

  // ISO dates compare correctly as plain strings, which keeps the rule free of
  // any time zone interpretation - the delivery date is a calendar date, not a
  // point in time.
  if (!item.deliveryDate || String(item.deliveryDate) < today) {
    findings.push({
      code: MSG.DELIVERY_DATE_IN_PAST,
      message: `Item ${label}: the delivery date must not be in the past.`,
      target: `${target}/deliveryDate`
    });
  }

  if (item.supplier?.isBlocked) {
    findings.push({
      code: MSG.SUPPLIER_BLOCKED,
      message: `Item ${label}: supplier ${item.supplier.name ?? ''} carries a purchasing block.`
        .replace(/\s+/g, ' ')
        .trim(),
      target: `${target}/supplier_ID`
    });
  }

  return findings;
}

/**
 * Validates a requisition before it is submitted for approval.
 *
 * All findings are collected instead of failing on the first one: an approver
 * who gets a list of five problems at once needs one round trip, not five.
 */
export function validateForSubmission(input: {
  requisition: ValidatableRequisition | null | undefined;
  items: readonly ValidatableItem[] | null | undefined;
  costCenter?: ValidatableCostCenter | null;
  today: string;
}): Finding[] {
  const { requisition, costCenter, today } = input;
  const findings: Finding[] = [];
  const itemList = input.items ?? [];

  if (!requisition?.title || String(requisition.title).trim() === '') {
    findings.push({ code: MSG.TITLE_MISSING, message: 'Enter a title for the requisition.', target: 'title' });
  }

  if (!requisition?.costCenter_ID) {
    findings.push({
      code: MSG.COST_CENTER_MISSING,
      message: 'Assign a cost center before submitting.',
      target: 'costCenter_ID'
    });
  }

  if (itemList.length === 0) {
    findings.push({
      code: MSG.NO_ITEMS,
      message: 'A requisition must contain at least one item.',
      target: 'items'
    });
  }

  itemList.forEach((item, index) => {
    findings.push(...validateItem({ item, index, today }));
  });

  if (costCenter && costCenter.annualBudget !== null && costCenter.annualBudget !== undefined) {
    const requested = sumAmounts(itemList.map((item) => item.netAmount ?? 0));
    const remaining = sumAmounts([costCenter.annualBudget, -Number(costCenter.consumedBudget ?? 0)]);
    if (toMinorUnits(requested) > toMinorUnits(remaining)) {
      findings.push({
        code: MSG.BUDGET_EXCEEDED,
        message:
          `Cost center ${costCenter.costCenterCode} has ${remaining.toFixed(2)} left, ` +
          `the requisition asks for ${requested.toFixed(2)}.`,
        target: 'costCenter_ID'
      });
    }
  }

  return findings;
}

/** Validates an approval decision. */
export function validateDecision(input: {
  requisition: ValidatableRequisition | null | undefined;
  action: 'approve' | 'reject';
  user: string;
  roles: readonly string[];
}): Finding[] {
  const { requisition, action, user, roles } = input;
  const findings: Finding[] = [];
  const status = requisition?.status_code;

  if (!canPerform(action, status)) {
    findings.push({
      code: MSG.INVALID_TRANSITION,
      message: `Action "${action}" is not allowed for a requisition in status ${status}.`
    });
    // Everything below assumes an approvable requisition.
    return findings;
  }

  // Segregation of duties: nobody signs off their own demand, regardless of
  // the roles they hold. This is the rule an auditor looks for first.
  if (requisition?.requester === user || requisition?.createdBy === user) {
    findings.push({
      code: MSG.SELF_APPROVAL,
      message: 'You cannot decide on a requisition you raised yourself.'
    });
  }

  const level = nextApprovalLevel(requisition?.currentApprovalLevel);
  if (level > Number(requisition?.requiredApprovalLevel_code ?? MAX_APPROVAL_LEVEL)) {
    findings.push({
      code: MSG.NO_PENDING_STEP,
      message: 'The approval chain of this requisition is already complete.'
    });
    return findings;
  }

  const requiredRole = approvalRole(level);
  if (!(roles ?? []).includes(requiredRole)) {
    findings.push({
      code: MSG.MISSING_APPROVAL_ROLE,
      message: `Approval level ${level} requires the role ${requiredRole}.`
    });
  }

  return findings;
}
