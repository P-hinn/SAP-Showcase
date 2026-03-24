import {
  MATRIX_MSG,
  cellText,
  parseAmount,
  parseMatrixRows,
  tiersFromRows,
  tiersToRows,
  validateMatrix
} from '../srv/lib/approval-matrix';
import { APPROVAL_MATRIX, determineRequiredLevel, type ApprovalTier } from '../srv/lib/approval-policy';

const HEADER = ['Net value up to', 'A', 'B', 'C'];

/** The built-in matrix as a person would type it into Excel. */
const BUILT_IN_ROWS = [HEADER, [5000, 1, 1, 2], ['25.000', 'L1', 'L2', 'L2'], ['100,000.00', 2, 2, 3], ['', 3, 3, 3]];

const codes = (rows: ReadonlyArray<ReadonlyArray<unknown>>) => parseMatrixRows(rows).findings.map((f) => f.code);

describe('approval matrix', () => {

  describe('parseAmount', () => {
    it.each<[unknown, number | null]>([
      [25000, 25000],
      ['25000', 25000],
      ['25.000', 25000],
      ['25,000', 25000],
      ['25.000,50', 25000.5],
      ['25,000.50', 25000.5],
      ['25.000,00 EUR', 25000],
      ['€ 5.000', 5000],
      ['abc', null],
      [null, null],
      [Number.NaN, null]
    ])('reads %p as %p', (cell, expected) => {
      expect(parseAmount(cell)).toBe(expected);
    });
  });

  it('turns only plain values into text', () => {
    expect(cellText('x')).toBe('x');
    expect(cellText(3)).toBe('3');
    expect(cellText(true)).toBe('true');
    expect(cellText(new Date('2026-09-18T10:00:00Z'))).toBe('2026-09-18');
    expect(cellText({ formula: 'A1' })).toBe('');
    expect(cellText(undefined)).toBe('');
  });

  describe('parseMatrixRows', () => {
    it('reads the built-in matrix back exactly, whatever the number format', () => {
      const { tiers, findings } = parseMatrixRows(BUILT_IN_ROWS);
      expect(findings).toEqual([]);
      expect(tiers).toEqual(APPROVAL_MATRIX);
    });

    it('accepts the usual ways of saying "no upper limit" in the last row', () => {
      for (const open of ['∞', 'unbegrenzt', 'and above', '-']) {
        const rows = [HEADER, [10000, 1, 2, 3], [open, 2, 3, 3]];
        expect(parseMatrixRows(rows).tiers[1]?.maxValue).toBe(Infinity);
      }
    });

    it('skips empty rows between the tiers', () => {
      expect(parseMatrixRows([HEADER, [5000, 1, 1, 1], [], ['', 2, 2, 2]]).findings).toEqual([]);
    });

    it('refuses an empty workbook', () => {
      expect(codes([HEADER])).toEqual([MATRIX_MSG.EMPTY]);
    });

    it('refuses a level that is not 1, 2 or 3 and names row and risk class', () => {
      const { findings } = parseMatrixRows([HEADER, [5000, 1, 4, 2], ['', 3, 3, 3]]);
      expect(findings).toEqual([
        { code: MATRIX_MSG.INVALID_LEVEL, messageKey: 'MATRIX_INVALID_LEVEL', args: ['B', '4'], row: 2 }
      ]);
    });

    it('refuses an open limit anywhere but in the last row', () => {
      expect(codes([HEADER, ['', 1, 1, 1], [5000, 2, 2, 2]])).toContain(MATRIX_MSG.NOT_A_NUMBER);
    });

    it('refuses a limit that is not a positive amount', () => {
      expect(codes([HEADER, ['tbd', 1, 1, 1], ['', 2, 2, 2]])).toEqual([MATRIX_MSG.NOT_A_NUMBER]);
      expect(codes([HEADER, [-5, 1, 1, 1], ['', 2, 2, 2]])).toEqual([MATRIX_MSG.NOT_A_NUMBER]);
    });
  });

  describe('validateMatrix - the properties the approval process depends on', () => {
    const tier = (maxValue: number, a: 1 | 2 | 3, b: 1 | 2 | 3, c: 1 | 2 | 3): ApprovalTier => ({
      maxValue,
      levels: { A: a, B: b, C: c }
    });

    it('accepts the built-in matrix', () => {
      expect(validateMatrix(APPROVAL_MATRIX)).toEqual([]);
    });

    it('refuses a riskier supplier being cheaper to approve', () => {
      const findings = validateMatrix([tier(5000, 2, 1, 2), tier(Infinity, 3, 3, 3)], [2, 3]);
      expect(findings.map((f) => [f.code, f.row])).toEqual([[MATRIX_MSG.RISKIER_IS_CHEAPER, 2]]);
    });

    it('refuses a larger amount being cheaper to approve', () => {
      const findings = validateMatrix([tier(5000, 2, 2, 2), tier(Infinity, 1, 2, 3)]);
      expect(findings.map((f) => [f.code, f.args])).toEqual([[MATRIX_MSG.MORE_EXPENSIVE_IS_CHEAPER, ['A']]]);
    });

    it('refuses limits that do not rise', () => {
      expect(validateMatrix([tier(5000, 1, 1, 1), tier(5000, 1, 1, 1), tier(Infinity, 2, 2, 2)]).map((f) => f.code))
        .toEqual([MATRIX_MSG.NOT_ASCENDING]);
    });

    it('refuses a matrix whose last tier has an upper limit', () => {
      expect(validateMatrix([tier(5000, 1, 1, 1)]).map((f) => f.code)).toEqual([MATRIX_MSG.LAST_TIER_NOT_OPEN]);
    });

    it('refuses an open tier that is not the last one', () => {
      expect(validateMatrix([tier(Infinity, 1, 1, 1), tier(Infinity, 2, 2, 2)]).map((f) => f.code))
        .toContain(MATRIX_MSG.NOT_ASCENDING);
    });

    it('refuses an empty matrix', () => {
      expect(validateMatrix([]).map((f) => f.code)).toEqual([MATRIX_MSG.EMPTY]);
    });
  });

  it('stores and restores a matrix without loss', () => {
    const rows = tiersToRows(APPROVAL_MATRIX);
    expect(rows[3]).toEqual({ position: 40, maxValue: null, levelA: 3, levelB: 3, levelC: 3 });
    expect(tiersFromRows(rows.map((row) => ({ ...row, maxValue: row.maxValue === null ? null : String(row.maxValue) }))))
      .toEqual(APPROVAL_MATRIX);
  });

  it('is what determineRequiredLevel applies when it is passed in', () => {
    const strict: ApprovalTier[] = [{ maxValue: Infinity, levels: { A: 3, B: 3, C: 3 } }];
    expect(determineRequiredLevel({ totalValue: 10, riskClass: 'A' })).toBe(1);
    expect(determineRequiredLevel({ totalValue: 10, riskClass: 'A', matrix: strict })).toBe(3);
  });
});
