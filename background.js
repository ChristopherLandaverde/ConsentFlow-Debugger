// background.js - Optimized service worker

console.log('🔍 GTM Consent Inspector: Background service worker starting...');

// Keep track of active tabs to prevent memory leaks
const activeTabs = new Set();
const tabData = new Map();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('🔍 GTM Consent Inspector: Installed/Updated');
  
  // Initialize storage with minimal defaults
  chrome.storage.local.set({
    'version': '1.2.0',
    'settings': {
      'autoMonitor': false,
      'maxEvents': 50
    }
  });
  
  // Set up context menu (optional)
  chrome.contextMenus.create({
    id: 'gtm-inspector-toggle',
    title: 'Toggle GTM Inspector Overlay',
    contexts: ['page']
  });
});

// Handle toolbar icon click - inject and toggle overlay
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Ensure content script is injected
    await ensureContentScript(tab.id);
    
    // Toggle overlay
    const response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'toggleOverlay' 
    });
    
    console.log('✅ Overlay toggled:', response);
  } catch (error) {
    console.error('❌ Error toggling overlay:', error);
    
    // If content script injection fails, show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'GTM Inspector',
      message: 'Cannot run on this page (restricted URL)'
    });
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'gtm-inspector-toggle') {
    chrome.action.onClicked.dispatch(tab);
  }
});

// Ensure content script is injected efficiently
async function ensureContentScript(tabId) {
  try {
    // Check if content script is already injected by sending a ping
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    
    if (response && response.success) {
      return true; // Content script already active
    }
  } catch (error) {
    // Content script not injected, proceed with injection
  }
  
  // Inject content script
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
  
  // Wait a moment for initialization
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return true;
}

// Handle tab updates to clean up data
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // Clean up old tab data
    if (tabData.has(tabId)) {
      const data = tabData.get(tabId);
      if (data.url !== tab.url) {
        // URL changed, clear old data
        tabData.delete(tabId);
      }
    }
    
    // Track active tab
    activeTabs.add(tabId);
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
  tabData.delete(tabId);
});

// Handle messages from content scripts (if needed)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  
  if (!tabId) {
    sendResponse({ error: 'No tab ID' });
    return;
  }
  
  switch (request.action) {
    case 'storeData':
      // Store tab-specific data
      tabData.set(tabId, { 
        ...request.data, 
        timestamp: Date.now() 
      });
      sendResponse({ success: true });
      break;
      
    case 'getData':
      // Retrieve tab-specific data
      const data = tabData.get(tabId);
      sendResponse(data || null);
      break;
      
    case 'ping':
      // Health check from content script
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
  
  return true;
});

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  
  // Clean up old tab data
  for (const [tabId, data] of tabData.entries()) {
    if (now - data.timestamp > ONE_HOUR) {
      tabData.delete(tabId);
    }
  }
  
  // Clean up inactive tabs
  chrome.tabs.query({}, (tabs) => {
    const currentTabIds = new Set(tabs.map(tab => tab.id));
    
    for (const tabId of activeTabs) {
      if (!currentTabIds.has(tabId)) {
        activeTabs.delete(tabId);
        tabData.delete(tabId);
      }
    }
  });
}, 30 * 60 * 1000); // Run every 30 minutes

// Handle extension shutdown
chrome.runtime.onSuspend.addListener(() => {
  console.log('🔍 GTM Consent Inspector: Background script suspending');
  
  // Clean up resources
  activeTabs.clear();
  tabData.clear();
});

console.log('✅ GTM Consent Inspector: Background service worker ready');