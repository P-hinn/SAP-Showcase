# ADR 0010: Notifications go to roles, and stay in the app for now

**Status:** accepted

## Context

An approval process without notifications relies on approvers remembering to
look. The first question a department asks is "who gets told?".

Two things make this less simple than it sounds. First, approvals are
addressed to a *level*, and who holds `ApproverL2` is known to the identity
provider (XSUAA/IAS), not to this application. Second, the channel differs per
customer: e-mail, SAP Build Work Zone notifications, Teams, a workflow inbox.

## Decision

- **Who** is decided by a pure function, `notificationsFor()` in
  `cap/srv/lib/notifications.ts`: an approval request goes to the **role** of
  the pending level, an outcome (approved, rejected, ordered, path adjusted)
  goes to the requester **by user ID**. Withdrawing and reopening notify nobody
  - the requester did it themselves.
- Every notification is **stored** (`Notifications`) and shown in the app: the
  bell in the ShellBar reads `MyNotifications`, which filters in the database -
  addressed to me, or to one of my approval roles, but never an approval request
  for a requisition I raised.
- Every stored notification is also **emitted** as the service event
  `NotificationCreated`. That is the seam for an outbound channel. Locally the
  event is only logged.
- "Unread" is kept in the browser: a role notification is shared by everybody
  holding the role, so a server-side read flag would need a row per reader.

## Consequences

**No list of approvers is duplicated.** Adding a department head means
assigning a role collection in BTP, nothing in this application.

**Nothing leaves the application.** A customer demo shows the bell; it does
not send mail. Connecting a channel is a subscriber to `NotificationCreated`
(for SAP Build Work Zone: the `@cap-js/notifications` plugin) - a
configuration and a few lines, not a change to the approval logic.

**Read state is per browser.** The same person on a second device sees the
same notifications as new once. For a worklist that is acceptable; for a
compliance-relevant acknowledgement it would not be.

## Revisit when

A customer names the channel. Then the subscriber is written, and "read" moves
to the server if acknowledgement has to be proven.
