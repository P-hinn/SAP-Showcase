/*
 * Runs before the UI5 bootstrap. Decides language and theme, because both have
 * to be known when UI5 starts: the language goes into every OData request as
 * Accept-Language, and CAP answers $metadata, code list texts and error
 * messages in that language.
 *
 * Order: URL parameter > last choice (localStorage) > browser > English.
 */
(function () {
  'use strict';
  var SUPPORTED = ['de', 'en'];

  function stored(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null; // private mode or blocked storage - fall through to the defaults
    }
  }

  var params = new URLSearchParams(window.location.search);
  // German first: this showcase is presented in German, English is one click away.
  var language = (
    params.get('sap-ui-language') ||
    params.get('sap-language') ||
    stored('acme.language') ||
    'de'
  ).slice(0, 2).toLowerCase();
  if (SUPPORTED.indexOf(language) < 0) language = 'en';

  // Demo landscape: start signed in as the requester instead of greeting a
  // visitor with a browser login dialog. The server only accepts the cookie
  // where authentication is mocked (srv/demo-mode.ts), and any user can be
  // picked from the user menu afterwards.
  if (!/(^|;\s*)acme-demo-user=/.test(document.cookie)) {
    document.cookie = 'acme-demo-user=rita; path=/; max-age=86400; SameSite=Lax';
  }

  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = params.get('sap-ui-theme') || stored('acme.theme') || (prefersDark ? 'sap_horizon_dark' : 'sap_horizon');

  window['sap-ui-config'] = Object.assign(window['sap-ui-config'] || {}, {
    language: language,
    theme: theme
  });
  document.documentElement.lang = language;
})();
