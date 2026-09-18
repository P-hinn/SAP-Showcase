/*
 * The frame around every page of the showcase: an SAP ShellBar with the app
 * switcher, language, theme, tour, demo script and user menu, followed by the
 * page itself.
 *
 * Loaded as the UI5 on-init module of each index.html. It starts the Fiori
 * Elements component (via ComponentSupport) or one of the pages built here
 * (start page, cockpit, decision maker page), then offers the onboarding tour.
 *
 * <div id="acme-shell" data-app="home|solution|requisitions|approvals|suppliers|cockpit|rules">
 */
sap.ui.define([
  'sap/f/ShellBar',
  'sap/m/Avatar',
  'sap/m/Button',
  'sap/m/OverflowToolbarButton',
  'sap/m/Menu',
  'sap/m/MenuItem',
  'sap/m/ResponsivePopover',
  'sap/m/VBox',
  'sap/m/HBox',
  'sap/m/Title',
  'sap/m/Text',
  'sap/m/Label',
  'sap/m/ObjectStatus',
  'sap/m/MessageStrip',
  'sap/m/MessageToast',
  'sap/m/StandardListItem',
  'sap/m/List',
  'sap/base/i18n/Localization',
  'sap/base/i18n/ResourceBundle',
  'sap/ui/core/Theming',
  'acme/shared/tour',
  'acme/shared/tours',
  'acme/shared/demo',
  'acme/shared/notifications',
  // Loaded for its side effect: the library init declares which sap.m controls
  // may sit in a ShellBar. Without it the Fiori apps (which do not preload
  // sap.f) reject the language button.
  'sap/f/library'
], function (
  ShellBar, Avatar, Button, OverflowToolbarButton, Menu, MenuItem, ResponsivePopover,
  VBox, HBox, Title, Text, Label, ObjectStatus, MessageStrip, MessageToast, StandardListItem, List,
  Localization, ResourceBundle, Theming, tour, tours, demo, notifications
) {
  'use strict';

  var host = document.getElementById('acme-shell');
  var app = (host && host.getAttribute('data-app')) || 'home';
  var isPage = app === 'home' || app === 'cockpit' || app === 'solution' || app === 'rules';
  var base = isPage ? './' : '../../';

  var APPS = [
    { key: 'home', titleKey: 'AppHome', icon: 'sap-icon://home', href: base },
    { key: 'solution', titleKey: 'AppSolution', icon: 'sap-icon://lightbulb', href: base + 'solution.html' },
    { key: 'requisitions', titleKey: 'AppRequisitions', icon: 'sap-icon://request', href: base + 'purchase-requisitions/webapp/index.html' },
    { key: 'approvals', titleKey: 'AppApprovals', icon: 'sap-icon://approvals', href: base + 'approvals/webapp/index.html' },
    { key: 'suppliers', titleKey: 'AppSuppliers', icon: 'sap-icon://supplier', href: base + 'suppliers/webapp/index.html' },
    { key: 'cockpit', titleKey: 'AppCockpit', icon: 'sap-icon://business-objects-experience', href: base + 'cockpit.html' },
    { key: 'rules', titleKey: 'AppRules', icon: 'sap-icon://table-view', href: base + 'rules.html' }
  ];

  var LANGUAGES = [
    { key: 'de', label: 'Deutsch' },
    { key: 'en', label: 'English' }
  ];

  function store(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // Not persisted - the choice still applies to this page load.
    }
  }

  function currentLanguage() {
    var language = Localization.getLanguage().slice(0, 2).toLowerCase();
    return language === 'de' ? 'de' : 'en';
  }

  /** The language is part of $metadata, so switching means loading the page again. */
  function switchLanguage(language) {
    if (language === currentLanguage()) return;
    store('acme.language', language);
    var url = new URL(window.location.href);
    ['sap-language', 'sap-ui-language', 'sap-locale'].forEach(function (p) {
      url.searchParams.delete(p);
    });
    window.location.replace(url.toString());
  }

  function isDark() {
    return /_dark$/.test(Theming.getTheme());
  }

  function appHref(key) {
    for (var i = 0; i < APPS.length; i++) {
      if (APPS[i].key === key) return APPS[i].href;
    }
    return base;
  }

  /** Which page of the app is showing - the tour differs per page. */
  function pageKey() {
    var hash = window.location.hash;
    if (app === 'requisitions') {
      if (/\/items\(/.test(hash)) return 'requisitions.item';
      return /PurchaseRequisitions\(/.test(hash) ? 'requisitions.detail' : 'requisitions.list';
    }
    if (app === 'suppliers') return /Suppliers\(/.test(hash) ? 'suppliers.detail' : 'suppliers.list';
    return app;
  }

  function buildShell(bundle, user) {
    var t = function (key, args) {
      return bundle.getText(key, args);
    };
    var appInfo = APPS.filter(function (a) {
      return a.key === app;
    })[0];
    document.title = t(appInfo.titleKey) + ' · ' + t('ProductName');

    var tourTexts = {
      back: t('TourBack'),
      next: t('TourNext'),
      done: t('TourDone'),
      close: t('TourClose'),
      step: t('TourStep')
    };

    function runTour(once) {
      var key = pageKey();
      var steps = tours.stepsFor(key, t);
      var options = { texts: tourTexts, storageKey: 'acme.tour.' + key };
      if (once) tour.startOnce(steps, options);
      else tour.start(steps, options);
    }

    var appMenu = new Menu({
      items: APPS.map(function (a) {
        return new MenuItem({
          text: t(a.titleKey),
          icon: a.icon,
          press: function () {
            if (a.key !== app) window.location.href = a.href;
          }
        });
      })
    });

    var languageMenu = new Menu({
      items: LANGUAGES.map(function (l) {
        return new MenuItem({
          text: l.label,
          icon: l.key === currentLanguage() ? 'sap-icon://accept' : '',
          press: function () {
            switchLanguage(l.key);
          }
        });
      })
    });

    // An OverflowToolbarButton, not a Button: on a phone the ShellBar moves its
    // content into an overflow menu, and only overflow-aware buttons survive
    // that - a plain Button throws and takes the whole shell down with it.
    var languageLabel = LANGUAGES.filter(function (l) {
      return l.key === currentLanguage();
    })[0].label;
    var languageButton = new OverflowToolbarButton('acmeShellLanguage', {
      text: t('ShellLanguage') + ': ' + languageLabel,
      icon: 'sap-icon://world',
      tooltip: t('ShellLanguage') + ': ' + languageLabel,
      type: 'Transparent',
      press: function (event) {
        languageMenu.openBy(event.getSource());
      }
    });

    var themeButton = new OverflowToolbarButton('acmeShellTheme', {
      icon: isDark() ? 'sap-icon://light-mode' : 'sap-icon://dark-mode',
      tooltip: t('ShellTheme'),
      text: t('ShellTheme'),
      type: 'Transparent',
      press: function () {
        var theme = isDark() ? 'sap_horizon' : 'sap_horizon_dark';
        Theming.setTheme(theme);
        store('acme.theme', theme);
        themeButton.setIcon(isDark() ? 'sap-icon://light-mode' : 'sap-icon://dark-mode');
      }
    });

    var scriptButton = new OverflowToolbarButton('acmeShellScript', {
      icon: 'sap-icon://course-program',
      tooltip: t('ShellScript'),
      text: t('ShellScript'),
      type: 'Transparent',
      press: function () {
        demo.toggleScript();
      }
    });

    var tourButton = new OverflowToolbarButton('acmeShellTour', {
      icon: 'sap-icon://learning-assistant',
      tooltip: t('ShellTour'),
      text: t('ShellTour'),
      type: 'Transparent',
      press: function () {
        runTour(false);
      }
    });

    var avatar = new Avatar('acmeShellAvatar', {
      initials: user ? user.id.slice(0, 2).toUpperCase() : '?',
      tooltip: user ? t('ShellSignedInAs', [user.id]) : t('ShellNotSignedIn')
    });

    var userPopover = new ResponsivePopover({
      title: t('ShellUserTitle'),
      placement: 'Bottom',
      contentWidth: '24rem',
      content: new VBox({
        renderType: 'Bare',
        items: [
          new HBox({
            alignItems: 'Center',
            items: [
              new Avatar({ initials: avatar.getInitials(), displaySize: 'M' }).addStyleClass('sapUiSmallMarginEnd'),
              new VBox({
                items: [
                  new Title({ text: user ? user.id : t('ShellNotSignedIn'), level: 'H3' }),
                  new Text({ text: (user ? user.roles : []).map(function (role) { return t('Role' + role + 'Short'); }).join(' · ') })
                ]
              })
            ]
          }).addStyleClass('sapUiSmallMarginBottom'),
          new Label({ text: t('ShellSwitchUserTitle') }).addStyleClass('sapUiTinyMarginBottom'),
          new List('acmeShellUserList', {
            mode: 'None',
            items: demo.users().map(function (candidate) {
              return new StandardListItem({
                title: candidate.id,
                description: candidate.roles
                  .map(function (role) {
                    return t('Role' + role + 'Short');
                  })
                  .join(' · '),
                icon: user && candidate.id === user.id ? 'sap-icon://accept' : 'sap-icon://employee',
                type: 'Active',
                press: function () {
                  demo.signInAs(candidate.id);
                }
              });
            })
          }),
          new Button({
            text: t('ShellResetDemo'),
            icon: 'sap-icon://reset',
            type: 'Transparent',
            press: function () {
              demo.resetData().then(function (ok) {
                MessageToast.show(t(ok ? 'ShellResetDone' : 'ShellResetFailed'));
                if (ok) window.setTimeout(function () { window.location.reload(); }, 800);
              });
            }
          }).addStyleClass('sapUiSmallMarginTop'),
          new MessageStrip({
            text: t('ShellDemoHint'),
            type: 'Information',
            showIcon: true
          }).addStyleClass('sapUiSmallMarginTop')
        ]
      }).addStyleClass('sapUiSmallMargin')
    });

    var shellBar = new ShellBar('acmeShell', {
      title: t(appInfo.titleKey),
      secondTitle: t('ProductName'),
      homeIcon: base + 'shared/logo.svg',
      homeIconTooltip: t('AppHome'),
      showMenuButton: false,
      menu: appMenu,
      profile: avatar,
      additionalContent: [languageButton, themeButton, scriptButton, tourButton],
      homeIconPressed: function () {
        if (app !== 'home') window.location.href = base;
      },
      avatarPressed: function () {
        userPopover.openBy(avatar);
      }
    });
    // Before placeAt, on purpose: ShellBar.setShowNotifications remembers
    // getParent() at call time and later calls _getOverflowButton() on it. Once
    // the bar is placed, that parent is the UIArea, and on a phone - where the
    // bell moves into the overflow menu - it throws. Before placeAt the parent
    // is null, which UI5 does check for.
    notifications.attach(shellBar, {
      t: t,
      user: user,
      base: base,
      open: function (requisitionId) {
        window.location.href =
          appHref('requisitions') + '#/PurchaseRequisitions(ID=' + requisitionId + ',IsActiveEntity=true)';
      }
    });
    shellBar.placeAt(host);

    demo.initScript({ t: t, base: base, user: user, appHref: appHref, currentApp: app });

    // First visit of a page: offer the tour once, after the page had a moment
    // to render. Navigating to a detail page later offers that page's tour.
    setTimeout(function () {
      runTour(true);
    }, 1200);
    window.addEventListener('hashchange', function () {
      setTimeout(function () {
        runTour(true);
      }, 1500);
    });
  }

  var bundleReady = ResourceBundle.create({
    bundleName: 'acme.shared.i18n.i18n',
    supportedLocales: ['', 'de'],
    fallbackLocale: '',
    async: true
  });

  // Fiori Elements apps are components started from the placeholder div in
  // their index.html; the other pages are built by a module of their own.
  var PAGE_MODULES = {
    home: 'acme/shared/home',
    cockpit: 'acme/shared/cockpit',
    solution: 'acme/shared/solution',
    rules: 'acme/shared/rules'
  };

  var pageReady = PAGE_MODULES[app]
    ? new Promise(function (resolve) {
        sap.ui.require([PAGE_MODULES[app]], resolve);
      })
    : new Promise(function (resolve) {
        sap.ui.require(['sap/ui/core/ComponentSupport'], function (ComponentSupport) {
          ComponentSupport.run();
          resolve(null);
        });
      });

  Promise.all([bundleReady, pageReady, demo.load(base)]).then(function (results) {
    var bundle = results[0];
    var page = results[1];
    var user = results[2];
    // The page must never depend on the header bar rendering: a broken shell
    // is an annoyance, an empty page is a failed demo.
    try {
      buildShell(bundle, user);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Shell could not be built', error);
    }
    if (page) page.render(document.getElementById('acme-content'), bundle, { base: base, user: user });
  });
});
