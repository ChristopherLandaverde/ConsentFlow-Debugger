// ConsentFlow Debugger — UI state persistence
// Remembers which disclosures are expanded and which side-panel view is selected, per
// surface and per tab, in chrome.storage.session: in memory only, cleared when the browser
// closes, never synced, and not readable by content scripts (Chrome's default access level).
// Only UI keys are stored (disclosure ids and a view name), never captured page data.
// background.js forgets a tab's entries when the tab closes.
//
// Plain script, no modules: defines globalThis.CFUiState. Works in pages and the worker.
(function (root) {
  'use strict';

  var PREFIX = 'cf.ui.';
  var SURFACES = ['popup', 'panel'];
  var MAX_OPEN = 100;
  var KEY_RE = /^[A-Za-z0-9_-]{1,120}$/;

  function key(surface, tabId) { return PREFIX + surface + '.' + tabId; }

  // Keep only well-formed state: known view, a bounded set of expanded disclosure ids.
  function sanitize(raw, views) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var open = {};
    var count = 0;
    var src = raw.open && typeof raw.open === 'object' ? raw.open : {};
    Object.keys(src).forEach(function (k) {
      if (count < MAX_OPEN && src[k] === true && KEY_RE.test(k)) { open[k] = true; count++; }
    });
    var out = { open: open };
    if (views && views.length) out.view = views.indexOf(raw.view) !== -1 ? raw.view : views[0];
    return out;
  }

  // Flip one disclosure. Collapsed items are dropped rather than stored as false.
  function toggle(state, k) {
    var open = {};
    Object.keys(state.open || {}).forEach(function (x) { open[x] = true; });
    if (open[k]) delete open[k]; else open[k] = true;
    var out = { open: open };
    if (state.view) out.view = state.view;
    return out;
  }

  function area() {
    var c = root.chrome;
    return c && c.storage && c.storage.session ? c.storage.session : null;
  }

  function load(surface, tabId, views, cb) {
    var store = area();
    if (!store || tabId === null || tabId === undefined) { cb(sanitize(null, views)); return; }
    var k = key(surface, tabId);
    try {
      store.get(k, function (items) {
        cb(sanitize(items && items[k], views));
      });
    } catch (e) {
      cb(sanitize(null, views));
    }
  }

  function save(surface, tabId, state) {
    var store = area();
    if (!store || tabId === null || tabId === undefined) return;
    var items = {};
    items[key(surface, tabId)] = sanitize(state, state.view ? [state.view] : null);
    try { store.set(items); } catch (e) { /* storage unavailable: state lasts until close */ }
  }

  function forgetTab(tabId) {
    var store = area();
    if (!store) return;
    try { store.remove(SURFACES.map(function (s) { return key(s, tabId); })); } catch (e) { /* ignore */ }
  }

  root.CFUiState = {
    PREFIX: PREFIX,
    key: key,
    sanitize: sanitize,
    toggle: toggle,
    load: load,
    save: save,
    forgetTab: forgetTab
  };
})(globalThis);
