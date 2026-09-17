# ADR 0007: TypeScript on the CAP side, and which version

**Status:** accepted

## Context

CAP runs JavaScript or TypeScript. The rule modules in `srv/lib` are the part
of this project that carries the business risk, and they pass structures
around: a requisition, a list of items, a supplier profile, a list of findings.
In plain JavaScript those structures exist only in JSDoc and in the reader's
head.

## Decision

The whole CAP side is TypeScript, with strict settings plus
`noUncheckedIndexedAccess` and `noImplicitOverride`. Tests run through
`ts-jest`, so `npm test` type checks the sources as it runs them. ESLint uses
the type aware rule set.

Types are generated from the CDS model with `@cap-js/cds-typer`
(`npm run types`), but they are **not** committed and nothing imports them at
runtime: they exist for the editor, and CI regenerates them to prove they still
compile against the current model.

## What it bought

**Two real bugs, immediately.** The compiler found that
`(riskClass && map[riskClass]) ?? 0` returns `''` - a string - for an empty
risk class, where every caller expects a number. And it rejected an `orderBy`
written as an object, which happens to work at runtime but is not part of
CAP's contract.

**The domain got names.** `RiskClass`, `Status`, `ApprovalLevel`, `Finding`,
`MessageCode`, `Amount` are types now, not conventions. `determineRequiredLevel`
returns `ApprovalLevel`, not `number`, so a fourth approval level cannot be
introduced by accident anywhere in the codebase.

**`Amount = number | string | null | undefined` is the honest signature.**
Decimal columns come back as strings from several database drivers. The type
forces every caller to acknowledge that instead of assuming a number and
producing `NaN` in production.

**Better tests.** Strict settings added branches - every `??` fallback for a
value the database may or may not send - which pushed branch coverage below its
floor. The fix was to write the missing tests, and they are genuinely useful
ones: a decimal string where a number was expected, an indicator out of range,
a cost center with no consumption recorded.

## What it did not buy

**Money is still unsafe.** `number` is an IEEE 754 double in TypeScript exactly
as in JavaScript. A type system invites the assumption that this has been
handled; it has not. See [ADR 0004](0004-money-handling.md).

**CQL results are `any` by construction.** What a query returns is not knowable
at compile time - that is the nature of a dynamic query builder. The type aware
lint rules that would forbid it (`no-unsafe-member-access` and friends) are
switched off with a comment saying why, because the alternative is casts that
lie. The rules that do catch real defects - floating promises, unused
variables, misused promises - stay on.

## The trap that cost the most time

CAP decides whether to look for a TypeScript implementation at all like this
(`@sap/cds/lib/srv/factory.js`):

```js
const exts = process.env.CDS_TYPESCRIPT ? ['.ts','.js','.mjs'] : ['.js','.mjs']
```

Without the flag, the service starts, serves the model, and answers `501` for
every action - because it never found the implementation. `cds-ts` and
`cds-tsx` set it; a Jest run has to set it itself (`test/setup.ts`). No
compiler and no linter can see this. The 38 integration tests are what proves
it stayed set.

## Why TypeScript 6.0.3 and not 7.0.2

7.0.2 is the latest release. It is also unusable here:

| Package | Supports |
|---|---|
| `ts-jest` | `typescript >=4.3 <7` |
| `typescript-eslint` | `typescript >=4.8.4 <6.1.0` |

6.0.3 is the newest version the whole toolchain supports, so that is what is
pinned. "Current" means the newest version that keeps the build green, not the
newest version on the registry - `npm outdated` will keep reporting TypeScript
as behind, and that is the correct state until ts-jest and typescript-eslint
catch up.

The 6.0 line also deprecates `moduleResolution: node10` and `baseUrl`. Both are
avoided outright rather than silenced with `ignoreDeprecations`, so the move to
7 will be a version bump rather than a migration.

## Revisit when

`ts-jest` and `typescript-eslint` support TypeScript 7 - then bump. Or when a
handler needs a CQL result typed precisely enough to be worth importing the
generated model classes at runtime; today nothing does.
