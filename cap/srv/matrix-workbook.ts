import ExcelJS from 'exceljs';

import type { ApprovalTier } from './lib/approval-policy';

/**
 * The approval matrix as an Excel workbook - the format a procurement lead
 * actually edits. Reading and writing only; whether the content makes sense
 * is decided by lib/approval-matrix.ts.
 */

/** Uploads larger than this are not an approval matrix. */
const MAX_BYTES = 512 * 1024;

export class WorkbookError extends Error {}

/** Cell values of the first worksheet, row by row, as plain values. */
export async function readMatrixWorkbook(base64: string): Promise<unknown[][]> {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BYTES) throw new WorkbookError('size');

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new WorkbookError('format');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new WorkbookError('format');

  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: unknown[] = [];
    for (let column = 1; column <= 4; column++) {
      const value = row.getCell(column).value;
      // Formulas arrive as { formula, result }, rich text as { richText }.
      if (value && typeof value === 'object' && 'result' in value) cells.push(value.result);
      else if (value && typeof value === 'object' && 'richText' in value) {
        cells.push(value.richText.map((part) => part.text).join(''));
      } else cells.push(value);
    }
    rows[rowNumber - 1] = cells;
  });
  return Array.from(rows, (cells) => cells ?? []);
}

/**
 * Writes the matrix as a workbook in the layout readMatrixWorkbook expects,
 * so "download, edit, upload" round-trips without surprises.
 */
export async function writeMatrixWorkbook(
  tiers: readonly ApprovalTier[],
  labels: { sheet: string; limit: string; riskA: string; riskB: string; riskC: string; openEnded: string }
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(labels.sheet);
  sheet.columns = [
    { header: labels.limit, width: 26 },
    { header: labels.riskA, width: 16 },
    { header: labels.riskB, width: 16 },
    { header: labels.riskC, width: 16 }
  ];
  sheet.getRow(1).font = { bold: true };

  for (const tier of tiers) {
    const row = sheet.addRow([
      Number.isFinite(tier.maxValue) ? tier.maxValue : labels.openEnded,
      tier.levels.A,
      tier.levels.B,
      tier.levels.C
    ]);
    row.getCell(1).numFmt = '#,##0.00';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}
