# ADR 0005: Max-plus-one numbering in the demo, number range in production

**Status:** accepted

## Context

A purchase requisition gets a human readable number on submit:
`PR-2026-000042`. Two requesters submitting at the same second must not get the
same one.

## Decision

Both implementations read the current maximum for the year and add one. Both
say so in a comment next to the code, and both name the productive alternative:
`cl_numberrange_runtime=>number_get` on the ABAP side, a number range service
or a database sequence on the CAP side.

## Consequences

**Under concurrency this is wrong.** Two submits inside the same transaction
window read the same maximum and produce the same number. In a demo landscape
with one user that never happens; under load it happens immediately.

It is written down here rather than left as a surprise because the failure mode
is silent - a duplicate document number is not a crash, it is a support ticket
three weeks later.

**What makes it acceptable for now:** the number is assigned once, on submit,
and nothing joins on it. The UUID is the key. So the blast radius of a
collision is a confusing document number, not a broken data model.

**The fix is local.** One method on each side
(`next_requisition_number( )` / `assignRequisitionNumber( )`) and nothing else
knows how numbers are made.

## Revisit when

Before the first productive user. This is the first thing to change.
