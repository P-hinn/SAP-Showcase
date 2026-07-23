# Security and operations

The questions an IT lead asks before an extension goes near their S/4HANA,
answered for the side-by-side implementation in `cap/`. Every statement points
to the file that makes it true. Where something is **not** done, the last
section says so.

## Authentication

| Landscape | How users sign in |
|---|---|
| Production (SAP BTP) | SAP Authorization and Trust Management (XSUAA), JWT on every request - `cap/package.json` > `cds.requires.auth` `[production]` |
| Local / tests | Mocked users with HTTP Basic, plus the demo user switch |

The demo user switch (`cap/srv/demo-mode.ts`) turns a cookie into mocked
credentials. It and the `DemoService` (reset, user list) refuse to work unless
authentication is `mocked` or `basic` - checked on every request, so a
productive landscape with XSUAA cannot be tricked into using them.

## Authorization

Five scopes, bundled into role templates and role collections in
[`cap/xs-security.json`](../cap/xs-security.json):

| Role collection | Scopes | May |
|---|---|---|
| `Procurement_Requester` | Requester | create, edit, submit, withdraw own requisitions |
| `Procurement_TeamLead` | Requester, ApproverL1 | + approve level 1 |
| `Procurement_DepartmentHead` | Requester, ApproverL1, ApproverL2 | + approve level 2 |
| `Procurement_CFO` | ApproverL1-L3 | approve every level |
| `Procurement_Admin` | ProcurementAdmin, Requester | supplier master data, ratings, approval matrix, S/4HANA sync |

It is enforced on three levels, none of which trusts the UI:

1. **Static** - `@requires` / `@restrict` on services, entities and actions
   (`cap/srv/procurement-service.cds`). Actions need their own grant; entity
   rights do not imply them.
2. **Instance based** - the where clauses of `MyRequisitions`,
   `MyApprovalTasks` and `MyNotifications` run inside the database query. A
   user cannot read another department's worklist by guessing a URL.
3. **In the rule** - segregation of duties (`PR008`: nobody decides on their
   own requisition) lives in `validateDecision()`, next to the approval matrix.
   The user may well hold the approver role - just not for this document.

A hidden button is a courtesy. Every action re-checks status, role and
ownership on the server; the integration tests call the actions directly to
prove it.

## Personal data

- **The only personal data are user IDs** - requester, approver, actor,
  recipient. No names, e-mail addresses or contact details are stored.
- The fields are annotated with `@PersonalData` in
  [`cap/db/data-privacy.cds`](../cap/db/data-privacy.cds), the vocabulary the
  SAP audit logging plugin reads.
- The audit trail per requisition (`RequisitionEvents`) is a **business** audit
  trail: who submitted, approved, rejected, ordered - written by the service
  only, read-only over OData.

## Integration security

- S/4HANA is reached through the BTP **destination** `S4HANA`, bound via the
  destination service in [`cap/mta.yaml`](../cap/mta.yaml). URL and credentials
  are maintained in the BTP cockpit, never in the repository.
- An on-premise S/4HANA additionally needs the connectivity service and the SAP
  Cloud Connector; the model and the code do not change.
- For the API Business Hub sandbox the API key goes into
  `cap/.cdsrc-private.json`, which is gitignored.
- A failed remote call leaves local data untouched and answers with its own
  code (`PR406`, `PR408`); nothing is ever half written.

## Input handling

- OData input is typed and validated by CAP; referential integrity is checked by
  the database (`cds.features.assert_integrity: db`).
- The approval matrix upload accepts `.xlsx` up to 512 KB, reads only the first
  four columns of the first sheet, and is checked by
  `lib/approval-matrix.ts` before anything is stored. Activation replaces the
  matrix as a whole - a half-maintained matrix cannot exist.
- The user ID in the notification filter is bound as a query parameter, never
  concatenated into SQL (`srv/notification-handlers.ts`).

## Logging and monitoring

| What | Where |
|---|---|
| Health check | `GET /health` → `{"status":"UP"}`, usable as the Cloud Foundry health check |
| Request and error log | CAP's logger (`cds.log`) on stdout, collected by Cloud Foundry |
| Outbound notifications | logger `notifications`, one line per message; `NotificationCreated` event per stored notification (ADR 0010) |
| Business events | `RequisitionEvents`, queryable per requisition and in the cockpit |

## Supply chain

- `npm audit --audit-level=moderate` runs in CI; the build fails on a known
  vulnerability. Where a transitive dependency lagged behind a fix, it is
  lifted in `package.json > overrides`. Currently one entry: `exceljs` ships
  `uuid` 8, flagged for a bounds check in `v3`/`v5`/`v6`; `exceljs` only calls
  `v4`, and the override moves it to the fixed `uuid` 11 anyway.
- Dependencies are locked (`package-lock.json`) and installed with `npm ci`.

## What is not done - yet

Stated plainly, so nobody has to find out in a review:

- **No technical audit log.** The `@PersonalData` annotations are in place, the
  `@cap-js/audit-logging` plugin and the SAP Audit Log service are not bound.
- **No retention or deletion rules** for personal data. SAP Data Retention
  Manager or an own purge job would be the next step.
- **No rate limiting and no malware scan** of uploads beyond size and format.
- **No centralised logging.** Binding SAP Cloud Logging is a configuration
  step in `mta.yaml` that this showcase does not take.
- **No penetration test, no load test.** One instance with 512 MB is sized for
  a demo, not for production.
