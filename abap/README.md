# ABAP Cloud / RAP implementation

The same business object as the CAP service in [`../cap`](../cap), implemented
on-stack with the ABAP RESTful Application Programming Model.

Both implement the identical rule set. The message numbers are the same
(`ZPR_MSG 001..012`), the approval matrix is the same, the risk weights are the
same - so an incident ticket quotes the same code no matter which
implementation raised it, and the two test suites guard each other against
one-sided changes.

## What is in here

```
src/
├── dbtables/   7 database tables (DDL source)
├── cds/        interface views, projection views, metadata extensions,
│               abstract entities for the action parameters
├── behavior/   behaviour definitions (base + projection)
├── classes/    rule classes with ABAP Unit tests, behaviour pools,
│               virtual element calculator
└── services/   service definitions
```

## The parts worth reading first

| File | Why |
|------|-----|
| `classes/zcl_pr_approval_policy.clas.abap` | The approval matrix, the state machine and the submit validations. No SELECT, no RAP artefact - pure rules. |
| `classes/zcl_pr_approval_policy.clas.testclasses.abap` | 35 ABAP Unit tests for those rules. Runs without a database. |
| `classes/zcl_pr_risk_scoring.clas.abap` | The weighted supplier risk score, plus 16 unit tests next to it. |
| `behavior/zi_pr_requisition.bdef.asbdef` | Managed, draft enabled BO: determinations, validations, actions, side effects, feature control. |
| `classes/zbp_i_pr_requisition.clas.locals_imp.abap` | The behaviour pool. Reads, calls the rule classes, writes - no business logic of its own. |
| `cds/zi_pr_supplier.ddls.asddls` | The clean core piece: supplier master data is **joined** from the released `I_Supplier`, never copied. |

## Design decisions you can ask me about

**Rules live in plain classes, not in the behaviour pool.** A handler method
needs a RAP runtime, a transaction and a database to be executed. A class
method needs none of that, which is why 51 of the tests in this package run in
under a second and are part of every transport check.

**The header determination sits on the item.** Total value, risk class and
required approval level belong to the header, but only an item change can make
them wrong. A determination on the header would never fire when only an item
changed - so the determination that maintains them sits where the trigger is
and updates the parent.

**Feature control is a convenience, never a security boundary.** Every rule
that greys out a button is evaluated a second time inside the action. The
action is the one that counts.

**Supplier master data is extended, not replicated.** `ZPR_SUP_RISK` holds only
the five attributes S/4HANA has no field for. Name, country and the purchasing
block come from `I_Supplier` on every read, so a block set in the backend is
effective here immediately.

## Getting it into a system

The CDS views, behaviour definitions, classes, metadata extensions and service
definitions are stored in their ADT source form, which is exactly what abapGit
serialises - `.abapgit.xml` is set up for a `PREFIX` folder logic on `/src/`.

One thing to know before importing: the subfolders under `src/` group the
objects by kind so the package reads well on GitHub. abapGit's `PREFIX` folder
logic maps folders to *sub-packages*, not to object kinds. So either create the
matching sub-packages (`ZPR_PROCUREMENT_CDS`, `ZPR_PROCUREMENT_CLASSES`, ...)
or flatten `src/` into a single folder before pulling. Readability won here
because this package is read far more often than it is imported.

Two things are **not** in the repository and are created by ADT rather than by
hand:

1. **Draft tables** `ZPR_REQ_HDR_D`, `ZPR_REQ_ITM_D`, `ZPR_APPROVAL_D` -
   generated from the persistent tables by the quick fix *Create draft table*.
2. **Service bindings** - created on the service definitions
   `ZUI_PR_Requisition` and `ZUI_PR_Supplier` as *OData V4 / UI*, then published.

You also need the message class `ZPR_MSG` with numbers 001 to 012 and the
authorisation objects `ZPR_APPR` (field `ZPR_LEVEL`) and `ZPR_ADMIN`.

The customizing tables `ZPR_RATING` and `ZPR_CNTRYRSK` expect the same content
as the CAP fixtures in
[`../cap/db/data`](../cap/db/data) - that is what keeps the two stacks
comparable.

## Honest scope

This package is written for review, not for a one-click import. It has been
written against the ABAP Cloud syntax of the 2023+ releases and follows the
[Clean ABAP](https://github.com/SAP/styleguides) style guide, but it has not
been activated in a system as part of this repository - there is no ABAP system
in the build pipeline. The CAP implementation in `../cap` is the part that is
executed and tested on every commit; the value of this package is that it shows
the same problem solved on-stack, and that the two solutions can be read side
by side.
