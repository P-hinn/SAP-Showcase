/*
 * Tour content per page. Texts live in shared/i18n; targets are CSS selectors
 * on the stable IDs Fiori Elements derives from the annotations
 * (fe::FilterBar::<EntitySet>, fe::table::<EntitySet>::LineItem, ...).
 * A selector that matches nothing just centres the card, so a renamed ID
 * degrades the tour instead of breaking it.
 */
sap.ui.define([], function () {
  'use strict';

  var SHELL = {
    appMenu: '#acmeShell .sapFSHMegaMenu',
    language: '#acmeShellLanguage',
    theme: '#acmeShellTheme',
    tour: '#acmeShellTour',
    script: '#acmeShellScript',
    avatar: '#acmeShellAvatar'
  };

  var PAGES = {
    home: [
      { key: 'TourHome1' },
      { key: 'TourHome2', target: '#acme-home-tiles' },
      { key: 'TourShellLanguage', target: SHELL.language },
      { key: 'TourShellTheme', target: SHELL.theme },
      { key: 'TourShellUser', target: SHELL.avatar },
      { key: 'TourHome3', target: '#acme-home-sap' },
      { key: 'TourShellScript', target: SHELL.script },
      { key: 'TourShellRestart', target: SHELL.tour }
    ],

    solution: [
      { key: 'TourSolution1' },
      { key: 'TourSolution2', target: '.acme-roi' },
      { key: 'TourShellScript', target: SHELL.script }
    ],

    cockpit: [
      { key: 'TourCockpit1', target: '#acme-kpis' },
      { key: 'TourCockpit2', target: '#acme-chart-exposure' },
      { key: 'TourCockpit3', target: '#acme-activity' },
      { key: 'TourShellRestart', target: SHELL.tour }
    ],

    approvals: [
      { key: 'TourInbox1' },
      { key: 'TourInbox2', target: '[id*="fe::table::"][id$="::LineItem"].sapUiMdcTable' },
      { key: 'TourInbox3', target: SHELL.avatar },
      { key: 'TourShellScript', target: SHELL.script }
    ],

    'requisitions.list': [
      { key: 'TourReqList1' },
      { key: 'TourShellAppMenu', target: SHELL.appMenu },
      { key: 'TourReqList2', target: '[id$="fe::FilterBar::PurchaseRequisitions"]' },
      { key: 'TourReqList3', target: '[id$="fe::TabMultipleMode"] .sapMITH' },
      { key: 'TourReqList4', target: '[id*="fe::table::"][id$="::LineItem"].sapUiMdcTable' },
      { key: 'TourReqList5', target: '[id$="StandardAction::Create"]' },
      { key: 'TourShellLanguage', target: SHELL.language },
      { key: 'TourReqListUsers', target: SHELL.avatar },
      { key: 'TourShellRestart', target: SHELL.tour }
    ],

    'requisitions.detail': [
      { key: 'TourReqDetail1', target: '[id$="fe::HeaderContentContainer"]' },
      { key: 'TourReqDetail2', target: '[id$="fe::ObjectPageDynamicHeaderTitle-mainActions"]' },
      { key: 'TourReqDetail3', target: '[id$="fe::FacetSection::ApprovalFacet"]' },
      { key: 'TourReqDetail4', target: '[id$="fe::FacetSection::ItemsFacet"]' },
      { key: 'TourReqDetail5', target: '[id$="fe::FacetSection::HistoryFacet"]' }
    ],

    'suppliers.list': [
      { key: 'TourSupList1' },
      { key: 'TourSupList2', target: '[id$="fe::FilterBar::Suppliers"]' },
      { key: 'TourSupList3', target: '[id*="fe::table::"][id$="::LineItem"].sapUiMdcTable' },
      { key: 'TourSupList4', target: '[id*="fe::table::"][id$="::LineItem-toolbar"]' },
      { key: 'TourSupList5', target: '[id*="fe::table::"][id$="::LineItem-toolbar"]' },
      { key: 'TourShellUser', target: SHELL.avatar },
      { key: 'TourShellRestart', target: SHELL.tour }
    ],

    'suppliers.detail': [
      { key: 'TourSupDetail1', target: '[id$="fe::HeaderContentContainer"]' },
      { key: 'TourSupDetail2', target: '[id$="fe::FacetSection::fgRisk"], [id$="fe::FacetSection::RiskIndicators"]' }
    ]
  };

  return {
    stepsFor: function (pageKey, t) {
      return (PAGES[pageKey] || []).map(function (step) {
        return {
          target: step.target,
          title: t(step.key + 'Title'),
          text: t(step.key + 'Text')
        };
      });
    }
  };
});
