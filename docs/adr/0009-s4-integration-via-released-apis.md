# ADR 0009: Integration through released OData APIs, mocked locally

**Status:** accepted

## Context

The extension needs two things from S/4HANA: supplier master data (who exists,
who is blocked, in which country) and a way to turn an approved requisition
into a purchase order. The classic options are RFC/BAPI calls, IDoc, a CPI
flow, or the released OData APIs of S/4HANA Cloud.

The demo also has to run on a laptop without any SAP system at all.

## Decision

Both directions go through **released A2X APIs**, modelled as CAP remote
services in `cap/srv/external`:

| Purpose | Service |
|---|---|
| Supplier master data | `API_BUSINESS_PARTNER` (`A_Supplier`, `A_BusinessPartnerAddress`) |
| Purchase order creation | `API_PURCHASEORDER_PROCESS_SRV` (`A_PurchaseOrder`) |

The CDS files contain the subset of fields this application reads or writes,
with the field names of the published services. The full definition can be
generated with `cds import <EDMX> --as cds`.

Which system answers is configuration, not code:

- **local / tests:** CAP mocks both services in-process (`--with-mocks`) from
  the CSV files in `srv/external/data`,
- **`npm run start:sandbox`:** the SAP API Business Hub sandbox (read only, so
  the supplier sync works there and order creation does not),
- **production:** a BTP destination (`S4HANA`).

What each side owns is written down: S/4HANA owns name, country and purchasing
block; the risk attributes (rating, delivery performance, incidents,
certification) belong to this application and are never overwritten by a sync.

## Consequences

**The integration is testable.** `planSupplierSync()` and
`purchaseOrdersFor()` in `srv/lib/s4-mapping.ts` are pure functions with unit
tests; the integration tests run against the mocked services over HTTP, the
same way `npm start` does.

**No modification, no Z table in the core.** This is the clean core argument in
practice: the extension reads and writes through interfaces SAP keeps stable
across upgrades.

**Released APIs are a constraint, not a free pass.** They are not always
complete - the supplier's country lives on the address entity, not on
`A_Supplier`, and the sandbox refuses writes. Both cost a detour here.

**Untested against a real system.** There is no S/4HANA system in this
pipeline. The mapping is written against the published field names, and it is
honest to say that the first run against a real tenant will need a round of
fixes - typically authorizations, the purchasing organisation data and
number ranges.

## Revisit when

Volumes grow beyond what synchronous OData calls carry, or the business needs
events rather than a pull. Then this becomes an SAP Event Mesh / advanced event
mesh topic, and the sync action stays as the fallback.
