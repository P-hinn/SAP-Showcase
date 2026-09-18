/*
 * The bell in the ShellBar: the caller's notifications from MyNotifications.
 *
 * "Unread" is kept in the browser (the time the list was last opened, per
 * user). A notification addressed to a role is shared by everybody holding
 * that role, so a per-person read flag on the server would need a row per
 * reader - for a showcase the browser is the honest place for it.
 */
sap.ui.define([
  'sap/base/i18n/Localization',
  'sap/m/ResponsivePopover',
  'sap/m/List',
  'sap/m/StandardListItem',
  'sap/m/Text'
], function (Localization, ResponsivePopover, List, StandardListItem, Text) {
  'use strict';

  var ICON = {
    NEED: 'sap-icon://approvals',
    APPR: 'sap-icon://accept',
    REJE: 'sap-icon://decline',
    PATH: 'sap-icon://warning',
    ORDR: 'sap-icon://cart-approval'
  };
  var STATE = { NEED: 'Warning', APPR: 'Success', REJE: 'Error', PATH: 'Warning', ORDR: 'Success' };

  function seenKey(user) {
    return 'acme.notifications.seen.' + (user ? user.id : 'anonymous');
  }

  function lastSeen(user) {
    try {
      return Number(window.localStorage.getItem(seenKey(user)) || 0);
    } catch (e) {
      return 0;
    }
  }

  function markSeen(user) {
    try {
      window.localStorage.setItem(seenKey(user), String(Date.now()));
    } catch (e) {
      // Without storage every notification simply stays "new".
    }
  }

  function load(base) {
    return fetch(
      base + 'procurement/MyNotifications?$orderby=createdAt desc&$top=20&$expand=kind($select=name)',
      {
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Accept-Language': Localization.getLanguageTag().toString() }
      }
    )
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (body) {
        return (body && body.value) || [];
      })
      .catch(function () {
        return [];
      });
  }

  return {
    /**
     * Wires the bell of a ShellBar. `open(requisitionId)` navigates to the
     * requisition the notification is about.
     */
    attach: function (shellBar, options) {
      var t = options.t;
      var user = options.user;
      var date = new Intl.DateTimeFormat(Localization.getLanguageTag().toString(), {
        dateStyle: 'short'
      });

      var list = new List({ noDataText: t('NotificationsEmpty') });
      var popover = new ResponsivePopover({
        title: t('NotificationsTitle'),
        placement: 'Bottom',
        contentWidth: '26rem',
        content: [list]
      });

      function render(rows) {
        var seen = lastSeen(user);
        var unseen = rows.filter(function (row) {
          return new Date(row.createdAt).getTime() > seen;
        }).length;
        shellBar.setNotificationsNumber(unseen ? String(unseen) : '');

        list.destroyItems();
        rows.forEach(function (row) {
          list.addItem(
            new StandardListItem({
              title: ((row.kind && row.kind.name) || row.kind_code) + ' · ' + (row.requisitionNumber || ''),
              description: row.title || '',
              info: date.format(new Date(row.createdAt)),
              infoState: STATE[row.kind_code] || 'None',
              icon: ICON[row.kind_code] || 'sap-icon://bell',
              highlight: new Date(row.createdAt).getTime() > seen ? 'Information' : 'None',
              type: 'Active',
              press: function () {
                popover.close();
                options.open(row.requisition_ID);
              }
            })
          );
        });
      }

      shellBar.setShowNotifications(true);
      shellBar.attachNotificationsPressed(function (event) {
        popover.openBy(event.getParameter('button'));
        markSeen(user);
        shellBar.setNotificationsNumber('');
      });

      // A hint text under the list, so nobody expects an e-mail.
      popover.addContent(new Text({ text: t('NotificationsHint') }).addStyleClass('sapUiSmallMargin'));

      load(options.base).then(render);
    }
  };
});
