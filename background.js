// ConsentFlow Debugger — Background Service Worker
// Injects the content script into tabs that loaded before the extension, keeps the toolbar
// badge in step with each tab's verdict, and forgets a tab's UI state when it closes.
importScripts('popup/findings.js', 'popup/ui-state.js');

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (!request || !request.action) return;
  if (request.action === 'ensureContentScript' && request.tabId) {
    ensureContentScript(request.tabId).then(sendResponse);
    return true;
  }
  var tabId = sender && sender.tab ? sender.tab.id : null;
  if (tabId === null || tabId === undefined) return;
  if (request.action === 'pageStart') setBadge(tabId, null);
  if (request.action === 'pageState') setBadge(tabId, request.state);
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  CFUiState.forgetTab(tabId);
});

// Badge text is the broken-finding count from the same verdict the popup shows; cleared
// when nothing is broken. The tooltip carries the verdict sentence.
function setBadge(tabId, state) {
  var badge = CFFindings.badgeFor(state && state.ready ? CFFindings.computeVerdict(state) : null);
  quiet('setBadgeText', { tabId: tabId, text: badge.text });
  quiet('setBadgeBackgroundColor', { tabId: tabId, color: badge.background });
  quiet('setBadgeTextColor', { tabId: tabId, color: badge.color }); // Chrome 110+
  quiet('setTitle', { tabId: tabId, title: badge.title });
}

// Call a chrome.action setter, ignoring a tab that closed in the meantime.
function quiet(method, details) {
  var a = chrome.action;
  if (!a || typeof a[method] !== 'function') return;
  try {
    var done = a[method](details);
    if (done && typeof done.catch === 'function') done.catch(function () {});
  } catch (e) { /* tab already closed */ }
}

async function ensureContentScript(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      return { ok: false, reason: 'system-page' };
    }
    // Try pinging existing content script
    try {
      const resp = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (resp && resp.ok) return { ok: true, existing: true };
    } catch { /* not injected yet */ }
    // Inject
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content.js'] });
    return { ok: true, injected: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
