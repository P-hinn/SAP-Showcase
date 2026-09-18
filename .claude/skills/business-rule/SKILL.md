---
name: business-rule
description: Add or change a business rule of the procurement scenario (approval matrix, risk scoring, validations, lifecycle). Use when a rule, a threshold, a weight, a message code or an approval level changes - it keeps the two implementations, the tests, the sample data and the documentation in step.
---

# Changing a business rule

A rule in this repository exists in up to five places. Missing one of them is
how a demo starts lying.

## 1. The rule itself, framework free

`cap/srv/lib/approval-policy.ts` (matrix, lifecycle, validations) or
`cap/srv/lib/risk-scoring.ts` (score, risk classes). These modules must not
import `@sap/cds`, must not query and must not see `req`. They take plain
objects and return plain results - that is what makes them testable in
milliseconds and comparable with the ABAP side.

A new finding needs three things: a code in `MSG`, an English `message` for
logs and tests, and a `messageKey` plus `args` for the localized text.

## 2. The message texts

`cap/_i18n/messages.properties` **and** `messages_de.properties`, same key, same
`{0}` placeholders. `npm run check:i18n` enforces it, CI runs it.

## 3. The ABAP counterpart

`abap/src/classes/zcl_pr_approval_policy.clas.abap` /
`zcl_pr_risk_scoring.clas.abap`, and the message number in `ZPR_MSG`. CI
compares the numbers of both stacks and fails when they drift.

If the rule is deliberately CAP-only (like the risk propagation), say so in the
parity section of `docs/business-rules.md` and in `abap/README.md` instead of
leaving the gap unspoken.

## 4. The tests

- Unit tests next to the rule: `cap/test/approval-policy.test.ts`,
  `risk-scoring.test.ts`. Assert the property, not just the example -
  "a riskier supplier is never cheaper to approve" is a test, not a comment.
- `cap/test/fixtures.test.ts` recomputes every derived value in `cap/db/data`.
  A changed threshold usually means the sample data has to change with it.
- Integration test in `cap/test/procurement-service.test.ts` when the rule is
  reachable over HTTP.
- The coverage floor on `srv/lib/` is 95 % statements / 90 % branches. A new
  branch without a test fails the build.

## 5. The documentation

`docs/business-rules.md` is the document a procurement lead signs off - it has
the matrix, the codes and the parity note. A decision with a cost (an
asymmetry, a shortcut) is an ADR in `docs/adr/`, numbered, with "what it costs"
and "revisit when".

## Finally

`/verify`. All of it, not a part of it.
