// ConsentFlow Debugger — Background Service Worker
// Handles content script injection for tabs that load before the extension, and forgets a
// tab's UI state when it closes.
importScripts('popup/ui-state.js');

chrome.tabs.onRemoved.addListener(function (tabId) {
  CFUiState.forgetTab(tabId);
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'ensureContentScript' && request.tabId) {
    ensureContentScript(request.tabId).then(sendResponse);
    return true;
  }
});

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
