---
description: Walk the ten steps of the demo script against the running service and report what a customer would see
---

Walk the demo story end to end against the running service (port 4004) and
report what actually happens - this is the sequence a customer is shown, so it
has to work on the day.

Use the API (curl with `--cookie 'acme-demo-user=<user>'`, which is the same
login the UI uses), or the browser when the point is visual:

1. `rita` submits the draft `PR-2026-000001` - the approval chain appears.
2. `tom` approves level 1 from `/procurement/MyApprovalTasks`.
3. `mona` sets the rating of Anadolu (`50000005-...`) to `CC`.
   → the open requisition `PR-2026-000006` must jump from L2 to L3, gain a
   pending step and get a `PATH` entry in its history.
4. `dana` approves level 2; the requisition stays in approval.
5. `carl` approves level 3; now it is approved.
6. `close` creates a purchase order in S/4HANA and returns a `45…` number.
7. `mona` runs `syncSuppliersFromS4`: 1 new, 2 changed, 1 requisition adjusted.
8. `/demo/resetData` restores the sample data.

Report every deviation with the request and the response. Then reset the data,
so the demo is ready for the next run.
