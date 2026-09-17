/*
 * Start page: launchpad style tiles with live numbers, what in this project is
 * SAP and what is not, and the demo users.
 *
 * Tiles are real SAP Fiori tiles (sap.m.GenericTile); the text sections are
 * plain HTML styled with the theme's CSS variables, so they follow the
 * light/dark switch like everything else.
 */
sap.ui.define([
  'sap/base/i18n/Localization',
  'sap/m/GenericTile',
  'sap/m/TileContent',
  'sap/m/NumericContent',
  'sap/m/ImageContent',
  'sap/m/FlexBox',
  'acme/shared/demo'
], function (Localization, GenericTile, TileContent, NumericContent, ImageContent, FlexBox, demo) {
  'use strict';

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Our own i18n texts: `code` becomes <code>, everything else is escaped. */
  function rich(text) {
    return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function count(base, path) {
    return fetch(base + 'procurement/' + path, {
      credentials: 'same-origin',
      headers: { 'Accept-Language': Localization.getLanguageTag().toString() }
    })
      .then(function (response) {
        return response.ok ? response.text() : null;
      })
      .then(function (body) {
        var n = Number(body);
        return body === null || isNaN(n) ? null : n;
      })
      .catch(function () {
        return null;
      });
  }

  function numericTile(options) {
    var content = new NumericContent({
      value: '…',
      icon: options.icon,
      valueColor: options.valueColor || 'Neutral',
      withMargin: false
    });
    options.value.then(function (n) {
      content.setValue(n === null ? '–' : String(n));
    });
    return new GenericTile({
      header: options.header,
      subheader: options.subheader,
      url: options.href,
      press: function () {
        window.location.href = options.href;
      },
      tileContent: new TileContent({ footer: options.footer, content: content })
    }).addStyleClass('acme-tile');
  }

  function linkTile(options) {
    return new GenericTile({
      header: options.header,
      subheader: options.subheader,
      url: options.href,
      press: function () {
        if (options.sameTab) window.location.href = options.href;
        else window.open(options.href, '_blank', 'noopener');
      },
      tileContent: new TileContent({
        footer: options.footer,
        content: new ImageContent({ src: options.icon })
      })
    }).addStyleClass('acme-tile');
  }

  function card(t, badgeClass, badgeKey, titleKey, itemKeys, leadKey) {
    return (
      '<div class="acme-card">' +
      '<span class="acme-card__badge ' + badgeClass + '">' + escapeHtml(t(badgeKey)) + '</span>' +
      '<h3>' + escapeHtml(t(titleKey)) + '</h3>' +
      '<p>' + rich(t(leadKey)) + '</p>' +
      '<ul>' +
      itemKeys
        .map(function (key) {
          return '<li>' + rich(t(key)) + '</li>';
        })
        .join('') +
      '</ul></div>'
    );
  }

  return {
    render: function (host, bundle, context) {
      var t = function (key, args) {
        return bundle.getText(key, args);
      };
      var base = context.base;

      var users = ['rita', 'tom', 'dana', 'carl', 'mona'];

      host.innerHTML =
        '<div class="acme-home"><div class="acme-home__inner">' +
        '<section class="acme-hero">' +
        '<h1>' + escapeHtml(t('HomeHeroTitle')) + '</h1>' +
        '<p>' + escapeHtml(t('HomeHeroText')) + '</p>' +
        '<div class="acme-hero__chips">' +
        ['HomeChip1', 'HomeChip2', 'HomeChip3', 'HomeChip4']
          .map(function (key) {
            return '<span class="acme-hero__chip">' + escapeHtml(t(key)) + '</span>';
          })
          .join('') +
        '</div></section>' +
        '<h2 class="acme-section-title">' + escapeHtml(t('HomeAppsTitle')) + '</h2>' +
        '<div id="acme-home-tiles" class="acme-tiles"></div>' +
        '<h2 class="acme-section-title">' + escapeHtml(t('HomeSapTitle')) + '</h2>' +
        '<p class="acme-section-lead">' + escapeHtml(t('HomeSapLead')) + '</p>' +
        '<div id="acme-home-sap" class="acme-cards">' +
        card(t, 'acme-card__badge--sap', 'HomeBadgeSap', 'HomeSapCardTitle',
          ['HomeSap1', 'HomeSap2', 'HomeSap3', 'HomeSap4', 'HomeSap5'], 'HomeSapCardLead') +
        card(t, 'acme-card__badge--open', 'HomeBadgeOpen', 'HomeOpenCardTitle',
          ['HomeOpen1', 'HomeOpen2', 'HomeOpen3', 'HomeOpen4'], 'HomeOpenCardLead') +
        card(t, 'acme-card__badge--own', 'HomeBadgeOwn', 'HomeOwnCardTitle',
          ['HomeOwn1', 'HomeOwn2', 'HomeOwn3', 'HomeOwn4'], 'HomeOwnCardLead') +
        '</div>' +
        '<h2 class="acme-section-title">' + escapeHtml(t('HomeUsersTitle')) + '</h2>' +
        '<p class="acme-section-lead">' + escapeHtml(t('HomeUsersLead')) + '</p>' +
        '<div id="acme-home-users" class="acme-card acme-scroll-x"><table class="acme-users">' +
        '<thead><tr><th>' + escapeHtml(t('HomeUsersUser')) + '</th><th>' + escapeHtml(t('HomeUsersRoles')) +
        '</th><th>' + escapeHtml(t('HomeUsersTry')) + '</th><th></th></tr></thead><tbody>' +
        users
          .map(function (u) {
            var isCurrent = !!(context.user && context.user.id === u);
            return (
              '<tr' + (isCurrent ? ' aria-current="true"' : '') + '><td>' + u + '</td><td>' +
              escapeHtml(t('HomeUser_' + u + '_roles')) + '</td><td>' + rich(t('HomeUser_' + u + '_try')) + '</td>' +
              '<td><button class="acme-user-switch" type="button" data-user="' + u + '"' + (isCurrent ? ' disabled' : '') +
              '>' + escapeHtml(isCurrent ? t('HomeUsersCurrent') : t('HomeUsersSignIn')) + '</button></td></tr>'
            );
          })
          .join('') +
        '</tbody></table></div>' +
        '</div></div>';

      // Switching the demo user straight from the table.
      host.querySelectorAll('.acme-user-switch').forEach(function (button) {
        button.addEventListener('click', function () {
          demo.signInAs(button.getAttribute('data-user'));
        });
      });

      new FlexBox({
        wrap: 'Wrap',
        renderType: 'Bare',
        items: [
          numericTile({
            header: t('AppApprovals'),
            subheader: t('HomeTileApprovalsSub'),
            footer: t('HomeTileApprovalsFooter'),
            icon: 'sap-icon://approvals',
            valueColor: 'Critical',
            href: base + 'approvals/webapp/index.html',
            value: count(base, 'MyApprovalTasks/$count')
          }),
          numericTile({
            header: t('AppRequisitions'),
            subheader: t('HomeTileRequisitionsSub'),
            footer: t('HomeTileRequisitionsFooter'),
            icon: 'sap-icon://request',
            valueColor: 'Neutral',
            href: base + 'purchase-requisitions/webapp/index.html',
            value: count(base, "PurchaseRequisitions/$count?$filter=status_code eq 'IA'")
          }),
          numericTile({
            header: t('AppSuppliers'),
            subheader: t('HomeTileSuppliersSub'),
            footer: t('HomeTileSuppliersFooter'),
            icon: 'sap-icon://supplier',
            valueColor: 'Error',
            href: base + 'suppliers/webapp/index.html',
            value: count(base, "Suppliers/$count?$filter=riskClass_code eq 'C'")
          }),
          linkTile({
            header: t('AppCockpit'),
            subheader: t('HomeTileCockpitSub'),
            footer: t('HomeTileCockpitFooter'),
            icon: 'sap-icon://business-objects-experience',
            href: base + 'cockpit.html',
            sameTab: true
          }),
          linkTile({
            header: t('AppSolution'),
            subheader: t('HomeTileSolutionSub'),
            footer: t('HomeTileSolutionFooter'),
            icon: 'sap-icon://lightbulb',
            href: base + 'solution.html',
            sameTab: true
          }),
          linkTile({
            header: t('HomeTileApi'),
            subheader: '/procurement',
            footer: t('HomeTileApiFooter'),
            icon: 'sap-icon://source-code',
            href: base + 'procurement/$metadata'
          })
        ]
      })
        .addStyleClass('acme-tiles')
        .placeAt(document.getElementById('acme-home-tiles'));
    }
  };
});
