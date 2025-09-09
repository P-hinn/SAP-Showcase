/*
 * Einkaufs-Cockpit: the numbers a procurement lead asks for, from the same
 * service the Fiori apps use. The aggregations come from the reporting service
 * (srv/analytics-service.cds), i.e. from the database - the page only draws.
 */
sap.ui.define(['sap/base/i18n/Localization'], function (Localization) {
  'use strict';

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function get(base, url) {
    return fetch(base + url, {
      credentials: 'same-origin',
      // Without this the service would answer in the browser's language, not
      // in the one the user picked in the shell.
      headers: { Accept: 'application/json', 'Accept-Language': Localization.getLanguageTag().toString() }
    })
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

  function formatters() {
    var locale = Localization.getLanguageTag().toString();
    return {
      money: new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }),
      number: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
    };
  }

  /** Average days between submission and final decision. */
  function averageLeadTime(requisitions) {
    var durations = requisitions
      .filter(function (row) {
        return row.submittedAt && row.completedAt;
      })
      .map(function (row) {
        return (new Date(row.completedAt) - new Date(row.submittedAt)) / 86400000;
      });
    if (!durations.length) return null;
    return durations.reduce(function (sum, value) { return sum + value; }, 0) / durations.length;
  }

  function sum(rows, field) {
    return rows.reduce(function (total, row) {
      return total + Number(row[field] || 0);
    }, 0);
  }

  function kpi(options) {
    return (
      '<div class="acme-kpi acme-kpi--' + options.tone + '">' +
      '<span class="acme-kpi__label">' + escapeHtml(options.label) + '</span>' +
      '<strong class="acme-kpi__value">' + escapeHtml(options.value) + '</strong>' +
      '<span class="acme-kpi__hint">' + escapeHtml(options.hint) + '</span>' +
      '</div>'
    );
  }

  /** Horizontal bar list - one row per entry, width relative to the largest value. */
  function barList(entries, format) {
    if (!entries.length) return '<p class="acme-empty"></p>';
    var max = Math.max.apply(
      null,
      entries.map(function (entry) {
        return entry.value;
      })
    );
    return (
      '<ul class="acme-bars">' +
      entries
        .map(function (entry) {
          var width = max > 0 ? Math.max(2, Math.round((entry.value / max) * 100)) : 0;
          return (
            '<li class="acme-bars__row">' +
            '<span class="acme-bars__label" title="' + escapeHtml(entry.label) + '">' + escapeHtml(entry.label) + '</span>' +
            '<span class="acme-bars__track"><span class="acme-bars__fill acme-bars__fill--' + (entry.tone || 'neutral') +
            '" style="width:' + width + '%"></span></span>' +
            '<span class="acme-bars__value">' + escapeHtml(format(entry.value)) + '</span>' +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  var TONE_BY_RISK = { A: 'good', B: 'warning', C: 'bad' };

  return {
    render: function (host, bundle, context) {
      var t = function (key, args) {
        return bundle.getText(key, args);
      };
      var base = context.base;
      var fmt = formatters();

      host.innerHTML =
        '<div class="acme-home"><div class="acme-home__inner">' +
        '<h1 class="acme-page-title">' + escapeHtml(t('CockpitTitle')) + '</h1>' +
        '<p class="acme-section-lead">' + escapeHtml(t('CockpitLead')) + '</p>' +
        '<div id="acme-kpis" class="acme-kpis"></div>' +
        '<div class="acme-cards acme-cards--wide">' +
        '<section class="acme-card"><h3>' + escapeHtml(t('CockpitByStatus')) + '</h3><div id="acme-chart-status"></div></section>' +
        '<section class="acme-card"><h3>' + escapeHtml(t('CockpitByGroup')) + '</h3><div id="acme-chart-groups"></div></section>' +
        '<section class="acme-card"><h3>' + escapeHtml(t('CockpitExposure')) + '</h3>' +
        '<p class="acme-card__lead">' + escapeHtml(t('CockpitExposureLead')) + '</p><div id="acme-chart-exposure"></div></section>' +
        '<section class="acme-card"><h3>' + escapeHtml(t('CockpitBudget')) + '</h3><div id="acme-chart-budget"></div></section>' +
        '</div>' +
        '<h2 class="acme-section-title">' + escapeHtml(t('CockpitActivity')) + '</h2>' +
        '<div id="acme-activity" class="acme-card"></div>' +
        '</div></div>';

      Promise.all([
        get(base, 'procurement/PurchaseRequisitions?$select=status_code,totalValue,submittedAt,completedAt,supplierRiskClass_code&$expand=status($select=name)'),
        get(base, 'analytics/SpendByMaterialGroup'),
        get(base, 'analytics/SupplierRiskExposure'),
        get(base, 'analytics/CostCenterBudget'),
        get(base, 'procurement/RequisitionEvents?$top=8&$orderby=occurredAt desc&$expand=eventType($select=name),requisition($select=requisitionNumber,title)')
      ]).then(function (results) {
        var requisitions = results[0];
        var byGroup = results[1];
        var exposure = results[2];
        var budgets = results[3];
        var events = results[4];

        // ------------------------------------------------------------ KPIs
        var inApproval = requisitions.filter(function (row) { return row.status_code === 'IA'; });
        var approved = requisitions.filter(function (row) { return row.status_code === 'AP'; });
        var leadTime = averageLeadTime(requisitions);
        var highRisk = exposure.filter(function (row) { return row.riskClass === 'C'; });

        document.getElementById('acme-kpis').innerHTML =
          kpi({
            tone: 'warning',
            label: t('CockpitKpiInApproval'),
            value: fmt.money.format(sum(inApproval, 'totalValue')),
            hint: t('CockpitKpiInApprovalHint', [String(inApproval.length)])
          }) +
          kpi({
            tone: 'good',
            label: t('CockpitKpiApproved'),
            value: fmt.money.format(sum(approved, 'totalValue')),
            hint: t('CockpitKpiApprovedHint', [String(approved.length)])
          }) +
          kpi({
            tone: 'neutral',
            label: t('CockpitKpiLeadTime'),
            value: leadTime === null ? '–' : t('CockpitDays', [fmt.number.format(leadTime)]),
            hint: t('CockpitKpiLeadTimeHint')
          }) +
          kpi({
            tone: 'bad',
            label: t('CockpitKpiHighRisk'),
            value: fmt.money.format(sum(highRisk, 'openVolume')),
            hint: t('CockpitKpiHighRiskHint', [String(highRisk.length)])
          });

        // --------------------------------------------------- volume by status
        var byStatus = {};
        requisitions.forEach(function (row) {
          var label = (row.status && row.status.name) || row.status_code;
          byStatus[label] = (byStatus[label] || 0) + Number(row.totalValue || 0);
        });
        document.getElementById('acme-chart-status').innerHTML = barList(
          Object.keys(byStatus)
            .map(function (label) {
              return { label: label, value: byStatus[label] };
            })
            .sort(function (a, b) { return b.value - a.value; }),
          function (value) { return fmt.money.format(value); }
        );

        // ------------------------------------------- volume by material group
        var groups = {};
        byGroup.forEach(function (row) {
          var label = row.materialGroup || row.materialGroupCode;
          groups[label] = (groups[label] || 0) + Number(row.requestedVolume || 0);
        });
        document.getElementById('acme-chart-groups').innerHTML = barList(
          Object.keys(groups)
            .map(function (label) { return { label: label, value: groups[label] }; })
            .sort(function (a, b) { return b.value - a.value; }),
          function (value) { return fmt.money.format(value); }
        );

        // ------------------------------------------------- supplier exposure
        document.getElementById('acme-chart-exposure').innerHTML = barList(
          exposure
            .map(function (row) {
              return {
                label: row.supplierName,
                value: Number(row.openVolume || 0),
                tone: TONE_BY_RISK[row.riskClass] || 'neutral'
              };
            })
            .sort(function (a, b) { return b.value - a.value; })
            .slice(0, 6),
          function (value) { return fmt.money.format(value); }
        );

        // ---------------------------------------------- cost center budgets
        document.getElementById('acme-chart-budget').innerHTML =
          '<ul class="acme-bars">' +
          budgets
            .map(function (row) {
              var annual = Number(row.annualBudget || 0);
              var consumed = Number(row.consumedBudget || 0);
              var share = annual > 0 ? Math.min(100, Math.round((consumed / annual) * 100)) : 0;
              var tone = share > 90 ? 'bad' : share > 75 ? 'warning' : 'good';
              return (
                '<li class="acme-bars__row">' +
                '<span class="acme-bars__label" title="' + escapeHtml(row.name) + '">' + escapeHtml(row.name) + '</span>' +
                '<span class="acme-bars__track"><span class="acme-bars__fill acme-bars__fill--' + tone +
                '" style="width:' + share + '%"></span></span>' +
                '<span class="acme-bars__value">' + share + ' %<small>' + escapeHtml(fmt.money.format(Number(row.remainingBudget || 0))) + '</small></span>' +
                '</li>'
              );
            })
            .join('') +
          '</ul>';

        // ------------------------------------------------------- activity
        document.getElementById('acme-activity').innerHTML = events.length
          ? '<ul class="acme-feed">' +
            events
              .map(function (event) {
                var requisition = event.requisition || {};
                return (
                  '<li class="acme-feed__item">' +
                  '<span class="acme-feed__when">' + escapeHtml(fmt.date.format(new Date(event.occurredAt))) + '</span>' +
                  '<span class="acme-feed__what"><strong>' + escapeHtml((event.eventType && event.eventType.name) || event.eventType_code) +
                  '</strong> · ' + escapeHtml(requisition.requisitionNumber || requisition.title || '') + '</span>' +
                  '<span class="acme-feed__who">' + escapeHtml(event.actor || '') + '</span>' +
                  (event.note ? '<span class="acme-feed__note">' + escapeHtml(event.note) + '</span>' : '') +
                  '</li>'
                );
              })
              .join('') +
            '</ul>'
          : '<p class="acme-empty">' + escapeHtml(t('CockpitNoActivity')) + '</p>';
      });
    }
  };
});
