# ADR 0002: Business rules live outside the framework

**Status:** accepted

## Context

The natural place for an approval rule in RAP is a validation method in the
behaviour pool. The natural place in CAP is a `srv.before()` handler. Both are
easy to write and both are expensive to test: a RAP handler needs a system, a
transaction and a database; a CAP handler needs a booted service and an HTTP
round trip.

Rules that are expensive to test are rules that get tested once, by hand, on
the happy path.

## Decision

Every business rule lives in a plain class or module with no framework
dependency:

- `ZCL_PR_APPROVAL_POLICY`, `ZCL_PR_RISK_SCORING` - no `SELECT`, no EML,
  no RAP types beyond the DDIC types they need for their signatures.
- `srv/lib/approval-policy.ts`, `srv/lib/risk-scoring.ts`, `srv/lib/money.ts` -
  no `require('@sap/cds')`.

Handlers read, call a rule, and write. They contain no `IF` that a business
analyst would want to argue about.

## Consequences

**The tests got written.** 101 Jest tests and 51 ABAP Unit tests cover the
rules, and they run in about a second each. The integration tests then only
have to prove the wiring, which is a much smaller job - 38 of them are enough.

**The rules became reviewable by non-developers.** The approval matrix is a
table literal; you can put it in front of a procurement lead.

**The rules became comparable across stacks.** That is what makes
[ADR 0001](0001-onstack-vs-sidebyside.md) more than an opinion.

**It costs an indirection.** A reader chasing "what happens on submit" has to
open two files instead of one. The handler methods are kept short and named
after the rule they call, so the second file is obvious.

**Resolving data stays in the handler**, which is the part that needs care: the
rule modules receive *resolved* input (risk points, not a rating code), so
whoever calls them owns the joins. On the ABAP side that is
`ZI_PR_SupplierRiskInput`, a CDS view that resolves both customizing tables in
one read - the class never learns that they exist.

## Revisit when

A rule needs to make its own database decision (for example, a validation that
depends on a table the caller cannot know about in advance). At that point the
rule module gets a narrow interface for it, not a `SELECT`.
