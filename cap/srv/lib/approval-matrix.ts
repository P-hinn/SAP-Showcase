import type { ApprovalLevel, ApprovalTier } from './approval-policy';
import { toMinorUnits } from './money';
import type { RiskClass } from './risk-scoring';

/**
 * The approval matrix as data a procurement lead maintains - read from a
 * spreadsheet, checked, and only then activated.
 *
 * Pure like the other rule modules: it receives the cells of a worksheet and
 * returns tiers plus findings. Reading the file and writing the table is the
 * service's business (srv/matrix-workbook.ts, srv/procurement-service.ts).
 *
 * The checks are the two properties the approval-policy tests assert for the
 * built-in matrix. A matrix that violates them is refused, because it would
 * make a riskier or a more expensive requisition cheaper to approve - which
 * is exactly the loophole the whole approval process exists to close.
 */

/** Codes of this module. CAP side only - the ABAP side has no maintained matrix. */
export const MATRIX_MSG = {
  EMPTY: 'PR420',
  NOT_A_NUMBER: 'PR421',
  INVALID_LEVEL: 'PR422',
  NOT_ASCENDING: 'PR423',
  LAST_TIER_NOT_OPEN: 'PR424',
  RISKIER_IS_CHEAPER: 'PR425',
  MORE_EXPENSIVE_IS_CHEAPER: 'PR426'
} as const;

export type MatrixMessageCode = (typeof MATRIX_MSG)[keyof typeof MATRIX_MSG];

/** One problem with an uploaded matrix. `row` is the 1-based spreadsheet row. */
export interface MatrixFinding {
  code: MatrixMessageCode;
  messageKey: string;
  args: Array<string | number>;
  row?: number;
}

export interface ParsedMatrix {
  tiers: ApprovalTier[];
  findings: MatrixFinding[];
}

const RISK_CLASSES: readonly RiskClass[] = ['A', 'B', 'C'];

/**
 * Words a person types for "no upper limit" in the last row - including what
 * the export itself writes there in either language (MATRIX_OPEN_ENDED), so a
 * downloaded workbook uploads again unchanged.
 */
const OPEN_ENDED = new Set([
  '', '-', '∞', 'inf', 'infinity', 'open', 'and above', 'unbegrenzt', 'offen', 'darüber', 'und darüber'
]);

function finding(
  code: MatrixMessageCode,
  messageKey: string,
  args: Array<string | number> = [],
  row?: number
): MatrixFinding {
  return row === undefined ? { code, messageKey, args } : { code, messageKey, args, row };
}

/**
 * A cell as text. Spreadsheet cells can be numbers, strings, booleans, dates or
 * objects; anything that is not a plain value counts as empty rather than
 * turning into "[object Object]" in an error message.
 */
export function cellText(cell: unknown): string {
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return '';
}

/** A number as a spreadsheet delivers it: 25000, "25.000", "25,000.00", "25.000,00 EUR". */
export function parseAmount(cell: unknown): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (cell === null || cell === undefined) return null;
  let text = cellText(cell).replace(/[€\s]|EUR/gi, '');
  if (!text) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  // The separator that comes last is the decimal separator - if it is
  // followed by one or two digits. Otherwise both are thousands separators.
  const decimalAt = Math.max(lastComma, lastDot);
  const decimals = decimalAt >= 0 ? text.length - decimalAt - 1 : 0;
  if (decimalAt >= 0 && decimals > 0 && decimals <= 2) {
    text = text.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + text.slice(decimalAt + 1);
  } else {
    text = text.replace(/[.,]/g, '');
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseLevel(cell: unknown): ApprovalLevel | null {
  const text = cellText(cell).trim().toUpperCase().replace(/^L/, '');
  const level = Number(text);
  return level === 1 || level === 2 || level === 3 ? level : null;
}

/**
 * Reads the matrix from worksheet rows. The first row is the header; every
 * following non-empty row is one tier: net value up to (exclusive) | level for
 * risk class A | B | C. The last tier has no upper limit.
 */
export function parseMatrixRows(rows: ReadonlyArray<ReadonlyArray<unknown>>): ParsedMatrix {
  const findings: MatrixFinding[] = [];
  const tiers: ApprovalTier[] = [];

  const dataRows = rows
    .map((cells, index) => ({ cells, row: index + 1 }))
    .slice(1)
    .filter(({ cells }) => cells.some((cell) => cellText(cell).trim() !== ''));

  if (dataRows.length === 0) {
    return { tiers, findings: [finding(MATRIX_MSG.EMPTY, 'MATRIX_EMPTY')] };
  }

  dataRows.forEach(({ cells, row }, index) => {
    const isLast = index === dataRows.length - 1;
    const rawLimit = cells[0];
    const limitText = cellText(rawLimit).trim().toLowerCase();

    let maxValue: number;
    if (OPEN_ENDED.has(limitText)) {
      if (!isLast) {
        findings.push(finding(MATRIX_MSG.NOT_A_NUMBER, 'MATRIX_NOT_A_NUMBER', [cellText(rawLimit)], row));
        return;
      }
      maxValue = Infinity;
    } else {
      const parsed = parseAmount(rawLimit);
      if (parsed === null || parsed <= 0) {
        findings.push(finding(MATRIX_MSG.NOT_A_NUMBER, 'MATRIX_NOT_A_NUMBER', [cellText(rawLimit)], row));
        return;
      }
      maxValue = parsed;
    }

    const levels: Partial<Record<RiskClass, ApprovalLevel>> = {};
    RISK_CLASSES.forEach((riskClass, column) => {
      const level = parseLevel(cells[column + 1]);
      if (level === null) {
        findings.push(
          finding(MATRIX_MSG.INVALID_LEVEL, 'MATRIX_INVALID_LEVEL', [riskClass, cellText(cells[column + 1])], row)
        );
      } else {
        levels[riskClass] = level;
      }
    });
    if (Object.keys(levels).length === RISK_CLASSES.length) {
      tiers.push({ maxValue, levels: levels as Record<RiskClass, ApprovalLevel> });
    }
  });

  // Structural checks only make sense on rows that parsed.
  if (findings.length === 0) findings.push(...validateMatrix(tiers, dataRows.map(({ row }) => row)));
  return { tiers, findings };
}

/**
 * Checks a matrix for the properties the approval process depends on.
 *
 * @param rowNumbers spreadsheet rows of the tiers, for pointing at the culprit
 */
export function validateMatrix(tiers: readonly ApprovalTier[], rowNumbers: readonly number[] = []): MatrixFinding[] {
  const findings: MatrixFinding[] = [];
  const rowOf = (index: number): number | undefined => rowNumbers[index];

  if (tiers.length === 0) return [finding(MATRIX_MSG.EMPTY, 'MATRIX_EMPTY')];

  const last = tiers[tiers.length - 1];
  if (last && Number.isFinite(last.maxValue)) {
    findings.push(finding(MATRIX_MSG.LAST_TIER_NOT_OPEN, 'MATRIX_LAST_TIER_NOT_OPEN', [], rowOf(tiers.length - 1)));
  }

  tiers.forEach((tier, index) => {
    const previous = tiers[index - 1];
    // An open ended tier anywhere but last already fails LAST_TIER_NOT_OPEN or
    // NOT_ASCENDING below; infinity itself has no minor units to compare.
    const comparable = previous && Number.isFinite(previous.maxValue) && Number.isFinite(tier.maxValue);
    if (previous && (!Number.isFinite(previous.maxValue) || (comparable && toMinorUnits(tier.maxValue) <= toMinorUnits(previous.maxValue)))) {
      findings.push(finding(MATRIX_MSG.NOT_ASCENDING, 'MATRIX_NOT_ASCENDING', [tier.maxValue], rowOf(index)));
    }

    // Within a tier: a riskier supplier never needs fewer signatures.
    if (tier.levels.B < tier.levels.A || tier.levels.C < tier.levels.B) {
      findings.push(finding(MATRIX_MSG.RISKIER_IS_CHEAPER, 'MATRIX_RISKIER_IS_CHEAPER', [], rowOf(index)));
    }

    // Down the tiers: a larger amount never needs fewer signatures.
    if (previous) {
      for (const riskClass of RISK_CLASSES) {
        if (tier.levels[riskClass] < previous.levels[riskClass]) {
          findings.push(
            finding(MATRIX_MSG.MORE_EXPENSIVE_IS_CHEAPER, 'MATRIX_MORE_EXPENSIVE_IS_CHEAPER', [riskClass], rowOf(index))
          );
          break;
        }
      }
    }
  });

  return findings;
}

/** Stored rows (position order) back to tiers. A null limit is the open ended tier. */
export function tiersFromRows(
  rows: ReadonlyArray<{ maxValue?: number | string | null; levelA: number; levelB: number; levelC: number }>
): ApprovalTier[] {
  return rows.map((row) => ({
    maxValue: row.maxValue === null || row.maxValue === undefined ? Infinity : Number(row.maxValue),
    levels: {
      A: Number(row.levelA) as ApprovalLevel,
      B: Number(row.levelB) as ApprovalLevel,
      C: Number(row.levelC) as ApprovalLevel
    }
  }));
}

/** Tiers to the rows the database stores. */
export function tiersToRows(
  tiers: readonly ApprovalTier[]
): Array<{ position: number; maxValue: number | null; levelA: number; levelB: number; levelC: number }> {
  return tiers.map((tier, index) => ({
    position: (index + 1) * 10,
    maxValue: Number.isFinite(tier.maxValue) ? tier.maxValue : null,
    levelA: tier.levels.A,
    levelB: tier.levels.B,
    levelC: tier.levels.C
  }));
}
