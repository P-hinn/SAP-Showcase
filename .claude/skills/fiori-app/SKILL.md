---
name: fiori-app
description: Work on the Fiori Elements apps - annotations, columns, filters, actions, value helps, new list report or object page. Use when a screen changes, a column is missing, an action should appear, or a new app is added under cap/app.
---

# Fiori Elements in this repository

The apps have **no hand-written UI5 code**. Everything on screen comes from the
annotations in `cap/app/*/annotations.cds` plus the manifest. Keep it that way:
UI code lives only in `cap/app/shared/` (shell, start page, cockpit, tour).

## Texts

Never write a literal into an annotation. Labels are `'{i18n>Key}'` and live in
`cap/_i18n/i18n.properties` + `i18n_de.properties`. App titles live in the app's
own `webapp/i18n/`. Code list texts (status, risk class, ...) are CSV files in
`cap/db/data/*_texts.csv` - the server localizes them per request.

## The two traps that cost the most time here

**1. Columns disappear.** Fiori Elements estimates ~20 rem for a text column.
When the estimates add up to more than the screen, whole columns move into the
hidden pop-in area and are simply gone - no error, no warning. Every list
report therefore sets explicit widths in the manifest under
`controlConfiguration > @com.sap.vocabularies.UI.v1.LineItem > columns`, and the
sum stays below ~84 rem for a 1440 px screen. Column keys look like
`DataField::status_code`, `DataFieldForAnnotation::DataPoint::RiskScore` - a key
with a dot in it (an action) is rejected by the framework, so action columns get
no width.

**2. Drafts fire different events.** Editing a draft sends `NEW`/`PATCH` on the
`.drafts` entity, not `CREATE`/`UPDATE`. A determination registered only on the
active entity compiles, passes API tests and does nothing in the object page
(ADR 0003).

**3. Phones hide what is not important.** Below ~600 px the responsive table
moves columns into the pop-in and drops every column without
`@UI.Importance: #High` - inline action buttons included. An approver inbox
without its approve button on a phone is useless, so the action fields carry
`![@UI.Importance]: #High`. Check lists with the browser pane's mobile preset.

**4. The ShellBar bell and the phone overflow.** `setShowNotifications(true)`
captures `getParent()` at call time; called after `placeAt`, that parent is the
UIArea and the overflow menu throws `_getOverflowButton is not a function` on
a phone. Configure the bell before `placeAt`. Also: only overflow-aware
controls (`OverflowToolbarButton`, not `Button`) may sit in `additionalContent`.

## Useful patterns already in the repository

- Tabs with counts: `UI.SelectionPresentationVariant#<key>` plus `views.paths`
  in the manifest (`purchase-requisitions`).
- Inline row actions: `DataFieldForAction` with `Inline: true` and a
  `@Common.SideEffects` on the action so the list refreshes (`approvals`).
- A row that links into another app: `UI.DataFieldWithUrl` with `odata.concat`.
- Code fields that show their text: `Common.Text` + `TextArrangement: #TextOnly`
  + `ValueListWithFixedValues` for a dropdown filter.
- A progress bar in a column: `DataFieldForAnnotation` onto a
  `UI.DataPoint` with `Visualization: #Progress`; a value with
  `@Measures.Unit: '%'` renders as "62 %" instead of "0.62 of 1".

## Verify in the browser, always

`cds compile` passing proves nothing about a screen. Start the app
(`.claude/launch.json` serves it), open the page, and check the browser console
for `Invalid key`, `Meta Path not available` or a 401 - those are annotation
errors, not UI noise. Then regenerate the README images with
`npm run screenshots` if the change is visible.
