import * as policy from '../srv/lib/approval-policy';
import type {
  ApprovalLevel,
  Finding,
  MessageCode,
  Status,
  ValidatableCostCenter,
  ValidatableItem,
  ValidatableRequisition
} from '../srv/lib/approval-policy';
import type { RiskClass } from '../srv/lib/risk-scoring';

const { STATUS, MSG } = policy;

const codesOf = (findings: readonly Finding[]): MessageCode[] => findings.map((finding) => finding.code);

/**
 * First finding, asserting that there is one.
 * `noUncheckedIndexedAccess` is on, so `findings[0]` is possibly undefined -
 * and a bare `!` would turn "no finding was produced" into a confusing
 * TypeError instead of a readable failure.
 */
function first(findings: readonly Finding[]): Finding {
  expect(findings.length).toBeGreaterThan(0);
  return findings[0] as Finding;
}

describe('approval policy', () => {

  describe('determineRequiredLevel', () => {
    it.each<[number, ApprovalLevel, ApprovalLevel, ApprovalLevel]>([
      // value      A    B    C
      [0, 1, 1, 2],
      [4999.99, 1, 1, 2],
      [5000, 1, 2, 2],
      [24999.99, 1, 2, 2],
      [25000, 2, 2, 3],
      [99999.99, 2, 2, 3],
      [100000, 3, 3, 3],
      [5000000, 3, 3, 3]
    ])('at %p EUR requires L%i / L%i / L%i for risk class A / B / C', (totalValue, a, b, c) => {
      expect(policy.determineRequiredLevel({ totalValue, riskClass: 'A' })).toBe(a);
      expect(policy.determineRequiredLevel({ totalValue, riskClass: 'B' })).toBe(b);
      expect(policy.determineRequiredLevel({ totalValue, riskClass: 'C' })).toBe(c);
    });

    it('treats an unknown risk class as medium', () => {
      expect(policy.determineRequiredLevel({ totalValue: 10000, riskClass: undefined }))
        .toBe(policy.determineRequiredLevel({ totalValue: 10000, riskClass: 'B' }));
    });

    it('accepts the decimal string a database column yields', () => {
      expect(policy.determineRequiredLevel({ totalValue: '25000.00', riskClass: 'A' })).toBe(2);
      expect(policy.determineRequiredLevel({ totalValue: '24999.99', riskClass: 'A' })).toBe(1);
    });

    it('treats an unusable value as zero rather than guessing', () => {
      expect(policy.determineRequiredLevel({ totalValue: null, riskClass: 'A' })).toBe(1);
      expect(policy.determineRequiredLevel({ totalValue: 'n/a', riskClass: 'C' })).toBe(2);
    });

    it('is never cheaper for a riskier supplier', () => {
      for (const value of [0, 4999, 5000, 24999, 25000, 99999, 100000, 250000]) {
        const a = policy.determineRequiredLevel({ totalValue: value, riskClass: 'A' });
        const b = policy.determineRequiredLevel({ totalValue: value, riskClass: 'B' });
        const c = policy.determineRequiredLevel({ totalValue: value, riskClass: 'C' });
        expect(b).toBeGreaterThanOrEqual(a);
        expect(c).toBeGreaterThanOrEqual(b);
      }
    });

    it('is monotonic in the requisition value', () => {
      for (const riskClass of ['A', 'B', 'C'] as RiskClass[]) {
        let previous = 0;
        for (const value of [0, 4999, 5000, 24999, 25000, 99999, 100000, 250000]) {
          const level = policy.determineRequiredLevel({ totalValue: value, riskClass });
          expect(level).toBeGreaterThanOrEqual(previous);
          previous = level;
        }
      }
    });

    it('never exceeds the highest existing level', () => {
      expect(policy.determineRequiredLevel({ totalValue: 1e12, riskClass: 'C' }))
        .toBeLessThanOrEqual(policy.MAX_APPROVAL_LEVEL);
    });
  });

  describe('buildApprovalChain', () => {
    it('creates one pending step per level', () => {
      expect(policy.buildApprovalChain(3)).toEqual([
        { level: 1, decision: 'PEND' },
        { level: 2, decision: 'PEND' },
        { level: 3, decision: 'PEND' }
      ]);
    });

    it('never creates more steps than there are levels', () => {
      expect(policy.buildApprovalChain(99)).toHaveLength(policy.MAX_APPROVAL_LEVEL);
    });
  });

  describe('lifecycle', () => {
    it.each<[policy.LifecycleAction, Status, Status]>([
      ['submit', STATUS.DRAFT, STATUS.IN_APPROVAL],
      ['approve', STATUS.IN_APPROVAL, STATUS.IN_APPROVAL],
      ['reject', STATUS.IN_APPROVAL, STATUS.REJECTED],
      ['withdraw', STATUS.IN_APPROVAL, STATUS.DRAFT],
      ['close', STATUS.APPROVED, STATUS.CLOSED],
      ['reopen', STATUS.REJECTED, STATUS.DRAFT]
    ])('allows %s from %s to %s', (action, from, to) => {
      expect(policy.canPerform(action, from)).toBe(true);
      expect(policy.targetStatus(action, from)).toBe(to);
    });

    it.each<[policy.LifecycleAction, Status]>([
      ['submit', STATUS.IN_APPROVAL],
      ['submit', STATUS.APPROVED],
      ['approve', STATUS.DRAFT],
      ['approve', STATUS.APPROVED],
      ['withdraw', STATUS.APPROVED],
      ['close', STATUS.DRAFT],
      ['reopen', STATUS.APPROVED]
    ])('forbids %s from %s', (action, from) => {
      expect(policy.canPerform(action, from)).toBe(false);
      expect(policy.targetStatus(action, from)).toBeNull();
    });

    it('rejects an unknown action', () => {
      expect(policy.canPerform('teleport', STATUS.DRAFT)).toBe(false);
    });

    it('is a closed system - a closed requisition is a dead end', () => {
      for (const action of Object.keys(policy.TRANSITIONS) as policy.LifecycleAction[]) {
        expect(policy.canPerform(action, STATUS.CLOSED)).toBe(false);
      }
    });
  });

  describe('validateForSubmission', () => {
    const today = '2026-09-17';
    const validItem: ValidatableItem = {
      itemNumber: 10,
      quantity: 10,
      unitPrice: 100,
      netAmount: 1000,
      deliveryDate: '2026-12-01',
      supplier: { name: 'Nordwind Stahl GmbH', isBlocked: false }
    };
    const validHeader: ValidatableRequisition = { title: 'Steel plates', costCenter_ID: 'cc-1' };
    const costCenter: ValidatableCostCenter = {
      costCenterCode: '1000-4711',
      annualBudget: 100000,
      consumedBudget: 10000
    };
    const funded = (): ValidatableCostCenter => costCenter;

    it('accepts a valid requisition', () => {
      const findings = policy.validateForSubmission({
        requisition: validHeader, items: [validItem], costCenter, today
      });
      expect(findings).toEqual([]);
    });

    it('survives a missing item list', () => {
      const findings = policy.validateForSubmission({
        requisition: validHeader,
        items: null,
        costCenter: funded(),
        today
      });
      expect(codesOf(findings)).toContain(MSG.NO_ITEMS);
    });

    it('survives a missing requisition', () => {
      const findings = policy.validateForSubmission({
        requisition: null,
        items: [validItem],
        costCenter: funded(),
        today
      });
      expect(codesOf(findings)).toEqual(
        expect.arrayContaining([MSG.TITLE_MISSING, MSG.COST_CENTER_MISSING])
      );
    });

    it('requires at least one item', () => {
      const findings = policy.validateForSubmission({
        requisition: validHeader, items: [], costCenter, today
      });
      expect(codesOf(findings)).toContain(MSG.NO_ITEMS);
    });

    it.each<[string, Partial<ValidatableItem>, MessageCode]>([
      ['a zero quantity', { quantity: 0 }, MSG.QUANTITY_NOT_POSITIVE],
      ['a negative quantity', { quantity: -5 }, MSG.QUANTITY_NOT_POSITIVE],
      ['a negative price', { unitPrice: -1 }, MSG.PRICE_NEGATIVE],
      ['a delivery date in the past', { deliveryDate: '2020-01-01' }, MSG.DELIVERY_DATE_IN_PAST],
      ['a missing delivery date', { deliveryDate: null }, MSG.DELIVERY_DATE_IN_PAST],
      ['a blocked supplier', { supplier: { name: 'Kontinental', isBlocked: true } }, MSG.SUPPLIER_BLOCKED]
    ])('rejects %s', (_label, override, expectedCode) => {
      const findings = policy.validateForSubmission({
        requisition: validHeader,
        items: [{ ...validItem, ...override }],
        costCenter,
        today
      });
      expect(codesOf(findings)).toContain(expectedCode);
    });

    it('accepts a delivery date of today', () => {
      const findings = policy.validateForSubmission({
        requisition: validHeader,
        items: [{ ...validItem, deliveryDate: today }],
        costCenter,
        today
      });
      expect(codesOf(findings)).not.toContain(MSG.DELIVERY_DATE_IN_PAST);
    });

    it('requires a title and a cost center', () => {
      const findings = policy.validateForSubmission({
        requisition: { title: '   ' }, items: [validItem], costCenter: null, today
      });
      expect(codesOf(findings)).toEqual(expect.arrayContaining([MSG.TITLE_MISSING, MSG.COST_CENTER_MISSING]));
    });

    it('collects every problem instead of stopping at the first', () => {
      const findings = policy.validateForSubmission({
        requisition: { title: '' },
        items: [{ ...validItem, quantity: 0, unitPrice: -1, deliveryDate: '2019-01-01' }],
        costCenter,
        today
      });
      expect(findings.length).toBeGreaterThanOrEqual(4);
      expect(findings.every((finding) => finding.message && finding.code)).toBe(true);
    });

    it('points every item finding at the field that caused it', () => {
      const findings = policy.validateForSubmission({
        requisition: validHeader, items: [{ ...validItem, quantity: 0 }], costCenter, today
      });
      expect(first(findings).target).toBe('items(0)/quantity');
    });

    describe('budget check', () => {
      it('rejects a requisition that exceeds the remaining budget', () => {
        const findings = policy.validateForSubmission({
          requisition: validHeader,
          items: [{ ...validItem, netAmount: 95000 }],
          costCenter: { costCenterCode: '2000-5001', annualBudget: 100000, consumedBudget: 10000 },
          today
        });
        expect(codesOf(findings)).toContain(MSG.BUDGET_EXCEEDED);
        expect(first(findings).message).toContain('90000.00');
        expect(first(findings).message).toContain('95000.00');
      });

      it('allows a requisition that uses the remaining budget to the last cent', () => {
        const findings = policy.validateForSubmission({
          requisition: validHeader,
          items: [{ ...validItem, netAmount: 90000 }],
          costCenter: { costCenterCode: '2000-5001', annualBudget: 100000, consumedBudget: 10000 },
          today
        });
        expect(codesOf(findings)).not.toContain(MSG.BUDGET_EXCEEDED);
      });

      it('treats a cost center without consumption as fully available', () => {
        const findings = policy.validateForSubmission({
          requisition: validHeader,
          items: [{ ...validItem, netAmount: 100000 }],
          costCenter: { costCenterCode: '3000-6100', annualBudget: 100000 },
          today
        });
        expect(codesOf(findings)).not.toContain(MSG.BUDGET_EXCEEDED);
      });

      it('skips the check when no cost center was resolved at all', () => {
        const findings = policy.validateForSubmission({
          requisition: validHeader,
          items: [{ ...validItem, netAmount: 1e9 }],
          costCenter: null,
          today
        });
        expect(codesOf(findings)).not.toContain(MSG.BUDGET_EXCEEDED);
      });

      it('skips the check when no budget is maintained', () => {
        const findings = policy.validateForSubmission({
          requisition: validHeader,
          items: [{ ...validItem, netAmount: 1e9 }],
          costCenter: { costCenterCode: '9999', annualBudget: null },
          today
        });
        expect(codesOf(findings)).not.toContain(MSG.BUDGET_EXCEEDED);
      });
    });
  });

  describe('validateDecision', () => {
    const inApproval: ValidatableRequisition = {
      status_code: STATUS.IN_APPROVAL,
      requester: 'rita',
      createdBy: 'rita',
      currentApprovalLevel: 0,
      requiredApprovalLevel_code: 2
    };

    it('accepts an approver with the right role', () => {
      const findings = policy.validateDecision({
        requisition: inApproval, action: 'approve', user: 'tom', roles: ['ApproverL1']
      });
      expect(findings).toEqual([]);
    });

    it('blocks the requester from approving their own requisition', () => {
      const findings = policy.validateDecision({
        requisition: inApproval, action: 'approve', user: 'rita', roles: ['ApproverL1', 'ApproverL2']
      });
      expect(codesOf(findings)).toContain(MSG.SELF_APPROVAL);
    });

    it('blocks the creator even when someone else is named as requester', () => {
      const findings = policy.validateDecision({
        requisition: { ...inApproval, requester: 'mona', createdBy: 'rita' },
        action: 'approve',
        user: 'rita',
        roles: ['ApproverL1']
      });
      expect(codesOf(findings)).toContain(MSG.SELF_APPROVAL);
    });

    it('blocks an approver without the role for the pending level', () => {
      const findings = policy.validateDecision({
        requisition: { ...inApproval, currentApprovalLevel: 1 },
        action: 'approve',
        user: 'tom',
        roles: ['ApproverL1']
      });
      expect(codesOf(findings)).toContain(MSG.MISSING_APPROVAL_ROLE);
    });

    it('blocks a decision on a requisition that is not in approval', () => {
      const findings = policy.validateDecision({
        requisition: { ...inApproval, status_code: STATUS.DRAFT },
        action: 'approve',
        user: 'tom',
        roles: ['ApproverL1']
      });
      expect(codesOf(findings)).toEqual([MSG.INVALID_TRANSITION]);
    });

    it('blocks a decision once the chain is complete', () => {
      const findings = policy.validateDecision({
        requisition: { ...inApproval, currentApprovalLevel: 2 },
        action: 'approve',
        user: 'carl',
        roles: ['ApproverL1', 'ApproverL2', 'ApproverL3']
      });
      expect(codesOf(findings)).toContain(MSG.NO_PENDING_STEP);
    });

    it('applies the same rules to a rejection', () => {
      const findings = policy.validateDecision({
        requisition: inApproval, action: 'reject', user: 'rita', roles: ['ApproverL1']
      });
      expect(codesOf(findings)).toContain(MSG.SELF_APPROVAL);
    });
  });

  describe('reassessApprovalPath', () => {
    const reassess = (status: string, totalValue: number, riskClass: string, requiredLevel: number) =>
      policy.reassessApprovalPath({ status, totalValue, riskClass, requiredLevel });

    it('lets a draft follow the matrix in both directions', () => {
      expect(reassess(STATUS.DRAFT, 30000, 'C', 2)).toEqual({ requiredLevel: 3, addedLevels: [], changed: true });
      expect(reassess(STATUS.DRAFT, 30000, 'A', 3)).toEqual({ requiredLevel: 2, addedLevels: [], changed: true });
    });

    it('appends the missing levels to a requisition in approval when the supplier got riskier', () => {
      expect(reassess(STATUS.IN_APPROVAL, 31800, 'C', 2)).toEqual({ requiredLevel: 3, addedLevels: [3], changed: true });
      expect(reassess(STATUS.IN_APPROVAL, 4000, 'C', 1)).toEqual({ requiredLevel: 2, addedLevels: [2], changed: true });
    });

    it('never shortens the path of a requisition that is already in approval', () => {
      expect(reassess(STATUS.IN_APPROVAL, 31800, 'A', 3)).toEqual({ requiredLevel: 3, addedLevels: [], changed: false });
    });

    it('leaves approved, rejected and closed requisitions alone', () => {
      for (const status of [STATUS.APPROVED, STATUS.REJECTED, STATUS.CLOSED]) {
        expect(reassess(status, 150000, 'C', 1)).toEqual({ requiredLevel: 1, addedLevels: [], changed: false });
      }
    });

    it('reports no change when the level stays the same', () => {
      expect(reassess(STATUS.IN_APPROVAL, 31800, 'B', 2).changed).toBe(false);
      expect(reassess(STATUS.DRAFT, 31800, 'B', 2).changed).toBe(false);
    });
  });

  describe('approval chain arithmetic', () => {
    it('starts at level 1', () => {
      expect(policy.nextApprovalLevel(0)).toBe(1);
      expect(policy.nextApprovalLevel(null)).toBe(1);
      expect(policy.nextApprovalLevel(undefined)).toBe(1);
    });

    it('recognises the final level', () => {
      expect(policy.isFinalApproval(2, 2)).toBe(true);
      expect(policy.isFinalApproval(1, 2)).toBe(false);
    });

    it('derives the role name from the level', () => {
      expect(policy.approvalRole(1)).toBe('ApproverL1');
      expect(policy.approvalRole(3)).toBe('ApproverL3');
    });
  });
});

describe('validateItem', () => {
  const today = '2026-09-17';
  const item: ValidatableItem = {
    itemNumber: 10,
    quantity: 10,
    unitPrice: 100,
    deliveryDate: '2026-12-01',
    supplier: { name: 'Nordwind Stahl GmbH', isBlocked: false }
  };

  it('accepts a sound item', () => {
    expect(policy.validateItem({ item, today })).toEqual([]);
  });

  it('is the same code path validateForSubmission uses', () => {
    const broken = { ...item, quantity: 0 };
    const standalone = policy.validateItem({ item: broken, index: 0, today });
    const throughSubmission = policy.validateForSubmission({
      requisition: { title: 'x', costCenter_ID: 'cc' },
      items: [broken],
      costCenter: null,
      today
    });
    expect(throughSubmission).toEqual(expect.arrayContaining(standalone));
  });

  it('numbers the target by position when the item has no number yet', () => {
    const findings = policy.validateItem({ item: { ...item, itemNumber: undefined, quantity: 0 }, index: 2, today });
    expect(first(findings).target).toBe('items(2)/quantity');
    expect(first(findings).message).toContain('Item 30');
  });
});
