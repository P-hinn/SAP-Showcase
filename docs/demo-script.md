# Demo script

A 15 minute walkthrough for an interview or a customer pitch. The point is not
to show that the code runs - it is to show the reasoning behind it, because
that is the part that is hard to hire.

Before you start: `cd cap && npm install && npm start`.

---

## Minute 0-2: the question, not the app

Open [`docs/adr/0001`](adr/0001-onstack-vs-sidebyside.md), not the UI.

> "Every SAP customer right now is asking the same question: on-stack or
> side-by-side? I built the same requirement both ways so I could answer it
> with a comparison table instead of an opinion. Here is the table, and here is
> my recommendation for this particular requirement - on-stack, for two
> reasons: transactional consistency with the S/4 document, and the fact that
> the risk score needs supplier master data on every single read."

If they push back ("why would you ever build it twice?"), agree with them:

> "In a real project you pick one. Building both is what let me write that
> table honestly. And note what the CAP implementation had to do that the RAP
> one did not - it needs its own `Suppliers` table. That replication is the
> hidden cost of side-by-side, and it is visible in the code rather than on a
> slide."

## Minute 2-5: the rules, in front of a business person

Open `cap/srv/lib/approval-policy.ts` and scroll to `APPROVAL_MATRIX`.

> "This is the approval matrix. It is a table you can put in front of a
> procurement lead, and it is the actual runtime behaviour - there is no second
> copy of it in a handler somewhere."

Then `abap/src/classes/zcl_pr_approval_policy.clas.abap`, `approval_matrix( )`.

> "Same table, ABAP. Same thresholds, same message numbers. If someone changes
> one and not the other, a build goes red."

Then the property tests - `approval-policy.test.ts`,
`is never cheaper for a riskier supplier`:

> "These two do not test a value. They test a property: a riskier supplier is
> never cheaper to approve, and a more expensive requisition is never cheaper
> to approve. Those are the two ways an approval matrix goes wrong in a way
> nobody notices for a year."

## Minute 5-9: it actually works

Walk [`demo-walkthrough.md`](demo-walkthrough.md) - every request and response
in it was recorded against the running service.

Three moments to stop at:

1. **Segregation of duties.** Rita tries to approve her own requisition and
   gets two errors at once, `PR008` and `PR010`.
   > "Two things about this response. First, it collects every problem instead
   > of stopping at the first - one round trip, not two. Second, the
   > self-approval check is a *business rule*, not an authorisation check. Rita
   > may well hold the approver role. She just may not use it here. Putting
   > that in the authorisation layer is a classic mistake and it is the first
   > thing an auditor asks about."

2. **The budget check.** `PR006`, with the actual numbers in the message.
   > "`Cost center 2000-5001 has 25000.00 left, the requisition asks for
   > 49800.00.` A message that makes the user's next move obvious costs nothing
   > extra to write."

3. **The budget commitment.** Show the cost center before and after the final
   approval.
   > "The budget is committed at the last signature, not when the purchase
   > order is created. Otherwise two requisitions both pass the check against
   > the same remaining amount and both get approved. That is a race condition
   > in the *business process*, not in the code."

## Minute 9-12: the bug they should ask about

Open [ADR 0003](adr/0003-draft-handling.md), the CAP snippet:

```js
this.before(['CREATE', 'UPDATE'], PurchaseRequisitionItems, handler);
this.before(['NEW', 'PATCH'], PurchaseRequisitionItems.drafts, handler);
```

> "Editing a draft does not fire CREATE or UPDATE - it fires NEW and PATCH, on
> the drafts entity. A determination registered only on the first line
> compiles, passes the API tests, and does nothing at all in the Fiori object
> page, which is the only place users ever go. I hit this during development.
> The test `draft handling > walks create -> add item -> activate` exists
> because of it."

This is the single most convincing thing in the repository, because it is an
honest account of a mistake and the test that now prevents it.

## Minute 12-14: the money one

[ADR 0004](adr/0004-money-handling.md).

> "ABAP has exact decimal arithmetic. TypeScript does not - `number` is an
> IEEE 754 double, and the type system changes nothing about that.
> `24999.999999999996` is an ordinary result of a multiplication and it is on
> the wrong side of a `< 25000` comparison, so roughly one requisition in a
> thousand silently takes the cheaper approval path. That is an audit finding,
> not a rounding inconvenience. Every comparison on the CAP side goes through
> integer cents. On the ABAP side that helper does not exist, because it is not
> needed - and the asymmetry is documented so nobody adds it 'for consistency'.
>
> This is the example I use when someone assumes types alone make code safe."

## Minute 14-15: what is missing, and why

> "No workflow engine - for three levels and one decision per level, a state
> machine in the application is cheaper than SAP Build Process Automation. The
> moment it needs deadlines, substitutions or parallel approvers, that flips.
>
> The document numbering is max-plus-one, which is wrong under concurrency.
> It is in ADR 0005 with the fix named, because a duplicate document number is
> not a crash - it is a support ticket three weeks later."

Ending on a known limitation is deliberate. Everyone claims their code is
clean; very few can tell you precisely where it is not.

---

## Questions to expect

**"Why no SAP Build Process Automation?"**
Cost and coupling. Three fixed levels, one decision each, no deadlines. BPA
adds a runtime, a licence and a second place where the process lives. The
lifecycle is eight lines in `approval-policy.ts`. The answer changes the moment
deadlines or substitutions appear.

**"How would you handle a supplier being blocked after approval?"**
Today nothing happens - the requisition is already approved. The right design
is an event on the supplier that re-evaluates open requisitions. The `close`
action is where that consumer would hook in, and `SupplierRiskExposure` in the
analytics service is already the query that finds the affected documents.

**"This is a lot for a demo. How long did it take?"**
Be honest about it. What matters is which parts were the expensive ones: the
domain model and the rule split took the longest, and the draft event bug cost
an hour. The Fiori annotations are the cheapest part of the whole thing.

**"What would you do differently in a real project?"**
Pick one stack. Use a number range object. Put the approval chain behind an
interface so the state machine can be replaced by a workflow engine without
touching the validations.
