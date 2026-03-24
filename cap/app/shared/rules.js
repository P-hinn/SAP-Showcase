/*
 * Regelwerk: the approval matrix in force, and the way a procurement lead
 * changes it - download it as Excel, edit it, upload it, look at the preview
 * and the findings, activate it.
 *
 * Nothing is decided here. Whether a matrix is valid is checked on the server
 * (lib/approval-matrix.ts); this page shows the result and never activates a
 * matrix the server has not previewed without findings.
 */
sap.ui.define(['sap/base/i18n/Localization', 'sap/m/MessageToast'], function (Localization, MessageToast) {
  'use strict';

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function request(base, path, options) {
    var init = Object.assign(
      {
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Language': Localization.getLanguageTag().toString()
        }
      },
      options
    );
    return fetch(base + 'procurement/' + path, init).then(function (response) {
      return response.json().then(
        function (body) {
          return { ok: response.ok, body: body };
        },
        function () {
          return { ok: response.ok, body: null };
        }
      );
    });
  }

  /** Every message of an OData error, nested details included. */
  function errorMessages(body) {
    var error = body && body.error;
    if (!error) return [];
    return error.details && error.details.length
      ? error.details.map(function (detail) { return detail.message; })
      : [error.message];
  }

  function fileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result).split(',')[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function download(base64, name) {
    var bytes = Uint8Array.from(atob(base64), function (char) { return char.charCodeAt(0); });
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  return {
    render: function (host, bundle, context) {
      var t = function (key, args) {
        return bundle.getText(key, args);
      };
      var base = context.base;
      var locale = Localization.getLanguageTag().toString();
      var money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
      var date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
      var isAdmin = !!(context.user && context.user.roles.indexOf('ProcurementAdmin') >= 0);
      var pending = null;

      /** The matrix as a grid: one row per tier, one coloured cell per risk class. */
      function grid(tiers) {
        var previous = 0;
        return (
          '<div class="acme-scroll-x"><table class="acme-matrix"><thead><tr><th>' + escapeHtml(t('RulesColumnValue')) + '</th>' +
          ['A', 'B', 'C']
            .map(function (riskClass) {
              return '<th><span class="acme-long">' + escapeHtml(t('RulesColumnRisk', [riskClass])) +
                '</span><span class="acme-short">' + riskClass + '</span></th>';
            })
            .join('') +
          '</tr></thead><tbody>' +
          tiers
            .map(function (tier) {
              var open = tier.maxValue === null || tier.maxValue === undefined;
              var label = open
                ? t('RulesFrom', [money.format(previous)])
                : t('RulesRange', [money.format(previous), money.format(Number(tier.maxValue))]);
              if (!open) previous = Number(tier.maxValue);
              return (
                '<tr><td>' + escapeHtml(label) + '</td>' +
                [tier.levelA, tier.levelB, tier.levelC]
                  .map(function (level) {
                    // "L2 · Abteilungsleitung": the role part is dropped on a
                    // phone (CSS), so three columns still fit next to each other.
                    var parts = t('RulesLevel' + level).split(' · ');
                    return '<td><span class="acme-level acme-level--' + level + '">' + escapeHtml(parts[0]) +
                      (parts[1] ? '<span class="acme-level__role"> · ' + escapeHtml(parts[1]) + '</span>' : '') +
                      '</span></td>';
                  })
                  .join('') +
                '</tr>'
              );
            })
            .join('') +
          '</tbody></table></div>'
        );
      }

      host.innerHTML =
        '<div class="acme-home"><div class="acme-home__inner">' +
        '<h1 class="acme-page-title">' + escapeHtml(t('RulesTitle')) + '</h1>' +
        '<p class="acme-section-lead">' + escapeHtml(t('RulesLead')) + '</p>' +
        '<section class="acme-card" id="acme-rules-current">' +
        '<div class="acme-rules__head"><h3>' + escapeHtml(t('RulesCurrent')) + '</h3>' +
        '<button class="acme-tour-btn" type="button" data-action="export">' + escapeHtml(t('RulesExport')) + '</button></div>' +
        '<div id="acme-rules-grid"><p class="acme-empty">…</p></div>' +
        '<p class="acme-card__lead" id="acme-rules-meta"></p>' +
        '</section>' +
        '<h2 class="acme-section-title">' + escapeHtml(t('RulesChangeTitle')) + '</h2>' +
        '<section class="acme-card" id="acme-rules-upload">' +
        (isAdmin
          ? '<p>' + escapeHtml(t('RulesChangeText')) + '</p>' +
            '<label class="acme-tour-btn acme-tour-btn--primary acme-upload">' + escapeHtml(t('RulesUpload')) +
            '<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>' +
            '<div id="acme-rules-preview"></div>'
          : '<p class="acme-note">' + escapeHtml(t('RulesAdminOnly')) + '</p>') +
        '</section>' +
        '<h2 class="acme-section-title">' + escapeHtml(t('RulesChecksTitle')) + '</h2>' +
        '<div class="acme-cards">' +
        [1, 2, 3]
          .map(function (index) {
            return '<div class="acme-card"><h3>' + escapeHtml(t('RulesCheck' + index + 'Title')) + '</h3><p>' +
              escapeHtml(t('RulesCheck' + index + 'Text')) + '</p></div>';
          })
          .join('') +
        '</div></div></div>';

      function loadCurrent() {
        request(base, 'ApprovalThresholds?$orderby=position').then(function (result) {
          var rows = (result.body && result.body.value) || [];
          document.getElementById('acme-rules-grid').innerHTML = grid(rows);
          var changed = rows.reduce(function (latest, row) {
            return !latest || row.modifiedAt > latest.modifiedAt ? row : latest;
          }, null);
          document.getElementById('acme-rules-meta').textContent = changed
            ? t('RulesChangedBy', [changed.modifiedBy || '–', date.format(new Date(changed.modifiedAt))])
            : '';
        });
      }

      host.querySelector('[data-action="export"]').addEventListener('click', function () {
        request(base, 'exportApprovalMatrix()').then(function (result) {
          if (result.ok && result.body) download(result.body.value, t('RulesFileName') + '.xlsx');
        });
      });

      var preview = document.getElementById('acme-rules-preview');
      var input = host.querySelector('#acme-rules-upload input[type="file"]');

      function renderPreview(result) {
        if (!result.ok) {
          preview.innerHTML = '<div class="acme-findings">' +
            errorMessages(result.body).map(function (message) { return '<p>' + escapeHtml(message) + '</p>'; }).join('') +
            '</div>';
          return;
        }
        var findings = result.body.findings || [];
        preview.innerHTML =
          '<h3>' + escapeHtml(t('RulesPreview')) + '</h3>' + grid(result.body.tiers || []) +
          (findings.length
            ? '<div class="acme-findings"><strong>' + escapeHtml(t('RulesFindings', [String(findings.length)])) + '</strong>' +
              findings.map(function (finding) {
                return '<p>' + escapeHtml(finding.row ? t('RulesRow', [String(finding.row)]) + ' – ' : '') +
                  escapeHtml(finding.message) + ' <code>' + escapeHtml(finding.code) + '</code></p>';
              }).join('') + '</div>'
            : '<p class="acme-ok">' + escapeHtml(t('RulesNoFindings')) + '</p>' +
              '<button class="acme-tour-btn acme-tour-btn--primary" type="button" data-action="activate">' +
              escapeHtml(t('RulesActivate')) + '</button>');

        var activate = preview.querySelector('[data-action="activate"]');
        if (activate) {
          activate.addEventListener('click', function () {
            request(base, 'activateApprovalMatrix', { method: 'POST', body: JSON.stringify({ file: pending }) }).then(
              function (outcome) {
                if (outcome.ok) {
                  MessageToast.show(t('RulesActivated'));
                  preview.innerHTML = '';
                  loadCurrent();
                } else {
                  renderPreview(outcome);
                }
              }
            );
          });
        }
      }

      if (input) {
        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          if (!file) return;
          fileAsBase64(file).then(function (base64) {
            pending = base64;
            input.value = '';
            return request(base, 'previewApprovalMatrix', { method: 'POST', body: JSON.stringify({ file: base64 }) });
          }).then(renderPreview);
        });
      }

      loadCurrent();
    }
  };
});
