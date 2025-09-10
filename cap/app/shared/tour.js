/*
 * A small onboarding tour: dims the page, cuts a spotlight around one element
 * and explains it in a card next to it.
 *
 * Deliberately plain DOM rather than UI5 controls. Fiori Elements renders its
 * pages asynchronously and re-renders parts of them at will; the tour only
 * needs a CSS selector per step and keeps re-measuring the target, so it does
 * not care when or how often that happens.
 *
 * A step: { target?: string, title: string, text: string }
 * No target, or a target that does not show up in time -> centred card.
 */
sap.ui.define([], function () {
  'use strict';

  var WAIT_FOR_TARGET_MS = 4000;
  var PADDING = 6;
  var GAP = 14;

  var active = null;

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // Without storage the tour simply offers itself again next time.
    }
  }

  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findTarget(selector) {
    if (!selector) return null;
    var candidates = document.querySelectorAll(selector);
    for (var i = 0; i < candidates.length; i++) {
      if (isVisible(candidates[i])) return candidates[i];
    }
    return null;
  }

  function waitForTarget(selector) {
    return new Promise(function (resolve) {
      if (!selector) return resolve(null);
      var started = Date.now();
      (function poll() {
        var el = findTarget(selector);
        if (el || Date.now() - started > WAIT_FOR_TARGET_MS) return resolve(el);
        setTimeout(poll, 120);
      })();
    });
  }

  /** Tiny formatter: blank line -> paragraph, `code` -> <code>. Input is our own i18n text. */
  function formatText(text) {
    var escaped = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped
      .split(/\n\s*\n|\\n\\n/)
      .map(function (paragraph) {
        return '<p>' + paragraph.replace(/`([^`]+)`/g, '<code>$1</code>') + '</p>';
      })
      .join('');
  }

  function Tour(steps, options) {
    this.steps = steps;
    this.options = options || {};
    this.index = -1;
    this.target = null;
    this.onKey = this.onKey.bind(this);
    this.reposition = this.reposition.bind(this);
  }

  Tour.prototype.open = function () {
    var t = this.options.texts || {};
    this.blocker = document.createElement('div');
    this.blocker.className = 'acme-tour-blocker';
    this.blocker.addEventListener('click', this.next.bind(this));

    this.spot = document.createElement('div');
    this.spot.className = 'acme-tour-spot acme-tour-spot--none';

    this.card = document.createElement('div');
    this.card.className = 'acme-tour-card';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-labelledby', 'acme-tour-title');
    this.card.tabIndex = -1;
    this.card.innerHTML =
      '<button class="acme-tour-card__close" type="button" aria-label="' + (t.close || 'Close') + '">×</button>' +
      '<div class="acme-tour-card__step"></div>' +
      '<h2 class="acme-tour-card__title" id="acme-tour-title"></h2>' +
      '<div class="acme-tour-card__text"></div>' +
      '<div class="acme-tour-card__footer">' +
      '<div class="acme-tour-dots"></div>' +
      '<button class="acme-tour-btn" type="button" data-action="back">' + (t.back || 'Back') + '</button>' +
      '<button class="acme-tour-btn acme-tour-btn--primary" type="button" data-action="next"></button>' +
      '</div>';
    this.card.querySelector('.acme-tour-card__close').addEventListener('click', this.close.bind(this));
    this.card.querySelector('[data-action="back"]').addEventListener('click', this.back.bind(this));
    this.card.querySelector('[data-action="next"]').addEventListener('click', this.next.bind(this));

    document.body.appendChild(this.blocker);
    document.body.appendChild(this.spot);
    document.body.appendChild(this.card);
    document.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.reposition);
    // Fiori Elements moves things around after data arrives; follow the target.
    this.timer = setInterval(this.reposition, 250);
    this.go(0);
  };

  Tour.prototype.go = function (index) {
    var self = this;
    var t = this.options.texts || {};
    if (index < 0 || index >= this.steps.length) return;
    this.index = index;
    var step = this.steps[index];
    var token = (this.token = {});

    this.card.style.visibility = 'hidden';
    waitForTarget(step.target).then(function (el) {
      if (token !== self.token || !self.card) return; // user clicked on meanwhile
      self.target = el;
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });

      self.card.querySelector('.acme-tour-card__step').textContent =
        (t.step || 'Step {0} of {1}').replace('{0}', index + 1).replace('{1}', self.steps.length);
      self.card.querySelector('.acme-tour-card__title').textContent = step.title;
      self.card.querySelector('.acme-tour-card__text').innerHTML = formatText(step.text);
      self.card.querySelector('[data-action="back"]').style.visibility = index === 0 ? 'hidden' : 'visible';
      self.card.querySelector('[data-action="next"]').textContent =
        index === self.steps.length - 1 ? t.done || 'Done' : t.next || 'Next';
      self.card.querySelector('.acme-tour-dots').innerHTML = self.steps
        .map(function (_, i) {
          return '<span class="acme-tour-dot' + (i === index ? ' acme-tour-dot--active' : '') + '"></span>';
        })
        .join('');

      self.reposition();
      self.card.style.visibility = 'visible';
      self.card.querySelector('[data-action="next"]').focus();
    });
  };

  Tour.prototype.reposition = function () {
    if (!this.card) return;
    var el = this.target;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var cardRect = this.card.getBoundingClientRect();
    var cw = cardRect.width;
    var ch = cardRect.height;

    if (!el || !isVisible(el) || !document.body.contains(el)) {
      // Target gone (re-rendered): try to find it again, else centre the card.
      var step = this.steps[this.index];
      el = this.target = step && findTarget(step.target);
    }

    if (!el) {
      this.spot.classList.add('acme-tour-spot--none');
      this.card.style.left = Math.max(16, (vw - cw) / 2) + 'px';
      this.card.style.top = Math.max(16, (vh - ch) / 2) + 'px';
      return;
    }

    var r = el.getBoundingClientRect();
    var top = Math.max(4, r.top - PADDING);
    var left = Math.max(4, r.left - PADDING);
    var bottom = Math.min(vh - 4, r.bottom + PADDING);
    var right = Math.min(vw - 4, r.right + PADDING);
    this.spot.classList.remove('acme-tour-spot--none');
    this.spot.style.top = top + 'px';
    this.spot.style.left = left + 'px';
    this.spot.style.width = right - left + 'px';
    this.spot.style.height = bottom - top + 'px';

    // Below, above, right, left - whichever fits first, else overlap bottom.
    var cardTop;
    var cardLeft;
    if (bottom + GAP + ch <= vh) {
      cardTop = bottom + GAP;
      cardLeft = left;
    } else if (top - GAP - ch >= 0) {
      cardTop = top - GAP - ch;
      cardLeft = left;
    } else if (right + GAP + cw <= vw) {
      cardTop = top;
      cardLeft = right + GAP;
    } else if (left - GAP - cw >= 0) {
      cardTop = top;
      cardLeft = left - GAP - cw;
    } else {
      cardTop = vh - ch - 16;
      cardLeft = (vw - cw) / 2;
    }
    this.card.style.top = Math.min(Math.max(16, cardTop), vh - ch - 16) + 'px';
    this.card.style.left = Math.min(Math.max(16, cardLeft), vw - cw - 16) + 'px';
  };

  Tour.prototype.next = function () {
    if (this.index >= this.steps.length - 1) this.close();
    else this.go(this.index + 1);
  };

  Tour.prototype.back = function () {
    this.go(this.index - 1);
  };

  Tour.prototype.onKey = function (event) {
    if (event.key === 'Escape') this.close();
    else if (event.key === 'ArrowRight') this.next();
    else if (event.key === 'ArrowLeft') this.back();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  Tour.prototype.close = function () {
    clearInterval(this.timer);
    document.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.reposition);
    [this.blocker, this.spot, this.card].forEach(function (node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
    this.card = null;
    if (this.options.storageKey) storageSet(this.options.storageKey, 'done');
    if (active === this) active = null;
  };

  return {
    /** Starts a tour now, closing one that is still open. */
    start: function (steps, options) {
      if (active) active.close();
      if (!steps || !steps.length) return;
      active = new Tour(steps, options);
      active.open();
    },

    /** Starts the tour only if the user has not finished or dismissed it before. */
    startOnce: function (steps, options) {
      if (options && options.storageKey && storageGet(options.storageKey)) return;
      if (active) return; // never interrupt a running tour
      this.start(steps, options);
    },

    isRunning: function () {
      return !!active;
    }
  };
});
