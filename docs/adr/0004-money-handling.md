# ADR 0004: Money in integer minor units on the CAP side

**Status:** accepted

## Context

The approval matrix is a set of threshold comparisons on money. ABAP has exact
decimal arithmetic for currency amounts (`TYPE p`, `abap.curr`), so a
comparison against 25,000.00 does what it says.

The CAP side is TypeScript, and **TypeScript does not help here at all**:
`number` is an IEEE 754 double, exactly as in JavaScript. There is no decimal
type to reach for. `24999.999999999996` is a perfectly ordinary result of a
floating point multiplication, and it is on the wrong side of a `< 25000`
comparison - which means one requisition in a thousand silently gets the
cheaper approval path. That is not a rounding inconvenience; it is an audit
finding.

This is worth stating explicitly because a type system invites the assumption
that it has been handled. A nominal `Amount` type would document intent, but it
would not change a single bit of the arithmetic.

## Decision

On the CAP side, every amount comparison and every rounding goes through
`srv/lib/money.ts`, which converts to integer minor units ("cents") first. Its
exported `Amount` type (`number | string | null | undefined`) is the second
half of the answer: it forces every caller to acknowledge that an amount can
arrive as a decimal string from the database driver, rather than assuming a
number and silently producing `NaN`.

```js
const tier = APPROVAL_MATRIX.find(
  (row) => !Number.isFinite(row.maxValue) || valueInCents < toMinorUnits(row.maxValue)
);
```

Item amounts are rounded **once, at the end** (`lineAmount`), and sums are
accumulated in minor units (`sumAmounts`), so error cannot build up across a
document with many items.

On the ABAP side no such helper exists, because packed numbers are already
exact. That asymmetry is intentional and is called out in the class
documentation on both sides.

## Consequences

**One genuine behavioural difference remains, and it is documented rather than
hidden.** A decimal "half" is often not a binary half: `1.005` is stored as
`1.00499999999999989...`, so the Node implementation rounds it **down** to
`1.00` while ABAP rounds it **up** to `1.01`. The test
`money > documents that a decimal "half" is often not a binary half` asserts the
behaviour explicitly, so nobody later "fixes" it by accident.

This matters for a unit price entered with three decimals. It does not matter
for the thresholds, which is the case that would have been expensive.

**A discipline cost:** every new amount comparison has to remember to use the
helper. The rule modules are small and reviewed, which is what makes that
acceptable.

## Revisit when

Amounts in currencies with a different number of minor units (JPY has none, KWD
has three) enter the model. `MINOR_UNITS` is a constant today; it would have to
become a lookup on the currency.
