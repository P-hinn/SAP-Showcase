import cds from '@sap/cds';

import { APPROVAL_MATRIX, type ApprovalTier } from './lib/approval-policy';
import { parseMatrixRows, tiersFromRows, tiersToRows, type MatrixFinding } from './lib/approval-matrix';
import { WorkbookError, readMatrixWorkbook, writeMatrixWorkbook } from './matrix-workbook';

/**
 * Maintaining the approval matrix: export it as a workbook, preview an
 * upload, activate it. The rules of what a valid matrix is live in
 * lib/approval-matrix.ts; this file only moves data between the request, the
 * workbook and the ApprovalThresholds table.
 *
 * A new matrix applies to drafts and to every requisition submitted from then
 * on. Requisitions already in approval keep the path they were submitted with
 * - the same principle as ADR 0008: a running approval is not rewritten
 * behind the approvers' backs.
 */

/** The shape of an ApprovalThresholds row. */
interface ThresholdRow {
  position: number;
  maxValue?: number | string | null;
  levelA: number;
  levelB: number;
  levelC: number;
}

/** The matrix in force: the maintained one, or the built-in one if none is stored. */
export async function loadMatrix(thresholds: unknown): Promise<ApprovalTier[]> {
  const rows: ThresholdRow[] = await SELECT.from(thresholds as string).orderBy('position');
  return rows.length ? tiersFromRows(rows) : [...APPROVAL_MATRIX];
}

/** A localized text from _i18n/messages*.properties for the request language. */
function text(req: cds.Request, key: string, args: Array<string | number> = []): string {
  const i18n = (cds as unknown as { i18n: { messages: { at(key: string, locale?: string, args?: unknown[]): string } } })
    .i18n;
  return i18n.messages.at(key, req.locale, args) ?? key;
}

async function parseUpload(req: cds.Request): Promise<{ tiers: ApprovalTier[]; findings: MatrixFinding[] } | null> {
  const { file } = req.data as { file?: string };
  try {
    return parseMatrixRows(await readMatrixWorkbook(file ?? ''));
  } catch (error) {
    if (!(error instanceof WorkbookError)) throw error;
    req.error({ code: 'PR427', message: 'MATRIX_FILE_UNREADABLE', status: 400 });
    return null;
  }
}

/** Reports what an upload would change. Stores nothing. */
export async function previewApprovalMatrix(req: cds.Request): Promise<unknown> {
  const parsed = await parseUpload(req);
  if (!parsed) return;
  return {
    tiers: tiersToRows(parsed.tiers).map(({ maxValue, levelA, levelB, levelC }) => ({ maxValue, levelA, levelB, levelC })),
    findings: parsed.findings.map((finding) => ({
      code: finding.code,
      message: text(req, finding.messageKey, finding.args),
      row: finding.row ?? null
    }))
  };
}

/** Replaces the matrix as a whole - or refuses with every finding at once. */
export async function activateApprovalMatrix(req: cds.Request, thresholds: unknown): Promise<unknown> {
  const parsed = await parseUpload(req);
  if (!parsed) return;

  if (parsed.findings.length) {
    for (const finding of parsed.findings) {
      req.error({ code: finding.code, message: finding.messageKey, args: finding.args, status: 400 });
    }
    return;
  }

  await DELETE.from(thresholds as string);
  await INSERT.into(thresholds as string).entries(tiersToRows(parsed.tiers));
  req.info({ message: 'MATRIX_ACTIVATED', args: [parsed.tiers.length] });
  return parsed.tiers.length;
}

/** The matrix in force as a workbook - also the template for an upload. */
export async function exportApprovalMatrix(req: cds.Request, thresholds: unknown): Promise<string> {
  return writeMatrixWorkbook(await loadMatrix(thresholds), {
    sheet: text(req, 'MATRIX_SHEET'),
    limit: text(req, 'MATRIX_COLUMN_LIMIT'),
    riskA: text(req, 'MATRIX_COLUMN_RISK', ['A']),
    riskB: text(req, 'MATRIX_COLUMN_RISK', ['B']),
    riskC: text(req, 'MATRIX_COLUMN_RISK', ['C']),
    openEnded: text(req, 'MATRIX_OPEN_ENDED')
  });
}
