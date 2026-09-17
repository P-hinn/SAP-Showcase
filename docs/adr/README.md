# Architecture Decision Records

One file per decision that was not obvious, in the format: what was decided,
what it costs, and what would make us decide differently.

| # | Decision | Status |
|---|---|---|
| [0001](0001-onstack-vs-sidebyside.md) | On-stack (RAP) **and** side-by-side (CAP), not either | accepted |
| [0002](0002-rules-outside-the-framework.md) | Business rules live outside the framework | accepted |
| [0003](0003-draft-handling.md) | Draft handling on, custom lock handling off | accepted |
| [0004](0004-money-handling.md) | Money in integer minor units on the CAP side | accepted |
| [0005](0005-number-assignment.md) | Max-plus-one numbering in the demo, number range in production | accepted |
| [0006](0006-deployment-topology.md) | One Cloud Foundry module, apps served by the service | accepted |
| [0007](0007-typescript.md) | TypeScript on the CAP side, pinned to 6.0.3 | accepted |
