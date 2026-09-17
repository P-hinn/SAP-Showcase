# ADR 0001: Build the same requirement on-stack **and** side-by-side

**Status:** accepted

## Context

"Clean Core" is the single most repeated phrase in SAP projects right now, and
it is usually reduced to a slogan: *don't modify the core*. That leaves the
actual question unanswered. Both ABAP Cloud and BTP side-by-side extensions are
clean core compliant. The decision between them is an engineering trade-off,
and it gets made in the first two weeks of a project, usually with very little
evidence on the table.

## Decision

Implement the identical requirement twice - as a RAP business object in ABAP
Cloud and as a CAP service on BTP - and keep the rule layer structurally
identical so the two can be compared line by line.

## The comparison this produced

| | On-stack (ABAP Cloud / RAP) | Side-by-side (CAP on BTP) |
|---|---|---|
| **Data access** | Direct. `I_Supplier` is a join away. | Needs replication or a remote service per read. |
| **Transactional integrity** | One LUW with the S/4 document. | Two systems, so eventual consistency and compensation. |
| **Release coupling** | Follows the S/4 upgrade cycle. | Independent. Deploy on a Tuesday afternoon. |
| **Skills needed** | ABAP Cloud, RAP, ADT. | TypeScript or Java, CDS, Cloud Foundry, CI/CD. |
| **Test feedback loop** | Minutes. Needs a system. | Seconds. `npm test` on a laptop. |
| **Scaling** | The application server's. | Independent, elastic. |
| **Non-SAP consumers** | Possible, but the S/4 system is in the path. | Natural. |
| **Cost of the runtime** | Already paid for. | A separate BTP bill. |

## Consequences

**This requirement belongs on-stack.** Two of the criteria decide it:

1. The approval must be transactionally consistent with the requisition. A
   side-by-side approval that succeeds while the S/4 document write fails is a
   compensation problem nobody wants to own.
2. The risk score needs supplier master data on every read. On-stack that is a
   join; side-by-side it is a replication pipeline with its own staleness
   window - the CAP implementation in this repository quietly demonstrates
   exactly that cost, because it needs its own `Suppliers` table.

**Side-by-side would win if any of these were true:** the consumer is a
non-SAP portal or a mobile app; the scoring needs a Python ML model; the
release cadence has to be weekly; the S/4 system is a hosted one the team
cannot deploy into.

**What it costs to have both:** every rule change touches two code bases. The
message numbers, thresholds and weights are deliberately identical, and both
test suites assert the same properties, so a one-sided change fails a build
rather than being discovered in production. In a real project you would pick
one - the point of having both here is to be able to justify the pick.

## Revisit when

The S/4 system moves to a hosted model without developer access, or a second
non-SAP consumer appears. Either flips criterion 1 or 2.
