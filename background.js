// background.js - Optimized service worker with enhanced injection efficiency

console.log('🔍 GTM Consent Inspector: Background service worker starting...OPTIMIZED');

// Enhanced tab tracking with injection state
const activeTabs = new Set();
const tabData = new Map();
const injectionCache = new Map(); // Track injection status per tab
const injectionQueue = new Map(); // Queue for pending injections

// Performance monitoring for background operations
const BackgroundPerformance = {
  startTime: Date.now(),
  operations: new Map(),
  
  startOperation: function(name) {
    this.operations.set(name, Date.now());
  },
  
  endOperation: function(name) {
    const startTime = this.operations.get(name);
    if (startTime) {
      const duration = Date.now() - startTime;
      console.log(`⏱️ Background ${name} took ${duration}ms`);
      this.operations.delete(name);
      return duration;
    }
    return 0;
  },
  
  getMetrics: function() {
    return {
      totalTime: Date.now() - this.startTime,
      activeTabs: activeTabs.size,
      cachedInjections: injectionCache.size,
      queuedInjections: injectionQueue.size
    };
  }
};

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('🔍 GTM Consent Inspector: Installed/Updated');
  
  // Initialize storage with minimal defaults
  chrome.storage.local.set({
    'version': '1.2.0',
    'settings': {
      'autoMonitor': false,
      'maxEvents': 50,
      'injectionTimeout': 10000,
      'maxRetries': 3
    }
  });
  
  // Set up context menu (optional)
  chrome.contextMenus.create({
    id: 'gtm-inspector-toggle',
    title: 'Toggle GTM Inspector Overlay',
    contexts: ['page']
  });
});

// Optimized content script injection with caching and retry logic
async function ensureContentScript(tabId, forceInject = false) {
  BackgroundPerformance.startOperation('contentScriptInjection');
  
  try {
    // Check cache first
    if (!forceInject && injectionCache.has(tabId)) {
      const cacheEntry = injectionCache.get(tabId);
      const now = Date.now();
      
      // Cache is valid for 5 minutes
      if (now - cacheEntry.timestamp < 300000) {
        console.log(`📦 Using cached injection for tab ${tabId}`);
        BackgroundPerformance.endOperation('contentScriptInjection');
        return true;
      } else {
        // Cache expired, remove it
        injectionCache.delete(tabId);
      }
    }
    
    // Check if content script is already injected by sending a ping
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      
      if (response && response.success) {
        console.log(`✅ Content script already active in tab ${tabId}`);
        
        // Update cache
        injectionCache.set(tabId, {
          timestamp: Date.now(),
          status: 'active'
        });
        
        BackgroundPerformance.endOperation('contentScriptInjection');
        return true;
      }
    } catch (error) {
      // Content script not injected, proceed with injection
      console.log(`🔧 Content script not found in tab ${tabId}, injecting...`);
    }
    
    // Check if injection is already queued
    if (injectionQueue.has(tabId)) {
      console.log(`⏳ Injection already queued for tab ${tabId}`);
      return injectionQueue.get(tabId);
    }
    
    // Queue the injection
    const injectionPromise = performInjection(tabId);
    injectionQueue.set(tabId, injectionPromise);
    
    // Clean up queue after completion
    injectionPromise.finally(() => {
      injectionQueue.delete(tabId);
    });
    
    const result = await injectionPromise;
    BackgroundPerformance.endOperation('contentScriptInjection');
    return result;
    
  } catch (error) {
    console.error(`❌ Failed to ensure content script in tab ${tabId}:`, error);
    BackgroundPerformance.endOperation('contentScriptInjection');
    throw error;
  }
}

// Perform the actual injection with retry logic
async function performInjection(tabId, retryCount = 0) {
  const maxRetries = 3;
  const timeout = 10000;
  
  try {
    console.log(`🔧 Injecting content script into tab ${tabId} (attempt ${retryCount + 1})`);
    
    // Inject content script with timeout
    const injectionPromise = chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    
    // Add timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Injection timeout')), timeout);
    });
    
    await Promise.race([injectionPromise, timeoutPromise]);
    
    // Wait a moment for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify injection by sending ping
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    
    if (response && response.success) {
      console.log(`✅ Content script successfully injected into tab ${tabId}`);
      
      // Update cache
      injectionCache.set(tabId, {
        timestamp: Date.now(),
        status: 'active'
      });
      
      return true;
    } else {
      throw new Error('Injection verification failed');
    }
    
  } catch (error) {
    console.warn(`⚠️ Injection attempt ${retryCount + 1} failed for tab ${tabId}:`, error);
    
    if (retryCount < maxRetries - 1) {
      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return performInjection(tabId, retryCount + 1);
    } else {
      // Max retries reached
      console.error(`❌ Max injection retries reached for tab ${tabId}`);
      throw error;
    }
  }
}

// Handle toolbar icon click - inject and toggle overlay
chrome.action.onClicked.addListener(async (tab) => {
  try {
    BackgroundPerformance.startOperation('overlayToggle');
    
    // Ensure content script is injected
    await ensureContentScript(tab.id);
    
    // Toggle overlay
    const response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'toggleOverlay' 
    });
    
    console.log('✅ Overlay toggled:', response);
    BackgroundPerformance.endOperation('overlayToggle');
    
  } catch (error) {
    console.error('❌ Error toggling overlay:', error);
    BackgroundPerformance.endOperation('overlayToggle');
    
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

// Enhanced tab update handling with intelligent injection
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    BackgroundPerformance.startOperation('tabUpdate');
    
    // Clean up old tab data
    if (tabData.has(tabId)) {
      const data = tabData.get(tabId);
      if (data.url !== tab.url) {
        // URL changed, clear old data and cache
        tabData.delete(tabId);
        injectionCache.delete(tabId);
        console.log(`🧹 Cleared cache for tab ${tabId} (URL changed)`);
      }
    }
    
    // Track active tab
    activeTabs.add(tabId);
    
    // Check if this is a GTM-relevant page and inject if needed
    if (tab.url && isGTMRelevantPage(tab.url)) {
      console.log(`🎯 GTM-relevant page detected: ${tab.url}`);
      
      // Lazy injection - only inject when needed
      // We'll inject when the user clicks the extension icon
      // This prevents unnecessary injections on every page load
    }
    
    BackgroundPerformance.endOperation('tabUpdate');
  }
});

// Check if a page is likely to have GTM
function isGTMRelevantPage(url) {
  try {
    const urlObj = new URL(url);
    
    // Skip certain URL patterns that are unlikely to have GTM
    const skipPatterns = [
      'chrome://',
      'chrome-extension://',
      'moz-extension://',
      'edge://',
      'about:',
      'file://',
      'data:',
      'blob:'
    ];
    
    if (skipPatterns.some(pattern => url.startsWith(pattern))) {
      return false;
    }
    
    // Consider all web pages as potentially GTM-relevant
    // The actual GTM detection happens in the content script
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    
  } catch (error) {
    console.warn('Error parsing URL for GTM relevance:', error);
    return false;
  }
}

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
  tabData.delete(tabId);
  injectionCache.delete(tabId);
  injectionQueue.delete(tabId);
  
  console.log(`🧹 Cleaned up resources for closed tab ${tabId}`);
});

// Enhanced message handling with performance tracking
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  
  if (!tabId) {
    sendResponse({ error: 'No tab ID' });
    return;
  }
  
  BackgroundPerformance.startOperation(`message-${request.action}`);
  
  try {
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
        
      case 'getPerformanceMetrics':
        // Return background performance metrics
        sendResponse(BackgroundPerformance.getMetrics());
        break;
        
      case 'forceReinject':
        // Force re-injection of content script
        ensureContentScript(tabId, true).then(() => {
          sendResponse({ success: true });
        }).catch(error => {
          sendResponse({ error: error.message });
        });
        return true; // Keep message channel open
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
    
    BackgroundPerformance.endOperation(`message-${request.action}`);
    
  } catch (error) {
    console.error('Error handling message:', error);
    BackgroundPerformance.endOperation(`message-${request.action}`);
    sendResponse({ error: error.message });
  }
  
  return true;
});

// Enhanced periodic cleanup with performance monitoring
setInterval(() => {
  BackgroundPerformance.startOperation('periodicCleanup');
  
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const FIVE_MINUTES = 5 * 60 * 1000;
  
  let cleanedItems = 0;
  
  // Clean up old tab data
  for (const [tabId, data] of tabData.entries()) {
    if (now - data.timestamp > ONE_HOUR) {
      tabData.delete(tabId);
      cleanedItems++;
    }
  }
  
  // Clean up expired injection cache
  for (const [tabId, cacheEntry] of injectionCache.entries()) {
    if (now - cacheEntry.timestamp > FIVE_MINUTES) {
      injectionCache.delete(tabId);
      cleanedItems++;
    }
  }
  
  // Clean up inactive tabs
  chrome.tabs.query({}, (tabs) => {
    const currentTabIds = new Set(tabs.map(tab => tab.id));
    
    for (const tabId of activeTabs) {
      if (!currentTabIds.has(tabId)) {
        activeTabs.delete(tabId);
        tabData.delete(tabId);
        injectionCache.delete(tabId);
        injectionQueue.delete(tabId);
        cleanedItems++;
      }
    }
  });
  
  if (cleanedItems > 0) {
    console.log(`🧹 Periodic cleanup: removed ${cleanedItems} items`);
  }
  
  BackgroundPerformance.endOperation('periodicCleanup');
}, 30 * 60 * 1000); // Run every 30 minutes

// Handle extension shutdown with cleanup
chrome.runtime.onSuspend.addListener(() => {
  console.log('🔍 GTM Consent Inspector: Background script suspending');
  
  // Clean up all resources
  activeTabs.clear();
  tabData.clear();
  injectionCache.clear();
  injectionQueue.clear();
  
  console.log('🧹 All background resources cleaned up');
});

console.log('✅ GTM Consent Inspector: Background service worker ready (OPTIMIZED)');