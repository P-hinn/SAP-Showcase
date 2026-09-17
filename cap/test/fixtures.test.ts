import fs from 'node:fs';
import path from 'node:path';

import { lineAmount, sumAmounts } from '../srv/lib/money';
import { assessSupplier, worstRiskClass } from '../srv/lib/risk-scoring';
import { determineRequiredLevel, buildApprovalChain } from '../srv/lib/approval-policy';

/**
 * The sample data in db/data is not decoration - the demo story depends on the
 * numbers being right. These tests recompute every derived value in the CSV
 * files from the rule modules, so a change to a weight or a threshold that
 * nobody carried into the fixtures fails the build instead of quietly making
 * the demo lie.
 */

const DATA_DIR = path.join(__dirname, '..', 'db', 'data');

/** One fixture row: every column arrives as a string, as CSV has no types. */
type CsvRow = Record<string, string>;

/** Minimal CSV reader for the semicolon separated fixture format. */
function readCsv(fileName: string): CsvRow[] {
  const raw = fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8').trim();
  const [header, ...lines] = raw.split('\n');
  const columns = (header ?? '').split(';');
  return lines.map((line) => {
    const values = line.split(';');
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
  });
}

const suppliers = readCsv('acme.procurement-Suppliers.csv');
const ratings = readCsv('acme.procurement-FinancialRatings.csv');
const countryRisks = readCsv('acme.procurement-CountryRisks.csv');
const requisitions = readCsv('acme.procurement-PurchaseRequisitions.csv');
const items = readCsv('acme.procurement-PurchaseRequisitionItems.csv');
const approvalSteps = readCsv('acme.procurement-ApprovalSteps.csv');

const ratingPoints = new Map(ratings.map((row) => [row.code, Number(row.riskPoints)]));
const countryPoints = new Map(countryRisks.map((row) => [row.code, Number(row.riskPoints)]));
const supplierById = new Map(suppliers.map((row) => [row.ID, row]));
const itemsByRequisition = items.reduce<Map<string, CsvRow[]>>((map, item) => {
  const key = item.requisition_ID ?? '';
  const list = map.get(key) ?? [];
  list.push(item);
  map.set(key, list);
  return map;
}, new Map());

describe('sample data', () => {

  it('contains something to demo with', () => {
    expect(suppliers.length).toBeGreaterThanOrEqual(5);
    expect(requisitions.length).toBeGreaterThanOrEqual(5);
  });

  describe('suppliers', () => {
    it.each(suppliers.map((supplier) => [supplier.name, supplier]))(
      '%s carries the risk score the scoring module computes',
      (_name, supplier) => {
        const assessment = assessSupplier({
          isBlocked: supplier.isBlocked === 'true',
          financialRatingPoints: ratingPoints.get(supplier.financialRating_code),
          countryRiskPoints: countryPoints.get(supplier.country_code),
          onTimeDeliveryRate: Number(supplier.onTimeDeliveryRate),
          qualityIncidents12M: Number(supplier.qualityIncidents12M),
          isoCertified: supplier.isoCertified === 'true'
        });
        expect(Number(supplier.riskScore)).toBe(assessment.score);
        expect(supplier.riskClass_code).toBe(assessment.riskClass);
      }
    );

    it('references a financial rating and a country risk that exist', () => {
      for (const supplier of suppliers) {
        expect(ratingPoints.has(supplier.financialRating_code)).toBe(true);
        expect(countryPoints.has(supplier.country_code)).toBe(true);
      }
    });

    it('covers every risk class, so every approval path can be demoed', () => {
      const classes = new Set(suppliers.map((supplier) => supplier.riskClass_code));
      expect([...classes].sort()).toEqual(['A', 'B', 'C']);
    });

    it('contains exactly one blocked supplier for the block validation demo', () => {
      expect(suppliers.filter((supplier) => supplier.isBlocked === 'true')).toHaveLength(1);
    });
  });

  describe('requisitions', () => {
    it.each(requisitions.map((req) => [req.requisitionNumber || req.title, req]))(
      '%s has consistent amounts and a correctly derived approval level',
      (_label, requisition) => {
        const own = itemsByRequisition.get(requisition.ID ?? '') ?? [];
        expect(own.length).toBeGreaterThan(0);

        for (const item of own) {
          expect(Number(item.netAmount)).toBe(lineAmount(item.quantity, item.unitPrice));
        }

        const totalValue = sumAmounts(own.map((item) => item.netAmount));
        expect(Number(requisition.totalValue)).toBe(totalValue);

        const riskClass = worstRiskClass(
          own.map((item) => supplierById.get(item.supplier_ID ?? '')?.riskClass_code)
        );
        expect(requisition.supplierRiskClass_code).toBe(riskClass);

        expect(Number(requisition.requiredApprovalLevel_code))
          .toBe(determineRequiredLevel({ totalValue, riskClass }));
      }
    );

    it('numbers items 10, 20, 30 ...', () => {
      for (const [, own] of itemsByRequisition) {
        const numbers = own.map((item) => Number(item.itemNumber)).sort((a, b) => a - b);
        expect(numbers).toEqual(own.map((_item, index) => (index + 1) * 10));
      }
    });

    it('covers every lifecycle status', () => {
      const statuses = new Set(requisitions.map((requisition) => requisition.status_code));
      expect([...statuses].sort()).toEqual(['AP', 'CL', 'DR', 'IA', 'RE']);
    });

    it('gives every submitted requisition an approval chain of the right length', () => {
      for (const requisition of requisitions) {
        const own = approvalSteps.filter((step) => step.requisition_ID === requisition.ID);
        if (requisition.status_code === 'DR') {
          expect(own).toHaveLength(0);
          continue;
        }
        const expected = buildApprovalChain(Number(requisition.requiredApprovalLevel_code));
        expect(own.map((step) => Number(step.level_code)).sort())
          .toEqual(expected.map((step) => step.level));
      }
    });

    it('never claims more approvals than the chain requires', () => {
      for (const requisition of requisitions) {
        expect(Number(requisition.currentApprovalLevel))
          .toBeLessThanOrEqual(Number(requisition.requiredApprovalLevel_code));
      }
    });

    it('keeps requisition numbers unique', () => {
      const numbers = requisitions.map((r) => r.requisitionNumber).filter(Boolean);
      expect(new Set(numbers).size).toBe(numbers.length);
    });
  });
});
