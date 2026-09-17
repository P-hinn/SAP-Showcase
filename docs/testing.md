# Test strategy

174 tests on the CAP side, 51 on the ABAP side. The interesting part is not the
count - it is which layer each of them sits in and why.

The CAP tests run through `ts-jest`, so the suite type checks the sources as it
runs them: `npm test` fails on a type error, not only on a failed assertion.

## The shape

```
        few, slow, broad
              ▲
   38 integration tests  ──  HTTP against the running service.
        (cap/test/           Prove the wiring: auth, draft round trips,
     procurement-service)    OData actions, side effects on the database.
              │
   24 fixture tests      ──  Recompute every derived value in db/data from
        (cap/test/           the rule modules. Prove the demo does not lie.
        fixtures)
              │
  112 + 51 unit tests    ──  Rule modules only. No database, no HTTP.
    (lib + ABAP Unit)        Prove the rules.
              ▼
       many, fast, narrow
```

The bottom layer is where the coverage floor sits: `jest.config.ts` requires
95 % statements and 100 % functions on `srv/lib/`, and the suite currently
reports 100 % statements at 93 % branches.

Moving to TypeScript pushed branch coverage *down* at first, because strict
settings add real branches: every `??` fallback for a value the database may or
may not send is a path that has to be exercised. The honest response was to
write the missing tests - a decimal string where a number was expected, an
indicator out of range, a cost center with no consumption - not to lower the
threshold. The handful of branches still uncovered are the fallbacks after a
lookup that cannot miss, and they are commented as such. The handler layer has no floor on purpose - coverage there is a
side effect of the integration tests, not a goal.

## Three things these tests do that most suites do not

### They assert properties, not just values

```js
it('is never cheaper for a riskier supplier', () => { ... });
it('is monotonic in the requisition value', () => { ... });
```

A table of expected values catches a typo. A property catches a *reasoning*
error - the kind where somebody reorders the matrix rows and every individual
example still happens to pass.

The same two properties are asserted in ABAP Unit
(`ltcl_approval_matrix~riskier_is_never_cheaper`, `~monotonic_in_value`), which
is what keeps the two implementations honest about each other.

### They validate the sample data

`cap/test/fixtures.test.ts` reads the CSV files in `db/data` and recomputes
every derived value: item net amounts, header totals, supplier risk scores and
classes, the derived approval level, the length of each approval chain.

A demo whose numbers quietly stop matching its own rules is worse than no demo.
This is also why `recalculateAllSupplierRisks` reports `changed: 0` on a fresh
database - the stored scores already match, and that idempotency is the
property the fixture tests enforce.

### They keep the fixtures from expiring

Delivery dates in the sample data are real dates, so a submit test run in 2030
would fail on "delivery date in the past" - for the wrong reason. Tests that
submit compute their dates at runtime (`futureDate()`) and move the fixture
dates forward first. The fixture tests deliberately check amounts and levels
only, never dates.

### The bug that only a running service reveals

CAP decides whether to even look for a TypeScript service implementation like
this (`@sap/cds/lib/srv/factory.js`):

```js
const exts = process.env.CDS_TYPESCRIPT ? ['.ts','.js','.mjs'] : ['.js','.mjs']
```

Without that flag the service still starts - it just serves the model with no
custom handlers, and every action answers `501`. No compiler and no linter can
see this; only a test that calls an action does. `test/setup.ts` sets the flag
and the 38 integration tests are what proves it stayed set.

## What is not tested, and why

**The Fiori Elements apps.** They are annotation driven with no custom
controller code, so what there is to test is the annotation model - and `cds
compile --to edmx` already fails on a broken one. That compile is part of CI.

**The ABAP behaviour pool.** RAP handlers need a system; there is none in this
pipeline. That is exactly why the rules were moved out of the pool
([ADR 0002](adr/0002-rules-outside-the-framework.md)) - the part that carries
the business risk is testable without one. In a project with a system, the next
step is `cl_abap_behavior_testdouble` for the pool and
`cl_cds_test_environment` for the CDS views.

**Performance.** No load test. The one place where it would matter -
`recalculateAllRisks` over a full supplier base - reads the key list first and
scores one supplier at a time, and the CAP counterpart resolves both customizing
tables with expands in a single query rather than three per supplier.

## Running them

```bash
cd cap
npm test                  # 174 tests, type checked as they run
npm run test:coverage     # with the coverage floor enforced
npm run typecheck         # tsc --noEmit over srv and test
npm run lint              # ESLint with type aware rules
npm run compile:check     # CDS model + OData metadata must compile clean
npm run build             # production build incl. tsc to gen/srv
```

All of them run in CI on every push.
