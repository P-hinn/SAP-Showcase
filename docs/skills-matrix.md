# What this repository demonstrates

For readers who want to check a specific skill rather than read the whole
thing. Every row points at code, not at a claim.

## ABAP Cloud / RAP

| Skill | Where |
|---|---|
| Managed RAP BO, draft enabled | `abap/src/behavior/zi_pr_requisition.bdef.asbdef` |
| Projection behaviour definition | `abap/src/behavior/zc_pr_requisition.bdef.asbdef` |
| Determinations on modify | `deriveItemValues`, `recalculateHeader`, `setInitialValues` |
| Validations on save | `validateHeader`, `validateItem` |
| Instance-bound actions with parameters | `submit`, `approve`, `rejectRequisition`, `withdraw`, `close`, `reopen` |
| Factory action | `copyRequisition` |
| Static action | `recalculateAllRisks` |
| Dynamic feature control | `get_instance_features` in the requisition behaviour pool |
| Instance authorisation | `get_instance_authorizations` |
| Global authorisation | `get_global_authorizations` in the supplier pool |
| Side effects | `side effects` block in the item behaviour |
| Draft prepare action | `draft determine action Prepare` |
| ETag / optimistic concurrency | `total etag LastChangedAt`, `etag master LocalLastChangedAt` |
| EML (READ / MODIFY ENTITIES, `BY \_Item`) | throughout `zbp_i_pr_requisition.clas.locals_imp.abap` |
| CDS interface / projection layering | `abap/src/cds/zi_*` vs `zc_*` |
| CDS with released standard views | `zi_pr_supplier.ddls.asddls` joins `I_Supplier` |
| Unmanaged association in CDS | `countryRisk` in `cap/db/schema.cds`; the join in `zi_pr_supplierriskinput` |
| Virtual elements | `zcl_pr_criticality.clas.abap` + `@ObjectModel.virtualElementCalculatedBy` |
| Metadata extensions | `abap/src/cds/*.ddlx.asddlxs` |
| Value helps against released views | `@Consumption.valueHelpDefinition` in `zc_pr_reqitem` |
| Abstract entities as action parameters | `abap/src/cds/zd_pr_*.ddls.asddls` |
| Service definition | `abap/src/services/*.srvd.srvdsrv` |
| ABAP Unit, 51 tests | `*.clas.testclasses.abap` |
| Clean ABAP style | `RETURNING VALUE(result)`, no Hungarian notation, expressions over statements |

## SAP CAP / BTP

| Skill | Where |
|---|---|
| CDS domain modelling | `cap/db/schema.cds` |
| Code lists, `@sap/cds/common` | `cap/db/code-lists.cds` |
| Compositions, managed & unmanaged associations | `PurchaseRequisitions.items`, `Suppliers.countryRisk` |
| Service projections, `excluding`, redirection | `cap/srv/procurement-service.cds` |
| Bound and unbound actions | `submit`, `approve`, `recalculateAllSupplierRisks` |
| Declarative authorisation | `@requires`, `@restrict` incl. an action grant |
| Instance based authorisation | `MyRequisitions` with `where: 'requester = $user'` |
| Analytical CDS views | `cap/srv/analytics-service.cds` |
| Custom handlers, determinations | `cap/srv/procurement-service.js` |
| Draft event handling | `before(['NEW','PATCH'], ...drafts)` |
| CQL with expands | `assessSupplierById` - one query, two expands |
| Virtual elements | `riskScoreCriticality` + the before-READ column injection |
| Fiori Elements annotations | `cap/app/*/annotations.cds` |
| Side effects, value helps, criticality | same files |
| Fiori Elements app scaffolding | `cap/app/*/webapp/` |
| MTA and XSUAA descriptors | `cap/mta.yaml`, `cap/xs-security.json` |
| Jest unit and integration tests, 163 | `cap/test/` |
| ESLint flat config | `cap/eslint.config.js` |

## Engineering practice

| Practice | Where |
|---|---|
| Rules separated from framework plumbing | [ADR 0002](adr/0002-rules-outside-the-framework.md) |
| Architecture decisions written down | [`docs/adr/`](adr/) |
| Property based assertions (monotonicity, ordering) | `approval-policy.test.js`, `ltcl_approval_matrix` |
| Self validating fixtures | `cap/test/fixtures.test.js` recomputes every derived value in `db/data` |
| Coverage floor on the rule modules | `cap/jest.config.js` |
| CI on every push | `.github/workflows/ci.yml` |
| Reproducible demo evidence | [`demo-walkthrough.md`](demo-walkthrough.md), recorded against the running service |
| Known limitations stated, not hidden | [ADR 0005](adr/0005-number-assignment.md), `abap/README.md` |
