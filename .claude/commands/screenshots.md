---
description: Regenerate the README screenshots from the running application and review them
---

Regenerate the images in `docs/images`:

1. Make sure the application runs (`cd cap && npm start`, port 4004).
2. `cd cap && npm run screenshots` - add image names as arguments to limit the
   run, e.g. `npm run screenshots -- cockpit inbox`.
3. **Look at every regenerated image** before finishing: loading skeleton, open
   tooltip, cut-off column, wrong language, wrong user.
4. Report which images changed and why.

The demo-screenshots skill has the details of the script and its options.
