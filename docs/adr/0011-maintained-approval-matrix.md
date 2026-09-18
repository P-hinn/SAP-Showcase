# ADR 0011: The approval matrix is maintained data, replaced as a whole

**Status:** accepted

## Context

The approval matrix was a constant in `approval-policy.ts`. That is right for
the rule module and for the ABAP comparison, but wrong for a procurement lead:
changing a threshold would mean a developer, a build and a deployment.

## Decision

- The matrix lives in the table `ApprovalThresholds`, seeded with exactly the
  built-in `APPROVAL_MATRIX` (a fixture test asserts that).
  `determineRequiredLevel()` and `reassessApprovalPath()` take the matrix as an
  optional parameter; without it they use the constant, so the ABAP side and
  every existing test stay unchanged.
- It is maintained **in Excel**: export the matrix in force, edit it, upload it.
  An upload is first only **previewed** - parsed and checked, nothing stored.
- `lib/approval-matrix.ts` refuses a matrix that would make a riskier or a more
  expensive requisition cheaper to approve, a last tier with an upper limit,
  limits that do not rise, and levels outside 1-3 - with the spreadsheet row of
  every problem.
- Activation **replaces the matrix as a whole**, never row by row, and applies
  to drafts and new submissions. Requisitions already in approval keep the
  path they were submitted with - the same principle as ADR 0008.
- Only `ProcurementAdmin` may preview or activate; everybody may export.

## Consequences

**The rules the approval process depends on are enforced on the data, not on
the author.** The same two properties the unit tests assert for the built-in
matrix are now checks a maintained matrix has to pass.

**The two stacks diverge here.** The ABAP side keeps the constant. That is
documented in the parity section of `docs/business-rules.md`.

**No history of matrices.** The table carries who changed it last and when; a
previous version is not kept. The export is the backup.

## Revisit when

An auditor asks which matrix was in force on a given date. Then activation
writes a versioned copy, and requisitions store the version they were decided
with.
