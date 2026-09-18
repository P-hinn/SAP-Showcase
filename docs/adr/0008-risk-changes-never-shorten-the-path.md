# ADR 0008: A risk change tightens an open approval path, never shortens it

**Status:** accepted

## Context

The scenario promises that a supplier downgrade makes open requisitions more
expensive to approve *immediately*, not at the next submit. That leaves a
question the approval matrix alone does not answer: what happens to a
requisition that is already in approval when its supplier gets **safer**?

Both directions are defensible. Following the matrix in both directions is
consistent. Never going back is conservative.

## Decision

`reassessApprovalPath()` (`cap/srv/lib/approval-policy.ts`) derives the path
from the matrix and then applies the status:

- **Draft:** follows the matrix in both directions. Nobody has signed anything.
- **In approval, riskier:** the required level rises, the missing levels are
  appended as pending steps, signatures already given stay valid.
- **In approval, safer:** the path stays as it was submitted.
- **Approved, rejected, closed:** untouched.

Every adjustment writes a `PATH` entry into the requisition's audit trail, with
the supplier, the old and the new risk class and the old and the new level.

## Consequences

**An approver is never removed from a running approval.** If the department
head was asked to sign, that request is not withdrawn because a rating improved
an hour later. The alternative - dropping a pending level - would let a
supplier update quietly cancel a control.

**A requisition can be stricter than the matrix says.** After a downgrade *and*
a later upgrade, an in-approval requisition still carries the higher level. The
audit trail explains why, and withdrawing and resubmitting re-derives it.

**The rule is pure and tested without a database.** The handler only reads the
affected requisitions, calls the function and writes what it returns.

## Revisit when

A customer wants the level to follow the matrix downwards as well. That is a
one-line change in the function plus its tests - and a conversation with their
internal audit, which is the actual reason this is an ADR and not a detail.
