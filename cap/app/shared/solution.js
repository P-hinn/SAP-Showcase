/*
 * "Für Entscheider": what the scenario is worth in business terms, how it is
 * built, and what a project would look like.
 *
 * The savings calculator does not ship any industry averages - it computes
 * with the numbers the reader enters and shows the formula it used. Every
 * text comes from the i18n bundle, German and English.
 */
sap.ui.define(['sap/base/i18n/Localization', 'acme/shared/demo'], function (Localization, demo) {
  'use strict';

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function rich(text) {
    return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  /** Cards from numbered i18n keys: <prefix>1Title / <prefix>1Text, ... */
  function cards(t, prefix, count, extraClass) {
    var items = [];
    for (var index = 1; index <= count; index++) {
      items.push(
        '<div class="acme-card ' + (extraClass || '') + '">' +
        '<h3>' + escapeHtml(t(prefix + index + 'Title')) + '</h3>' +
        '<p>' + rich(t(prefix + index + 'Text')) + '</p>' +
        '</div>'
      );
    }
    return items.join('');
  }

  function flow(t, count) {
    var steps = [];
    for (var index = 1; index <= count; index++) {
      steps.push(
        '<li class="acme-flow__step">' +
        '<span class="acme-flow__no">' + index + '</span>' +
        '<strong>' + escapeHtml(t('SolutionFlow' + index + 'Title')) + '</strong>' +
        '<span>' + escapeHtml(t('SolutionFlow' + index + 'Text')) + '</span>' +
        '</li>'
      );
    }
    return '<ol class="acme-flow">' + steps.join('') + '</ol>';
  }

  function phases(t, count) {
    var rows = [];
    for (var index = 1; index <= count; index++) {
      rows.push(
        '<tr><td>' + escapeHtml(t('SolutionPhase' + index + 'Title')) + '</td>' +
        '<td>' + escapeHtml(t('SolutionPhase' + index + 'Duration')) + '</td>' +
        '<td>' + escapeHtml(t('SolutionPhase' + index + 'Text')) + '</td></tr>'
      );
    }
    return rows.join('');
  }

  return {
    render: function (host, bundle, context) {
      var t = function (key, args) {
        return bundle.getText(key, args);
      };
      var locale = Localization.getLanguageTag().toString();
      var money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
      var number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

      host.innerHTML =
        '<div class="acme-home"><div class="acme-home__inner">' +

        '<section class="acme-hero">' +
        '<h1>' + escapeHtml(t('SolutionHeroTitle')) + '</h1>' +
        '<p>' + escapeHtml(t('SolutionHeroText')) + '</p>' +
        '<div class="acme-hero__actions">' +
        '<button class="acme-cta" type="button" data-action="demo">' + escapeHtml(t('SolutionCtaDemo')) + '</button>' +
        '<button class="acme-cta acme-cta--ghost" type="button" data-action="script">' + escapeHtml(t('SolutionCtaScript')) + '</button>' +
        '</div></section>' +

        '<h2 class="acme-section-title">' + escapeHtml(t('SolutionPainTitle')) + '</h2>' +
        '<p class="acme-section-lead">' + escapeHtml(t('SolutionPainLead')) + '</p>' +
        '<div class="acme-cards">' + cards(t, 'SolutionPain', 4) + '</div>' +

        '<h2 class="acme-section-title">' + escapeHtml(t('SolutionBuildTitle')) + '</h2>' +
        '<div class="acme-cards">' + cards(t, 'SolutionBuild', 3) + '</div>' +

        '<h2 class="acme-section-title">' + escapeHtml(t('SolutionFlowTitle')) + '</h2>' +
        flow(t, 5) +

        '<h2 class="acme-section-title">' + escapeHtml(t('SolutionBenefitTitle')) + '</h2>' +
        '<div class="acme-cards">' + cards(t, 'SolutionBenefit', 4) + '</div>' +

        '<h2 class="acme-section-title">' + escapeHtml(t('SolutionRoiTitle')) + '</h2>' +
        '<p class="acme-section-lead">' + escapeHtml(t('SolutionRoiLead')) + '</p>' +
        '<div class="acme-card acme-roi">' +
        '<div class="acme-roi__inputs">' +
        '<label><span>' + escapeHtml(t('SolutionRoiVolume')) + '</span>' +
        '<input id="acme-roi-volume" type="number" min="0" step="10" value="400"></label>' +
        '<label><span>' + escapeHtml(t('SolutionRoiMinutes')) + '</span>' +
        '<input id="acme-roi-minutes" type="number" min="0" step="1" value="12"></label>' +
        '<label><span>' + escapeHtml(t('SolutionRoiRate')) + '</span>' +
        '<input id="acme-roi-rate" type="number" min="0" step="5" value="65"></label>' +
        '</div>' +
        '<div class="acme-roi__result">' +
        '<div><span>' + escapeHtml(t('SolutionRoiHours')) + '</span><strong id="acme-roi-hours">–</strong></div>' +
        '<div><span>' + escapeHtml(t('SolutionRoiMoney')) + '</span><strong id="acme-roi-money">–</strong></div>' +
        '</div>' +
        '<p class="acme-roi__formula" id="acme-roi-formula"></p>' +
        '<p class="acme-roi__note">' + escapeHtml(t('SolutionRoiNote')) + '</p>' +
        '</div>' +

        '<h2 class="acme-section-title">' + escapeHtml(t('SolutionCleanCoreTitle')) + '</h2>' +
        '<p class="acme-section-lead">' + escapeHtml(t('SolutionCleanCoreLead')) + '</p>' +
        '<div class="acme-card acme-scroll-x"><table class="acme-users acme-compare">' +
        '<thead><tr><th></th><th>' + escapeHtml(t('SolutionOnStack')) + '</th><th>' + escapeHtml(t('SolutionSideBySide')) + '</th></tr></thead>' +
        '<tbody>' +
        ['Where', 'When', 'Skills', 'Risk']
          .map(function (row) {
            return (
              '<tr><td>' + escapeHtml(t('SolutionCompare' + row)) + '</td>' +
              '<td>' + escapeHtml(t('SolutionCompare' + row + 'OnStack')) + '</td>' +
              '<td>' + escapeHtml(t('SolutionCompare' + row + 'Side')) + '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table></div>' +

        '<h2 class="acme-section-title">' + escapeHtml(t('SolutionPhasesTitle')) + '</h2>' +
        '<p class="acme-section-lead">' + escapeHtml(t('SolutionPhasesLead')) + '</p>' +
        '<div class="acme-card acme-scroll-x"><table class="acme-users acme-compare">' +
        '<thead><tr><th>' + escapeHtml(t('SolutionPhase')) + '</th><th>' + escapeHtml(t('SolutionDuration')) + '</th><th>' + escapeHtml(t('SolutionContent')) + '</th></tr></thead>' +
        '<tbody>' + phases(t, 4) + '</tbody></table></div>' +

        '<h2 class="acme-section-title">' + escapeHtml(t('SolutionContactTitle')) + '</h2>' +
        '<div class="acme-card acme-contact">' +
        '<p>' + escapeHtml(t('SolutionContactText')) + '</p>' +
        '<p class="acme-contact__person"><strong>' + escapeHtml(t('SolutionContactName')) + '</strong><br>' +
        '<a href="mailto:' + escapeHtml(t('SolutionContactMail')) + '">' + escapeHtml(t('SolutionContactMail')) + '</a></p>' +
        '</div>' +

        '</div></div>';

      // ------------------------------------------------------------- actions
      host.querySelector('[data-action="demo"]').addEventListener('click', function () {
        window.location.href = context.base + 'purchase-requisitions/webapp/index.html';
      });
      host.querySelector('[data-action="script"]').addEventListener('click', function () {
        demo.openScript();
      });

      // ---------------------------------------------------------- calculator
      var volume = document.getElementById('acme-roi-volume');
      var minutes = document.getElementById('acme-roi-minutes');
      var rate = document.getElementById('acme-roi-rate');

      function recalculate() {
        var perYear = Math.max(0, Number(volume.value) || 0) * 12;
        var savedMinutes = Math.max(0, Number(minutes.value) || 0);
        var hourlyRate = Math.max(0, Number(rate.value) || 0);
        var hours = (perYear * savedMinutes) / 60;

        document.getElementById('acme-roi-hours').textContent = t('SolutionRoiHoursValue', [number.format(hours)]);
        document.getElementById('acme-roi-money').textContent = money.format(hours * hourlyRate);
        document.getElementById('acme-roi-formula').textContent = t('SolutionRoiFormula', [
          number.format(perYear),
          number.format(savedMinutes),
          number.format(hours)
        ]);
      }

      [volume, minutes, rate].forEach(function (input) {
        input.addEventListener('input', recalculate);
      });
      recalculate();
    }
  };
});
