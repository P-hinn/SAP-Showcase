# ADR 0006: One Cloud Foundry module, apps served by the service

**Status:** accepted

## Context

The textbook CAP deployment on Cloud Foundry has four or five modules: the
service, the HDI deployer, an HTML5 application repository host, an approuter,
and one `html5` module per Fiori app. Each app then needs its own
`package.json`, its own `ui5.yaml` and its own build step.

For two Fiori Elements apps that consist of a `manifest.json`, a ten line
`Component.js` and an annotation file, that is a lot of moving parts to get
wrong.

## Decision

[`mta.yaml`](../../cap/mta.yaml) declares two modules: the Node.js service and
the HDI deployer. The Fiori apps are served by the CAP server from `app/`,
which it does out of the box.

## Consequences

**The descriptor is honest.** `cds build --production` produces exactly the
`gen/srv` and `gen/db` folders the file references - the `[production]` profile
in `package.json` pins `@cap-js/hana`, which is what makes `gen/db` appear at
all. A descriptor that references folders the build does not produce is worse
than no descriptor.

**What is given up:** the HTML5 application repository gives CDN-backed static
delivery, per-app versioning, and a clean separation between the app lifecycle
and the service lifecycle. With apps served by the service, a UI fix redeploys
the backend.

**What is not given up:** XSUAA is real. The scopes, role templates and role
collections in [`xs-security.json`](../../cap/xs-security.json) are the five
roles the service actually checks, so authentication and authorisation behave
in Cloud Foundry the way they behave against the mocked users locally.

**The UI5 runtime comes from the CDN** (`ui5.sap.com`), not from the app. Note
that this must be SAPUI5 and not OpenUI5: `sap.fe.templates`, the Fiori
Elements runtime, ships with SAPUI5 only. Bootstrapping from
`sdk.openui5.org` produces an app that loads and then fails to find its
templates.

## Revisit when

A third app appears, or the UI and the service need to be released
independently. Both are the moment the application repository pays for itself.
