# Working in this repository

The same S/4HANA requirement, built twice: on-stack (ABAP Cloud / RAP, `abap/`)
and side-by-side (SAP CAP, `cap/`). The repository is read by SAP customers and
architects, so **everything in it has to survive being read out loud in a
meeting.**

## Files stay readable

- **Maximum 1000 lines per file.** A file nobody reads in one sitting hides its
  own bugs. When a file approaches the limit, split it along a seam that has a
  name: `srv/s4-handlers.ts` (talks to S/4HANA), `srv/service-helpers.ts`
  (shared helpers), `srv/lib/*` (rules that know no framework). The
  `PostToolUse` hook in `.claude/settings.json` says so when a write crosses it;
  generated files (`@cds-models/`, `gen/`, lockfiles, CSV) are exempt.
- **Name things after what they do**, not after the pattern they use.
  `reassessApprovalPath`, not `ApprovalPathProcessor`.
- **Comments say why, never what.** The code already says what. If a line looks
  odd, the comment explains the constraint behind it - see the comment on
  `keyOf()` or on the draft event registration for the tone.
- **No dead code, no commented-out code, no TODOs without a decision.** A
  decision that has to be made is an ADR in `docs/adr/`, not a `// TODO`.

## The architecture rule that matters

**Business rules live in modules that know nothing about the framework.**

- `cap/srv/lib/**` may not import `@sap/cds`, may not run a query and may not
  touch `req`. It takes plain objects and returns plain results.
- Handlers in `cap/srv/*.ts` do plumbing only: read, call the rule, write.
- The ABAP side mirrors it: `ZCL_PR_APPROVAL_POLICY` and `ZCL_PR_RISK_SCORING`
  contain no `SELECT` and no `MODIFY ENTITIES`.

That is what makes the two implementations comparable, and the rules testable
in milliseconds. Do not weaken it for convenience.

## Definition of done

A change is finished when **all** of these pass in `cap/`:

```bash
npm run typecheck     # tsc --noEmit, strict, incl. noUncheckedIndexedAccess
npm run lint          # ESLint with type aware rules
npm run compile:check # the CDS model compiles to SQL and EDMX
npm test              # 212 tests, type checked as they run
npm run build         # production build must emit gen/srv
```

`/verify` runs the lot. Never report a change as done on a partial run.

## Rules of this domain

- **Every user-visible text is an i18n key.** Labels in `cap/_i18n/i18n*.properties`,
  server messages in `cap/_i18n/messages*.properties`, UI shell texts in
  `cap/app/shared/i18n/`. German **and** English, always both. Code list texts
  belong in `cap/db/data/*_texts.csv`. A hard-coded string in an annotation is a
  bug.
- **Message codes (`PR001` …) are shared with the ABAP side.** CI compares them.
  A new code goes into `MSG` in `approval-policy.ts` and into `ZPR_MSG`.
- **Sample data must not lie.** `cap/test/fixtures.test.ts` recomputes every
  derived value in `cap/db/data` from the rule modules. Change a weight or a
  threshold and the fixtures have to follow.
- **Money never goes through a float comparison.** Use the helpers in
  `srv/lib/money.ts` (integer minor units). See ADR 0004.
- **Parity is documented, not assumed.** Features that exist only on the CAP
  side (approver inbox, audit trail, risk propagation, S/4HANA integration) are
  listed in `docs/business-rules.md` and `abap/README.md`. Add to that list
  rather than quietly diverging.

## Fiori Elements

The apps have **no hand-written UI5 code** - columns, filters, tabs and buttons
come from the annotations. Keep it that way; `app/shared/` (shell, start page,
cockpit, tour) is the only place with UI code, and it stays out of the apps.

Two traps that already cost time and are documented in the skills:

- Column widths must be set in the manifest, or Fiori Elements pushes columns
  into the hidden pop-in area and they simply disappear.
- A draft change fires `NEW`/`PATCH` on the `.drafts` entity, not
  `CREATE`/`UPDATE`. Register both (ADR 0003).

## Verifying UI work

Screenshots and README images are generated, never hand-made:
`npm run screenshots` in `cap/` drives a real browser against the running
service. If a change is visible in the UI, look at it in the browser before
calling it done - `.claude/launch.json` starts the server for the browser pane.

## Demo mode

`srv/demo-mode.ts` (cookie based user switching) and `DemoService` must stay
inert wherever authentication is not mocked. Never relax that check to make
something easier to test.
