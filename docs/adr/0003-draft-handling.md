# ADR 0003: Draft handling on, custom lock handling off

**Status:** accepted

## Context

A purchase requisition with items is a document, not a form. A requester starts
it on Monday, finds out the price on Wednesday and submits on Thursday. Without
draft handling, that requires either saving incomplete data as if it were real,
or losing the work.

Both frameworks offer draft handling as a switch, and both make you pay for it.

## Decision

Enable draft handling on the requisition root in both stacks
(`with draft` / `@odata.draft.enabled`), and use the framework's own locking.

Validations run **on save**, not on modify, so a half finished draft is allowed
to be half finished. RAP's `draft determine action Prepare` runs the same save
validations early, so the user sees the problems before pressing Save rather
than after.

## Consequences

**Three extra tables on the ABAP side** (`ZPR_REQ_HDR_D`, `ZPR_REQ_ITM_D`,
`ZPR_APPROVAL_D`) and doubled entity sets on both sides. That is the visible
price.

**The invisible price is the one that bites: draft events are different
events.** In CAP, editing a draft fires `NEW` and `PATCH` on the `.drafts`
entity - not `CREATE` and `UPDATE` on the active one. A determination
registered only on `CREATE`/`UPDATE` compiles, passes the API tests, and does
absolutely nothing in the Fiori object page, which is where users actually
spend their time. This project registers both:

```js
this.before(['CREATE', 'UPDATE'], PurchaseRequisitionItems, handler);
this.before(['NEW', 'PATCH'], PurchaseRequisitionItems.drafts, handler);
```

The integration test `draft handling > walks create -> add item -> activate`
exists specifically to catch that class of bug, and it caught it during
development.

**Locking is the framework's job.** RAP's `lock master` / `lock dependent by`
and CAP's draft locking already give one editor per document, with the lock tied
to the draft rather than to a session. A custom lock object would have to
reimplement timeout and takeover semantics that both frameworks already have.

## Revisit when

Requisitions need to be edited by two people at once (for example a requester
and a category manager working different items). That is a different
concurrency model and draft handling is the wrong tool for it.
