# How this repository is built with AI

This project is written with [Claude Code](https://claude.com/claude-code) in
the loop, and the setup for that is part of the repository rather than a habit
in someone's head. Anyone who clones it gets the same guardrails.

Two things this is **not**: a claim that the code is unreviewed output, and a
claim that AI wrote the architecture. Every decision with a cost is an ADR in
[`adr/`](adr/), every rule has tests, and the build has to be green before
anything is called done. The AI setup exists to make those standards cheap to
hold, not to replace them.

## What is in the repository

| File | What it does |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | The conventions: file size, naming, comments, the framework-free rule modules, the definition of done, the domain rules (i18n, message codes, money, parity). Loaded automatically in every session. |
| [`.claude/settings.json`](../.claude/settings.json) | A `PostToolUse` hook on every write, plus the read-only commands that never need a prompt. |
| [`scripts/check-file-length.sh`](../scripts/check-file-length.sh) | The hook: warns when a file passes 1000 lines, skipping generated files. It informs, it never blocks. |
| [`.claude/skills/`](../.claude/skills) | Four skills that carry the knowledge a newcomer would otherwise learn by breaking something. |
| [`.claude/commands/`](../.claude/commands) | `/verify`, `/screenshots`, `/demo-check`. |
| [`.claude/launch.json`](../.claude/launch.json) | Starts the service for the in-editor browser, so UI changes are looked at, not guessed. |

## The skills, and why each one exists

| Skill | The mistake it prevents |
|---|---|
| **business-rule** | Changing a rule in one of the five places it lives. A threshold without the ABAP counterpart, without the fixture recalculation, without the German message. |
| **fiori-app** | The two Fiori Elements traps that cost the most time here: columns that silently vanish into the pop-in area when the widths add up to more than the screen, and draft events firing on the `.drafts` entity rather than the active one. |
| **s4-integration** | Adding an S/4HANA call without a mock, without a pure mapping function, or with a half-written result when the remote side fails. |
| **demo-screenshots** | Hand-made screenshots. Every image in the README is generated from the running app, so it cannot drift from reality. |

## Automated checks, not good intentions

The conventions that matter are checked by a machine, because a convention a
build does not enforce is a preference:

- **1000 lines per file** - the write hook says so immediately, in the session
  that caused it. Splitting `procurement-service.ts` into the service, the
  S/4HANA handlers and the shared helpers is what that rule produced.
- **Translations complete** - `npm run check:i18n` compares every English key
  with its German counterpart, including the `{0}` placeholders. Runs in CI.
- **The sample data cannot lie** - `cap/test/fixtures.test.ts` recomputes every
  derived value in `cap/db/data` from the rule modules.
- **Message numbers stay in sync across the two stacks** - CI compares them.
- **The rules carry a coverage floor** - 95 % statements, 90 % branches on
  `cap/srv/lib/`.

## The workflow

1. Describe the change in business terms; the skill supplies the checklist for
   that kind of change.
2. Write the rule framework-free, then the plumbing around it.
3. `/verify` - types, lint, CDS compile, translations, 212 tests, production
   build. Nothing is "done" on a partial run.
4. For anything visible: open it in the browser, then `/screenshots`.
5. Write down what it costs. An asymmetry, a shortcut or an untested assumption
   becomes an ADR or a line in the scope section of the README - see
   [ADR 0008](adr/0008-risk-changes-never-shorten-the-path.md) and
   [ADR 0009](adr/0009-s4-integration-via-released-apis.md), both of which name
   what they get wrong on purpose.

## What a customer should take from this

The interesting part is not that AI was involved. It is that the project can
say, file by file, **what is checked automatically, what was decided
deliberately, and what has not been proven yet** - which is exactly the
question an SAP customer has to answer for every extension in their landscape.
