/*
 * Demo mode: who am I, switching users with one click, resetting the data -
 * and the demo script, a drawer that walks a presenter through the story.
 *
 * The user switch writes a cookie that the server turns into mocked
 * credentials (srv/demo-mode.ts). It only works where authentication is
 * mocked; with XSUAA the service answers 403 and the drawer stays a reading
 * aid.
 */
sap.ui.define(['sap/base/i18n/Localization'], function (Localization) {
  'use strict';

  var COOKIE = 'acme-demo-user';
  var OPEN_KEY = 'acme.script.open';
  var STEP_KEY = 'acme.script.step';

  var state = {
    base: './',
    user: null,
    users: [],
    available: false,
    t: function (key) {
      return key;
    },
    appHref: function () {
      return './';
    }
  };

  /** Sample data the script walks through (db/data). */
  var IDS = {
    steelPlates: 'd0000001-0000-4000-8000-000000000001',
    hydraulics: 'd0000008-0000-4000-8000-000000000008',
    anadolu: '50000005-0000-4000-8000-000000000005'
  };

  /**
   * The demo story, in the order it is told. `user` is who the step is
   * performed as, `target` where it happens.
   */
  var SCRIPT = [
    { key: 'Intro', app: 'solution' },
    { key: 'Submit', user: 'rita', app: 'requisitions', hash: '#/PurchaseRequisitions(ID=' + IDS.steelPlates + ',IsActiveEntity=true)' },
    { key: 'Approve1', user: 'tom', app: 'approvals' },
    { key: 'Downgrade', user: 'mona', app: 'suppliers', hash: '#/Suppliers(' + IDS.anadolu + ')' },
    { key: 'PathGrown', user: 'dana', app: 'approvals' },
    { key: 'Cfo', user: 'carl', app: 'approvals' },
    { key: 'Order', user: 'rita', app: 'requisitions', hash: '#/PurchaseRequisitions(ID=' + IDS.hydraulics + ',IsActiveEntity=true)' },
    { key: 'Sync', user: 'mona', app: 'suppliers' },
    { key: 'Cockpit', user: 'mona', app: 'cockpit' },
    { key: 'Reset', action: 'reset' }
  ];

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // A presenter without storage just starts at step 1 on every page.
    }
  }

  function json(url, options) {
    var defaults = {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Accept-Language': Localization.getLanguageTag().toString() }
    };
    return fetch(url, Object.assign(defaults, options))
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function rich(text) {
    return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  return {
    /** Loads the signed-in user and the demo users. Returns the current user. */
    load: function (base) {
      state.base = base;
      return Promise.all([
        json(base + 'procurement/currentUser()'),
        json(base + 'demo/users()')
      ]).then(function (results) {
        state.user = results[0];
        state.users = (results[1] && results[1].value) || [];
        state.available = state.users.length > 0;
        return state.user;
      });
    },

    users: function () {
      return state.users;
    },

    /** Switches the demo user and reloads, optionally somewhere else. */
    signInAs: function (id, url) {
      document.cookie = COOKIE + '=' + encodeURIComponent(id) + '; path=/; max-age=86400; SameSite=Lax';
      if (url && url !== window.location.href) window.location.href = url;
      else window.location.reload();
    },

    resetData: function () {
      return json(state.base + 'demo/resetData', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}'
      }).then(function (result) {
        return !!result;
      });
    },

    // ----------------------------------------------------------- demo script

    initScript: function (options) {
      state.t = options.t;
      state.appHref = options.appHref;
      state.currentApp = options.currentApp;
      this.renderScript();
      if (readStorage(OPEN_KEY) === 'true') this.openScript();
    },

    renderScript: function () {
      var self = this;
      var t = state.t;
      if (document.getElementById('acme-script')) return;

      var drawer = document.createElement('aside');
      drawer.id = 'acme-script';
      drawer.className = 'acme-script';
      drawer.setAttribute('aria-label', t('ScriptTitle'));
      drawer.innerHTML =
        '<header class="acme-script__head">' +
        '<div><strong>' + escapeHtml(t('ScriptTitle')) + '</strong>' +
        '<p>' + escapeHtml(t('ScriptLead')) + '</p></div>' +
        '<button class="acme-script__close" type="button" aria-label="' + escapeHtml(t('ScriptClose')) + '">×</button>' +
        '</header><ol class="acme-script__steps"></ol>';

      var list = drawer.querySelector('.acme-script__steps');
      var current = Number(readStorage(STEP_KEY) || 0);

      SCRIPT.forEach(function (step, index) {
        var user = step.user;
        var li = document.createElement('li');
        li.className = 'acme-script__step' + (index === current ? ' acme-script__step--current' : '');
        li.innerHTML =
          '<div class="acme-script__no">' + (index + 1) + '</div>' +
          '<div class="acme-script__body">' +
          '<h4>' + escapeHtml(t('Script' + step.key + 'Title')) + '</h4>' +
          '<p>' + rich(t('Script' + step.key + 'Text')) + '</p>' +
          (user ? '<span class="acme-script__user">' + escapeHtml(t('ScriptAsUser', [user])) + '</span>' : '') +
          '</div>';

        var button = document.createElement('button');
        button.className = 'acme-tour-btn acme-script__go';
        button.type = 'button';
        button.textContent = step.action === 'reset' ? t('ScriptResetButton') : t('ScriptGo');
        button.addEventListener('click', function () {
          writeStorage(STEP_KEY, String(index));
          if (step.action === 'reset') {
            self.resetData().then(function () {
              writeStorage(STEP_KEY, '0');
              window.location.href = state.appHref('home');
            });
            return;
          }
          var url = state.appHref(step.app) + (step.hash || '');
          if (user && (!state.user || state.user.id !== user)) self.signInAs(user, url);
          else window.location.href = url;
        });
        li.querySelector('.acme-script__body').appendChild(button);
        list.appendChild(li);
      });

      drawer.querySelector('.acme-script__close').addEventListener('click', function () {
        self.closeScript();
      });
      document.body.appendChild(drawer);
    },

    openScript: function () {
      var drawer = document.getElementById('acme-script');
      if (!drawer) return;
      drawer.classList.add('acme-script--open');
      writeStorage(OPEN_KEY, 'true');
      var current = drawer.querySelector('.acme-script__step--current');
      if (current) current.scrollIntoView({ block: 'center' });
    },

    closeScript: function () {
      var drawer = document.getElementById('acme-script');
      if (!drawer) return;
      drawer.classList.remove('acme-script--open');
      writeStorage(OPEN_KEY, 'false');
    },

    toggleScript: function () {
      var drawer = document.getElementById('acme-script');
      if (!drawer) return;
      if (drawer.classList.contains('acme-script--open')) this.closeScript();
      else this.openScript();
    }
  };
});
