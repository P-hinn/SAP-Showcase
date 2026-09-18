# Business rules

This is the document a procurement lead reads and signs off. Every rule here is
implemented twice and tested twice; the file references tell you where.

## 1. Approval matrix

How many signatures a requisition needs, by net value and by the worst supplier
risk class in the document:

| Net value (EUR) | Risk A (low) | Risk B (medium) | Risk C (high) |
|---|:---:|:---:|:---:|
| below 5,000 | L1 | L1 | **L2** |
| 5,000 – 24,999 | L1 | **L2** | L2 |
| 25,000 – 99,999 | L2 | L2 | **L3** |
| 100,000 and above | L3 | L3 | L3 |

| Level | Who | Role |
|---|---|---|
| L1 | Team Lead | `ApproverL1` / `ZPR_APPROVER_L1` |
| L2 | Department Head | `ApproverL2` / `ZPR_APPROVER_L2` |
| L3 | CFO | `ApproverL3` / `ZPR_APPROVER_L3` |

Approval is **cumulative**: a requisition that needs L3 is approved by L1, then
L2, then L3. The chain is materialised on submit, so the object page shows the
whole path up front instead of revealing it one step at a time.

Two properties are asserted by tests rather than left to good intentions:

- **A riskier supplier is never cheaper to approve.** For every value, L(C) ≥
  L(B) ≥ L(A).
- **A more expensive requisition is never cheaper to approve.** For every risk
  class, the level never drops as the value grows.

An unassessed supplier counts as **medium** risk - not knowing must not be the
cheap option.

> Implemented in `cap/srv/lib/approval-policy.ts` → `APPROVAL_MATRIX` and
> `abap/src/classes/zcl_pr_approval_policy.clas.abap` → `APPROVAL_MATRIX( )`.
> On the CAP side this is the default; a procurement admin can replace it with
> a maintained matrix - see section 11.
> Boundaries are exclusive; 4,999.99 EUR is still the cheaper tier.

## 2. Supplier risk score

A weighted score from 0 (no concerns) to 100 (do not order here):

| Indicator | Weight | 0 points | 100 points | Source |
|---|---:|---|---|---|
| Financial rating | 40 % | AAA | D | rating agency feed |
| On time delivery rate | 25 % | 100 % on time | 0 % on time | purchase order history |
| Quality incidents (12 months) | 20 % | none | 8 or more | QM notifications Q2/Q3 |
| Country risk | 10 % | OECD category 0 | highest category | compliance |
| ISO 9001 certification | 5 % | certified | not certified | supplier self disclosure |

| Score | Risk class |
|---|---|
| 0 – 24 | **A** low |
| 25 – 54 | **B** medium |
| 55 – 100 | **C** high |

**A purchasing block overrules everything.** A blocked supplier scores 100 and
lands in class C regardless of its indicators - and a requisition that uses one
cannot be submitted at all.

**Missing data is never rewarded.** An unrated supplier is scored like a `B`
rating (50 points), an unknown country like 50 points, a supplier without
delivery history like 80 % on time. An incomplete profile can never score
better than a complete one - that property has its own test on both stacks.

A requisition inherits the **worst** risk class of all its item suppliers. One
bad supplier in one item raises the approval level for the whole document.

> `cap/srv/lib/risk-scoring.ts` and
> `abap/src/classes/zcl_pr_risk_scoring.clas.abap`.

## 3. Submit validations

All of them are checked at once; the requester gets one list, not one error per
round trip.

| Code | Rule |
|---|---|
| `PR001` | A requisition must contain at least one item. |
| `PR002` | Every item needs a quantity greater than zero. |
| `PR003` | A unit price must not be negative. |
| `PR004` | A delivery date must not be in the past (today is allowed). |
| `PR005` | No item may use a supplier with a purchasing block. |
| `PR006` | The requisition must fit into the remaining cost center budget. |
| `PR007` | A requisition needs a title. |
| `PR012` | A requisition needs a cost center. |

The budget check compares against `annual budget − consumed budget`. Spending
the remainder **to the last cent is allowed**; one cent more is not. Cost
centers without a maintained budget are not checked.

## 4. Decision validations

| Code | Rule |
|---|---|
| `PR008` | Nobody decides on a requisition they raised themselves. |
| `PR009` | The action must be allowed in the current status. |
| `PR010` | The approver needs the role of the level that is pending. |
| `PR011` | A completed approval chain accepts no further decisions. |

`PR008` is **segregation of duties** and it is checked against both the
requester and the creator, so raising a requisition "on behalf of" someone else
does not open a back door. It is deliberately a business rule rather than an
authorisation check: the user may well hold the approver role - just not for
this document.

## 5. Lifecycle

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> InApproval: submit
  InApproval --> InApproval: approve<br/>(level < required)
  InApproval --> Approved: approve<br/>(final level)
  InApproval --> Rejected: reject
  InApproval --> Draft: withdraw<br/>(only before the first approval)
  Rejected --> Draft: reopen
  Approved --> Closed: close
  Closed --> [*]
```

Everything not drawn here is refused with `PR009`. `Closed` is a dead end -
there is a test that walks every action against a closed requisition and
expects all of them to fail.

**Withdrawing is only possible while nobody has signed off.** Once L1 has
approved, the requester cannot quietly pull the document back and change it.

## 6. Side effects of an approval

The moment the **last** signature is given:

1. the status becomes `Approved` and `completedAt` is stamped,
2. the requisition value is added to the cost center's consumed budget.

The budget is committed at the last signature and not when the purchase order
is created. Otherwise two requisitions could both pass the budget check against
the same remaining amount and both be approved.

## 7. A supplier risk change acts on open requisitions

The risk class of a supplier is not only read at submit time. Whenever it
changes - through `updateFinancialRating` (the rating agency feed),
`recalculateRisk`, or a sync that brings a purchasing block from S/4HANA - every
**draft** and **in approval** requisition with an item from that supplier is
re-derived:

| Status of the requisition | Supplier got riskier | Supplier got safer |
|---|---|---|
| Draft | new level from the matrix | new level from the matrix |
| In approval | missing levels are **added** as pending steps | path stays as submitted |
| Approved, rejected, closed | unchanged | unchanged |

Signatures already given stay valid, and an approver who has been asked is
never silently removed. Every adjustment is written to the audit trail of the
requisition (event `PATH`) with supplier, old and new risk class and old and
new level.

> `reassessApprovalPath()` in `cap/srv/lib/approval-policy.ts`, with the
> reasoning in [`adr/0008`](adr/0008-risk-changes-never-shorten-the-path.md).
> **CAP side only** - see the parity note below.

## 8. Audit trail

Every requisition carries an append-only history: submitted, approved,
rejected, withdrawn, reopened, ordered - plus the automatic `PATH` adjustments
above. Each entry holds the time, the user, the approval level it refers to and
a language neutral detail (comment, rejection reason, purchase order number, or
what changed).

The trail is written by the service, never by a client: `RequisitionEvents` is
read-only in the OData service.

## 9. Purchase order creation

`close` converts an approved requisition into purchase orders in S/4HANA - one
per supplier, because a purchase order has exactly one supplier. The order
numbers come back from S/4HANA and are stored on the requisition and on each
item, and the requisition moves to `Closed`. If S/4HANA refuses, nothing is
stored and the requisition stays approved (`PR406`).

> `purchaseOrdersFor()` in `cap/srv/lib/s4-mapping.ts`,
> [`adr/0009`](adr/0009-s4-integration-via-released-apis.md). **CAP side only.**

## 10. Document numbers

`PR-<year>-<6 digits>`, assigned on submit, kept on resubmission. A rejected and
reworked requisition keeps its number; a copy gets a new one.

> The demo implementation reads the current maximum. A productive one uses a
> number range object - see [`adr/0005`](adr/0005-number-assignment.md).

## 11. Maintaining the approval matrix

The matrix in section 1 is the seed of the table `ApprovalThresholds`. A
procurement admin replaces it through an Excel upload:

1. **Export** the matrix in force (anybody may): one row per value tier,
   columns "net value up to (exclusive)" and the level for risk class A, B, C.
   The last row says "and above" / "und darüber".
2. **Upload** the edited file. It is only previewed - parsed and checked,
   nothing stored.
3. **Activate** it, if the preview shows no findings. The matrix is replaced as
   a whole.

A matrix is refused when:

| Code | Rule |
|---|---|
| `PR420` | It has no tiers. |
| `PR421` | A value limit is not a positive amount, or a row other than the last is open. |
| `PR422` | A level is not 1, 2 or 3. |
| `PR423` | The value limits do not rise from row to row. |
| `PR424` | The last row has an upper limit. |
| `PR425` | Within a tier, a riskier supplier needs fewer levels (A ≤ B ≤ C is violated). |
| `PR426` | Down the tiers, a higher value needs fewer levels than the row above. |
| `PR427` | The file is not an `.xlsx` workbook of at most 512 KB. |

A new matrix applies to drafts and to every submission from then on.
Requisitions already in approval keep their path.

> `cap/srv/lib/approval-matrix.ts`, [`adr/0011`](adr/0011-maintained-approval-matrix.md).
> **CAP side only.**

## 12. Notifications

| Event | Who is notified |
|---|---|
| Submitted | the role of level 1 |
| Approved, chain not complete | the role of the next level |
| Approved, last level | the requester |
| Rejected | the requester |
| Approval path adjusted (section 7) | the requester |
| Purchase order created | the requester |
| Withdrawn, reopened | nobody - the requester did it |

An approval request is never shown to its own requester, even if they hold the
role. Notifications are shown in the app; an outbound channel subscribes to the
`NotificationCreated` event.

> `cap/srv/lib/notifications.ts`, [`adr/0010`](adr/0010-notifications-to-roles-in-app-first.md).
> **CAP side only.**


---

## Parity between the two implementations

Rules 1 to 6 and 10 are implemented **twice** - in `cap/srv/lib` and in
`abap/src/classes` - and tested twice, with the same message numbers on both
sides (CI compares them).

Rules 7 to 9 and 11 to 12 (risk propagation, audit trail, purchase order
creation, the maintained approval matrix, notifications) exist on the **CAP
side only**. They were built for the customer demo, where the
side-by-side stack is the one that runs. Porting them to RAP is a known gap,
not an oversight: the rules themselves are framework free and would move as
they are, the plumbing (determinations, the S/4HANA call) would be rewritten.
