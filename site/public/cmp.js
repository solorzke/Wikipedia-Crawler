/*!
 * cmp.js — lightweight consent management platform
 *
 * Pairs with the inline consent bootstrap in <head>, which must run BEFORE
 * anything else so that Google Consent Mode v2 defaults are set and gtag.js is
 * withheld until the visitor opts in. This file only renders the UI and applies
 * changes; it is safe to load with `defer`.
 *
 * Public API:
 *   window.CMP.open()   — open the preferences dialog
 *   window.CMP.reset()  — clear the stored decision and show the banner again
 *   window.CMP.get()    — read the current decision (or null)
 *
 * Any element with a [data-cmp-open] attribute opens the preferences dialog.
 */
(function () {
  'use strict';

  var CFG = window.CMP_CONFIG || {};
  var KEY = 'cmp_consent_v1';
  var VERSION = 1;
  var GA_ID = CFG.gaId || null;
  var POLICY_URL = CFG.policyUrl || null;
  var SITE = CFG.siteName || 'this site';
  var DARK = CFG.theme === 'dark';

  /* --------------------------------------------------------------- copy */

  var STR = {
    bannerTitle:    'Cookies on {site}',
    bannerText:     'We use Google Analytics to understand how the site is used. ' +
                    'Nothing is loaded and no cookies are set until you agree.',
    policy:         ' See our <a href="{url}" style="color:inherit">privacy policy</a>.',
    prefs:          'Preferences',
    reject:         'Reject',
    accept:         'Accept',
    dialogTitle:    'Cookie preferences',
    necessaryName:  'Strictly necessary',
    necessaryDesc:  'Required for the site to function, including remembering this choice. ' +
                    'These are stored in your browser only and are never sent anywhere.',
    alwaysOn:       'Always on',
    analyticsName:  'Analytics',
    analyticsDesc:  'Google Analytics 4, used to count visits and see which pages get read. ' +
                    'Off by default.',
    analyticsAria:  'Allow analytics cookies',
    whatStores:     'What this stores',
    detailId:       'a random visitor ID, expires after 2 years.',
    detailSession:  'session state, expires after 2 years.',
    detailSent:     'Sent to Google: page URL, referrer, approximate location from a truncated ' +
                    'IP address, device and browser type.',
    detailNoAds:    'No advertising or personalization signals are enabled on this site.',
    cancel:         'Cancel',
    rejectAll:      'Reject all',
    save:           'Save choices'
  };

  if (CFG.strings) {
    for (var k in CFG.strings) {
      if (Object.prototype.hasOwnProperty.call(CFG.strings, k)) STR[k] = CFG.strings[k];
    }
  }

  /* ---------------------------------------------------------------- state */

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.v === VERSION && raw.categories) return raw;
    } catch (e) {}
    return null;
  }

  function write(analytics) {
    var record = {
      v: VERSION,
      ts: new Date().toISOString(),
      categories: { necessary: true, analytics: !!analytics }
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(record));
    } catch (e) {}
    return record;
  }

  /* ------------------------------------------------------------- consent */

  var gaInjected = false;

  function injectGA() {
    if (gaInjected || !GA_ID) return;
    if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
      gaInjected = true;
      return;
    }
    gaInjected = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }

  function clearGACookies() {
    // GA4 writes _ga and _ga_<container>. Expire them on this host and on the
    // registrable domain so a withdrawal actually takes effect.
    var host = location.hostname;
    var domains = ['', host, '.' + host];
    var parts = host.split('.');
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));

    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name !== '_ga' && name.indexOf('_ga_') !== 0 && name.indexOf('_gid') !== 0) return;
      domains.forEach(function (d) {
        document.cookie =
          name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' +
          (d ? '; domain=' + d : '');
      });
    });
  }

  function apply(analytics) {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: analytics ? 'granted' : 'denied'
      });
    }
    if (analytics) injectGA();
    else clearGACookies();

    try {
      window.dispatchEvent(
        new CustomEvent('cmp:consent', { detail: { analytics: !!analytics } })
      );
    } catch (e) {}
  }

  /* ----------------------------------------------------------------- css */

  var CSS =
    '#cmp-root button,#cmp-root .cmp-locked{display:inline-block}' +
    '#cmp-root .cmp-banner,#cmp-root .cmp-copy,#cmp-root .cmp-cat-copy,' +
      '#cmp-root .cmp-detail,#cmp-root .cmp-dialog{display:block}' +
    '#cmp-root details{display:block}' +
    '#cmp-root .cmp-detail ul{display:block;list-style:disc}' +
    '#cmp-root .cmp-detail li{display:list-item}' +
    '#cmp-root .cmp-switch{display:inline-block}' +
    '#cmp-root .cmp-switch input{display:block}' +

    '#cmp-root,#cmp-root *{box-sizing:border-box;margin:0;padding:0;' +
      'font-family:' + (CFG.fontFamily ||
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif') + ';' +
      'letter-spacing:normal;text-transform:none;line-height:1.5}' +

    '#cmp-root{' +
      '--cmp-bg:' + (CFG.bg || (DARK ? '#161b22' : '#ffffff')) + ';' +
      '--cmp-fg:' + (CFG.fg || (DARK ? '#e6edf3' : '#16181d')) + ';' +
      '--cmp-dim:' + (CFG.dim || (DARK ? '#9aa5b1' : '#5b6270')) + ';' +
      '--cmp-border:' + (CFG.border || (DARK ? '#2a313c' : '#dfe3e8')) + ';' +
      '--cmp-accent:' + (CFG.accent || (DARK ? '#4dd0a7' : '#1f6feb')) + ';' +
      '--cmp-accent-fg:' + (CFG.accentFg || (DARK ? '#06231a' : '#ffffff')) + ';' +
      '--cmp-subtle:' + (CFG.subtle || (DARK ? '#1c2330' : '#f4f6f8')) + ';' +
      '--cmp-shadow:' + (DARK ? '0 -2px 32px rgba(0,0,0,.6)' : '0 -2px 32px rgba(16,24,40,.14)') + ';' +
      'position:fixed;inset:auto 0 0 0;z-index:2147483000;color:var(--cmp-fg)}' +

    '#cmp-root[hidden]{display:none!important}' +

    /* banner ------------------------------------------------------------ */
    '#cmp-root .cmp-banner{background:var(--cmp-bg);border-top:1px solid var(--cmp-border);' +
      'box-shadow:var(--cmp-shadow);padding:16px}' +
    '#cmp-root .cmp-inner{max-width:1040px;margin:0 auto;display:flex;flex-wrap:wrap;' +
      'align-items:center;gap:14px 20px}' +
    '#cmp-root .cmp-copy{flex:1 1 320px;min-width:0}' +
    '#cmp-root .cmp-title{font-size:15px;font-weight:600;margin-bottom:3px}' +
    '#cmp-root .cmp-text{font-size:13.5px;color:var(--cmp-dim)}' +
    '#cmp-root .cmp-actions{display:flex;flex-wrap:wrap;gap:8px;flex:0 0 auto}' +

    /* buttons ----------------------------------------------------------- */
    '#cmp-root button{font-size:13.5px;font-weight:600;border-radius:7px;padding:9px 16px;' +
      'border:1px solid transparent;cursor:pointer;white-space:nowrap;' +
      'background:none;color:inherit;transition:opacity .15s,background-color .15s}' +
    '#cmp-root button:hover{opacity:.85}' +
    '#cmp-root button:focus-visible{outline:2px solid var(--cmp-accent);outline-offset:2px}' +
    '#cmp-root .cmp-primary{background:var(--cmp-accent);color:var(--cmp-accent-fg)}' +
    '#cmp-root .cmp-secondary{border-color:var(--cmp-border);color:var(--cmp-fg)}' +
    '#cmp-root .cmp-link{color:var(--cmp-dim);text-decoration:underline;padding:9px 8px;font-weight:500}' +

    /* dialog ------------------------------------------------------------ */
    '#cmp-root .cmp-scrim{position:fixed;inset:0;background:rgba(8,10,14,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:16px}' +
    '#cmp-root .cmp-dialog{background:var(--cmp-bg);border:1px solid var(--cmp-border);' +
      'border-radius:12px;width:100%;max-width:520px;max-height:calc(100vh - 32px);' +
      'overflow-y:auto;box-shadow:0 12px 48px rgba(0,0,0,.35)}' +
    '#cmp-root .cmp-dialog-head{padding:18px 20px 12px;border-bottom:1px solid var(--cmp-border)}' +
    '#cmp-root .cmp-dialog-head h2{font-size:16px;font-weight:600}' +
    '#cmp-root .cmp-dialog-body{padding:6px 20px 4px}' +
    '#cmp-root .cmp-dialog-foot{padding:12px 20px 18px;display:flex;flex-wrap:wrap;gap:8px;' +
      'justify-content:flex-end;border-top:1px solid var(--cmp-border);margin-top:8px}' +

    /* category rows ----------------------------------------------------- */
    '#cmp-root .cmp-cat{display:flex;gap:14px;align-items:flex-start;padding:16px 0;' +
      'border-bottom:1px solid var(--cmp-border)}' +
    '#cmp-root .cmp-cat:last-child{border-bottom:0}' +
    '#cmp-root .cmp-cat-copy{flex:1 1 auto;min-width:0}' +
    '#cmp-root .cmp-cat-name{font-size:14px;font-weight:600;margin-bottom:3px}' +
    '#cmp-root .cmp-cat-desc{font-size:13px;color:var(--cmp-dim)}' +
    '#cmp-root .cmp-locked{font-size:12px;font-weight:600;color:var(--cmp-dim);' +
      'background:var(--cmp-subtle);border:1px solid var(--cmp-border);border-radius:999px;' +
      'padding:4px 10px;flex:0 0 auto;margin-top:2px}' +
    '#cmp-root details{margin-top:8px}' +
    '#cmp-root summary{font-size:12.5px;color:var(--cmp-dim);cursor:pointer;' +
      'text-decoration:underline;list-style:none}' +
    '#cmp-root summary::-webkit-details-marker{display:none}' +
    '#cmp-root .cmp-detail{font-size:12.5px;color:var(--cmp-dim);margin-top:8px;' +
      'background:var(--cmp-subtle);border:1px solid var(--cmp-border);border-radius:8px;padding:10px 12px}' +
    '#cmp-root .cmp-detail li{margin:0 0 4px 16px}' +
    '#cmp-root .cmp-detail li:last-child{margin-bottom:0}' +
    '#cmp-root .cmp-detail code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'font-size:.92em;color:var(--cmp-fg);background:none;padding:0;border:0;word-break:break-all}' +

    /* switch ------------------------------------------------------------ */
    '#cmp-root .cmp-switch{flex:0 0 auto;position:relative;width:44px;height:26px;margin-top:1px}' +
    '#cmp-root .cmp-switch input{position:absolute;inset:0;width:100%;height:100%;' +
      'opacity:0;margin:0;cursor:pointer;z-index:1}' +
    '#cmp-root .cmp-track{position:absolute;inset:0;border-radius:999px;' +
      'background:var(--cmp-subtle);border:1px solid var(--cmp-border);transition:background-color .18s}' +
    '#cmp-root .cmp-track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;' +
      'border-radius:50%;background:var(--cmp-dim);transition:transform .18s,background-color .18s}' +
    '#cmp-root input:checked+.cmp-track{background:var(--cmp-accent);border-color:var(--cmp-accent)}' +
    '#cmp-root input:checked+.cmp-track::after{transform:translateX(18px);background:var(--cmp-accent-fg)}' +
    '#cmp-root input:focus-visible+.cmp-track{outline:2px solid var(--cmp-accent);outline-offset:2px}' +

    '@media (max-width:560px){' +
      '#cmp-root .cmp-actions{width:100%}' +
      '#cmp-root .cmp-actions button{flex:1 1 auto}' +
      '#cmp-root .cmp-link{flex-basis:100%;text-align:center}' +
      '#cmp-root .cmp-dialog-foot{flex-direction:column-reverse}' +
      '#cmp-root .cmp-dialog-foot button{width:100%}}' +

    '@media (prefers-reduced-motion:reduce){#cmp-root *{transition:none!important}}';

  /* ----------------------------------------------------------------- dom */

  var root, banner, dialog, lastFocus;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function policyLink() {
    return POLICY_URL ? STR.policy.replace('{url}', POLICY_URL) : '';
  }

  function mount() {
    var style = document.createElement('style');
    style.appendChild(document.createTextNode(CSS));
    document.head.appendChild(style);

    root = el('div');
    root.id = 'cmp-root';
    root.hidden = true;
    document.body.appendChild(root);
  }

  /* --------------------------------------------------------------- banner */

  function showBanner() {
    if (banner) return;
    banner = el('div', 'cmp-banner');
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<div class="cmp-inner">' +
        '<div class="cmp-copy">' +
          '<div class="cmp-title">' + STR.bannerTitle.replace('{site}', SITE) + '</div>' +
          '<div class="cmp-text">' + STR.bannerText + policyLink() + '</div>' +
        '</div>' +
        '<div class="cmp-actions">' +
          '<button type="button" class="cmp-link" data-act="prefs">' + STR.prefs + '</button>' +
          '<button type="button" class="cmp-secondary" data-act="reject">' + STR.reject + '</button>' +
          '<button type="button" class="cmp-primary" data-act="accept">' + STR.accept + '</button>' +
        '</div>' +
      '</div>';

    banner.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'accept') decide(true);
      else if (act === 'reject') decide(false);
      else if (act === 'prefs') openDialog();
    });

    root.appendChild(banner);
    root.hidden = false;
  }

  function hideBanner() {
    if (!banner) return;
    banner.remove();
    banner = null;
    if (!dialog) root.hidden = true;
  }

  function decide(analytics) {
    write(analytics);
    apply(analytics);
    hideBanner();
    closeDialog();
  }

  /* --------------------------------------------------------------- dialog */

  function openDialog() {
    if (dialog) return;
    lastFocus = document.activeElement;
    var stored = read();
    var on = !!(stored && stored.categories.analytics);

    dialog = el('div', 'cmp-scrim');
    dialog.innerHTML =
      '<div class="cmp-dialog" role="dialog" aria-modal="true" aria-labelledby="cmp-dlg-title">' +
        '<div class="cmp-dialog-head"><h2 id="cmp-dlg-title">' + STR.dialogTitle + '</h2></div>' +
        '<div class="cmp-dialog-body">' +

          '<div class="cmp-cat">' +
            '<div class="cmp-cat-copy">' +
              '<div class="cmp-cat-name">' + STR.necessaryName + '</div>' +
              '<div class="cmp-cat-desc">' + STR.necessaryDesc + '</div>' +
            '</div>' +
            '<span class="cmp-locked">' + STR.alwaysOn + '</span>' +
          '</div>' +

          '<div class="cmp-cat">' +
            '<div class="cmp-cat-copy">' +
              '<div class="cmp-cat-name">' + STR.analyticsName + '</div>' +
              '<div class="cmp-cat-desc">' + STR.analyticsDesc + '</div>' +
              '<details><summary>' + STR.whatStores + '</summary>' +
                '<div class="cmp-detail"><ul>' +
                  '<li><code>_ga</code> &mdash; ' + STR.detailId + '</li>' +
                  '<li><code>_ga_' + (GA_ID ? String(GA_ID).replace(/^G-/, '') : 'XXXXXXX') +
                    '</code> &mdash; ' + STR.detailSession + '</li>' +
                  '<li>' + STR.detailSent + '</li>' +
                  '<li>' + STR.detailNoAds + '</li>' +
                '</ul></div>' +
              '</details>' +
            '</div>' +
            '<span class="cmp-switch">' +
              '<input type="checkbox" id="cmp-analytics" aria-label="' + STR.analyticsAria + '"' +
                (on ? ' checked' : '') + '>' +
              '<span class="cmp-track"></span>' +
            '</span>' +
          '</div>' +

        '</div>' +
        '<div class="cmp-dialog-foot">' +
          '<button type="button" class="cmp-secondary" data-act="close">' + STR.cancel + '</button>' +
          '<button type="button" class="cmp-secondary" data-act="reject">' + STR.rejectAll + '</button>' +
          '<button type="button" class="cmp-primary" data-act="save">' + STR.save + '</button>' +
        '</div>' +
      '</div>';

    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) return closeDialog();
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close') closeDialog();
      else if (act === 'reject') decide(false);
      else if (act === 'save') decide(!!document.getElementById('cmp-analytics').checked);
    });

    document.addEventListener('keydown', onKeydown, true);
    root.appendChild(dialog);
    root.hidden = false;

    var first = dialog.querySelector('button, input');
    if (first) first.focus();
  }

  function closeDialog() {
    if (!dialog) return;
    document.removeEventListener('keydown', onKeydown, true);
    dialog.remove();
    dialog = null;
    if (!banner) root.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKeydown(e) {
    if (!dialog) return;
    if (e.key === 'Escape') return closeDialog();
    if (e.key !== 'Tab') return;

    var items = dialog.querySelectorAll('button, input, summary, a[href]');
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------------------------------------------------------------- init */

  function init() {
    mount();

    var stored = read();
    if (stored) apply(stored.categories.analytics);
    else showBanner();

    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-cmp-open]') : null;
      if (!t) return;
      e.preventDefault();
      openDialog();
    });

    window.CMP = {
      open: openDialog,
      get: read,
      reset: function () {
        try {
          localStorage.removeItem(KEY);
        } catch (e) {}
        closeDialog();
        showBanner();
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
