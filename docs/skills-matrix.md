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

## SAP CAP / BTP (TypeScript)

| Skill | Where |
|---|---|
| CAP in TypeScript end to end | `cap/srv/**/*.ts`, `cap/tsconfig.json` |
| Strict compiler settings incl. `noUncheckedIndexedAccess` | `cap/tsconfig.json` |
| Types generated from the CDS model | `@cap-js/cds-typer`, `npm run types` |
| Domain types instead of loose objects | `RiskClass`, `Status`, `ApprovalLevel`, `Finding`, `Amount` |
| Type guards over casts | `isRiskClass`, `isLifecycleAction` in `srv/lib` |
| Type aware linting | `cap/eslint.config.ts` (`recommendedTypeChecked`) |
| Separate build tsconfig emitting to `gen/` | `cap/tsconfig.build.json` |
| CDS domain modelling | `cap/db/schema.cds` |
| Code lists, `@sap/cds/common` | `cap/db/code-lists.cds` |
| Compositions, managed & unmanaged associations | `PurchaseRequisitions.items`, `Suppliers.countryRisk` |
| Service projections, `excluding`, redirection | `cap/srv/procurement-service.cds` |
| Bound and unbound actions | `submit`, `approve`, `recalculateAllSupplierRisks` |
| Declarative authorisation | `@requires`, `@restrict` incl. an action grant |
| Instance based authorisation | `MyRequisitions` with `where: 'requester = $user'` |
| Analytical CDS views | `cap/srv/analytics-service.cds` |
| Custom handlers, determinations | `cap/srv/procurement-service.ts` |
| Draft event handling | `before(['NEW','PATCH'], ...drafts)` |
| CQL with expands | `assessSupplierById` - one query, two expands |
| Virtual elements | `riskScoreCriticality` + the before-READ column injection |
| Fiori Elements annotations | `cap/app/*/annotations.cds` |
| Side effects, value helps, criticality | same files |
| Fiori Elements app scaffolding | `cap/app/*/webapp/` (three apps: requisitions, approver inbox, suppliers) |
| List report views with counts, inline actions, row links | `cap/app/purchase-requisitions/annotations.cds`, `cap/app/approvals/annotations.cds` |
| Calculated elements on read | `pendingApprovalLevel`, `onTimeDeliveryPercent` |
| i18n end to end: labels, code list texts, server messages | `cap/_i18n/`, `cap/db/data/*_texts.csv` |
| Remote services against S/4HANA A2X APIs | `cap/srv/external/API_*.cds`, mocked from `srv/external/data` |
| Mapping to SAP APIs as pure, tested functions | `cap/srv/lib/s4-mapping.ts` |
| Mock behaviour for an external service | `cap/srv/external/API_PURCHASEORDER_PROCESS_SRV.ts` |
| Custom bootstrap middleware | `cap/srv/server.ts`, `cap/srv/demo-mode.ts` |
| UI5 beyond Fiori Elements: shell, tiles, cockpit, tour | `cap/app/shared/` |
| Excel import and export with validation and preview | `cap/srv/matrix-workbook.ts`, `cap/srv/lib/approval-matrix.ts`, `cap/app/shared/rules.js` |
| Role-addressed notifications, service events | `cap/srv/lib/notifications.ts`, `cap/srv/notification-handlers.ts` |
| `@PersonalData` annotations, destination service in the MTA | `cap/db/data-privacy.cds`, `cap/mta.yaml` |
| MTA and XSUAA descriptors | `cap/mta.yaml`, `cap/xs-security.json` |
| Jest + ts-jest, 261 type checked tests | `cap/test/` |
| ESLint flat config, TypeScript | `cap/eslint.config.ts` |

## Engineering practice

| Practice | Where |
|---|---|
| Rules separated from framework plumbing | [ADR 0002](adr/0002-rules-outside-the-framework.md) |
| Architecture decisions written down | [`docs/adr/`](adr/) |
| Property based assertions (monotonicity, ordering) | `approval-policy.test.ts`, `ltcl_approval_matrix` |
| Self validating fixtures | `cap/test/fixtures.test.ts` recomputes every derived value in `db/data` |
| Coverage floor on the rule modules | `cap/jest.config.ts` |
| CI on every push | `.github/workflows/ci.yml` |
| Reproducible demo evidence | [`demo-walkthrough.md`](demo-walkthrough.md), recorded against the running service |
| Known limitations stated, not hidden | [ADR 0005](adr/0005-number-assignment.md), [ADR 0009](adr/0009-s4-integration-via-released-apis.md), `abap/README.md` |
| Parity between the stacks stated explicitly | [`business-rules.md`](business-rules.md), section "Parity" |
