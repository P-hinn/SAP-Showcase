---
name: s4-integration
description: Connect another S/4HANA API, or change the supplier sync or purchase order creation. Use when data should come from or go to S/4HANA, when a remote service is added under cap/srv/external, or when the integration should run against the sandbox or a real system.
---

# Talking to S/4HANA

Both directions go through released A2X OData APIs as CAP remote services. The
same code runs against a mock, against the SAP API Business Hub sandbox and
against a real tenant - only configuration differs (ADR 0009).

## Adding an API

1. **Model the subset you use** in `cap/srv/external/<API_NAME>.cds`, with the
   field names of the published service and `@cds.external: true`. Do not invent
   names, and do not model fields nobody reads. Note in the header comment that
   the full model can be generated with `cds import <EDMX> --as cds`.
2. **Register it** in `cap/package.json` under `cds.requires`: `kind: odata-v2`,
   the model path, a `[production]` destination and - if the sandbox serves it -
   a `[sandbox]` URL. The API key belongs in `.cdsrc-private.json` (gitignored),
   never in the repository.
3. **Mock data** as CSV in `cap/srv/external/data/<API_NAME>-<Entity>.csv`. The
   mocked service is what `npm start` and the tests run against
   (`--with-mocks`). Mock behaviour that a real system would provide (assigning
   a document number, for example) goes into `<API_NAME>.ts` next to the model.
4. **The mapping is a pure function** in `cap/srv/lib/s4-mapping.ts`: what
   becomes a purchase order item, what a sync changes. No database, no `req`, so
   it has unit tests. The handler in `cap/srv/s4-handlers.ts` does the calls and
   the writes, and receives only what it needs through `S4Deps`.
5. **Ownership has to be explicit.** Write down which fields S/4HANA owns and
   which belong to this application - a sync must never overwrite the local
   risk attributes.

## Failure is part of the interface

A remote call that fails must leave the local data untouched and answer with a
code of its own (`PR406`, `PR408`) plus a localized message. Never write half a
result.

## Tests

- Unit tests for the mapping (grouping, truncation, fallbacks, idempotency).
- An integration test that runs against the mocked service over HTTP, including
  the second run that must change nothing.
- Never assert against a live system in CI.

## Honesty

The integration has never met a real S/4HANA. When something is untested
against a real tenant, it says so in ADR 0009 and in the README - do not quietly
upgrade the claim.
