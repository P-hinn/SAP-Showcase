---
description: Run every quality gate of the CAP implementation (types, lint, CDS compile, translations, tests, production build)
---

Run the full verification of `cap/`, in this order, and stop at the first
failure:

```bash
cd cap
npm run typecheck
npm run lint
npm run compile:check
npm run check:i18n
npm audit --audit-level=moderate
npm test
npm run build && rm -rf gen
```

Then report the result honestly: what passed, what failed, with the actual
output of the failing command. A partial run is not a pass, and "should be
fine" is not a result.
