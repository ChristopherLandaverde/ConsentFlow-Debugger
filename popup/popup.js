// popup.js - Optimized version that won't freeze Chrome
import { initializeTabs } from './tabs-manager.js';
import { 
  initializeConsentSimulator, 
  applyConsentPreset 
} from './consent-simulator.js';
import { 
  initializeTagList, 
  updateTagList, 
  refreshTagStatus 
} from './tag-list.js';
import { 
  initializeEventLogger, 
  updateEventLog, 
  refreshEventLog,
  clearEventLog,
  exportEventLog 
} from './event-logger.js';
import { 
  initializeQAPanel, 
  runConsentTest, 
  runTagTest 
} from './qa-panel.js';

// Performance controls
let isRefreshing = false;
let refreshTimeouts = new Map();
let messageQueue = [];
let isProcessingQueue = false;

// Throttled content script interface
const contentScriptInterface = {
  // Throttled execution to prevent spam
  executeInPage: function(func, args = [], callback = null) {
    // Add to queue instead of immediate execution
    messageQueue.push({
      type: 'execute',
      func,
      args,
      callback
    });
    
    this.processQueue();
  },
  
  // Throttled request handler 
  sendRequest: function(action, data = {}, callback = null) {
    messageQueue.push({
      type: 'request',
      action,
      data,
      callback
    });
    
    this.processQueue();
  },
  
  // Process message queue with throttling
  processQueue: function() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    // Process one message every 100ms to prevent overwhelming
    const processNext = () => {
      if (messageQueue.length === 0) {
        isProcessingQueue = false;
        return;
      }
      
      const message = messageQueue.shift();
      
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0]) {
          setTimeout(processNext, 100);
          return;
        }
        
        if (message.type === 'execute') {
          chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            function: message.func,
            args: message.args
          }, function(results) {
            if (chrome.runtime.lastError) {
              console.warn('Script execution failed:', chrome.runtime.lastError);
            } else if (message.callback && results && results[0]) {
              message.callback(results[0].result);
            }
            
            // Process next message after delay
            setTimeout(processNext, 100);
          });
        } else if (message.type === 'request') {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: message.action,
            data: message.data
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.warn('Message failed:', chrome.runtime.lastError);
            } else if (message.callback) {
              message.callback(response);
            }
            
            // Process next message after delay
            setTimeout(processNext, 100);
          });
        }
      });
    };
    
    processNext();
  }
};

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize all modules
  initializeTabs();
  initializeConsentSimulator(contentScriptInterface);
  initializeTagList(contentScriptInterface);
  initializeEventLogger(contentScriptInterface);
  initializeQAPanel(contentScriptInterface);
  
  // Initialize overlay toggle with debouncing
  let overlayTimeout = null;
  document.getElementById('toggleOverlay').addEventListener('click', function() {
    if (overlayTimeout) return; // Prevent spam clicks
    
    overlayTimeout = setTimeout(() => {
      overlayTimeout = null;
    }, 1000);
    
    contentScriptInterface.executeInPage(toggleOverlay);
  });
  
  // Initial check with delay to let page load
  setTimeout(() => {
    checkGTMOnCurrentPage();
  }, 500);
  
  // Set up smart refresh (only when visible and needed)
  setupSmartRefresh();
  
  // Clean up on popup close
  window.addEventListener('beforeunload', cleanup);
});

// Smart refresh that doesn't overwhelm
function setupSmartRefresh() {
  let lastRefresh = 0;
  const MIN_REFRESH_INTERVAL = 10000; // 10 seconds minimum
  
  // Only refresh when tab is visible and popup is active
  const smartRefresh = () => {
    const now = Date.now();
    
    // Skip if too soon or page not visible
    if (now - lastRefresh < MIN_REFRESH_INTERVAL || document.hidden) {
      return;
    }
    
    // Skip if already refreshing
    if (isRefreshing) {
      return;
    }
    
    isRefreshing = true;
    lastRefresh = now;
    
    // Only refresh if user is on relevant tabs
    const activeTab = document.querySelector('.tab-button.active');
    const tabName = activeTab ? activeTab.getAttribute('data-tab') : 'tags';
    
    if (tabName === 'tags') {
      refreshTagStatus(contentScriptInterface);
    } else if (tabName === 'events') {
      refreshEventLog(contentScriptInterface);
    }
    
    // Reset refresh flag after processing
    setTimeout(() => {
      isRefreshing = false;
    }, 2000);
  };
  
  // Use intersection observer to detect when popup is visible
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Start gentle refresh cycle
        const refreshInterval = setInterval(() => {
          if (document.hidden || !document.querySelector('body')) {
            clearInterval(refreshInterval);
            return;
          }
          smartRefresh();
        }, MIN_REFRESH_INTERVAL);
        
        // Store interval for cleanup
        refreshTimeouts.set('main', refreshInterval);
      }
    });
  });
  
  observer.observe(document.body);
}

// Optimized GTM check with caching
let gtmCheckCache = null;
let gtmCheckTime = 0;

function checkGTMOnCurrentPage() {
  const now = Date.now();
  
  // Use cache if recent (within 5 seconds)
  if (gtmCheckCache && (now - gtmCheckTime) < 5000) {
    processGTMResult(gtmCheckCache);
    return;
  }
  
  contentScriptInterface.executeInPage(checkForGTM, [], function(result) {
    if (result) {
      gtmCheckCache = result;
      gtmCheckTime = now;
      processGTMResult(result);
    }
  });
}

// Process GTM result efficiently
function processGTMResult(result) {
  updateGTMStatusDisplay(result);
  
  // Only update if we have meaningful data
  if (result.hasGTM) {
    // Batch updates to prevent multiple renders
    requestAnimationFrame(() => {
      if (result.tags && result.tags.length > 0) {
        updateTagList(result.tags);
      }
      if (result.events && result.events.length > 0) {
        updateEventLog(result.events);
      }
      if (result.consentState) {
        updateConsentToggles(result.consentState);
      }
    });
  }
}

// Optimized GTM status display
function updateGTMStatusDisplay(result) {
  const gtmStatus = document.getElementById('gtmStatus');
  const consentModeStatus = document.getElementById('consentModeStatus');
  
  // Batch DOM updates
  if (result.hasGTM) {
    gtmStatus.textContent = `GTM Found: ${result.gtmId}`;
    gtmStatus.className = 'status found';
    
    consentModeStatus.textContent = result.hasConsentMode ? 
      'Consent Mode is active' : 'Consent Mode not detected';
    consentModeStatus.className = result.hasConsentMode ? 
      'status found' : 'status not-found';
  } else {
    gtmStatus.textContent = 'GTM not detected on this page';
    gtmStatus.className = 'status not-found';
    consentModeStatus.textContent = 'Consent Mode not applicable';
    consentModeStatus.className = 'status not-found';
  }
}

// Update consent toggles efficiently
function updateConsentToggles(consentState) {
  // Batch DOM updates
  requestAnimationFrame(() => {
    for (const [key, value] of Object.entries(consentState)) {
      const element = document.getElementById(key);
      if (element && element.value !== value) {
        element.value = value;
      }
    }
  });
}

// Cleanup function
function cleanup() {
  // Clear all timeouts and intervals
  refreshTimeouts.forEach((timeout, key) => {
    clearInterval(timeout);
    clearTimeout(timeout);
  });
  refreshTimeouts.clear();
  
  // Clear message queue
  messageQueue.length = 0;
  isProcessingQueue = false;
  isRefreshing = false;
}

// Content script function for overlay (lightweight)
function toggleOverlay() {
  let overlay = document.getElementById('gtm-consent-inspector-overlay');
  
  if (overlay) {
    overlay.remove();
    return true;
  }
  
  // Create minimal overlay
  overlay = document.createElement('div');
  overlay.id = 'gtm-consent-inspector-overlay';
  overlay.innerHTML = `
    <div style="position: fixed; top: 10px; right: 10px; width: 300px; 
                background: white; border: 1px solid #ccc; border-radius: 4px; 
                padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
                z-index: 9999999; font-family: Arial, sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h3 style="margin: 0;">🔍 GTM Inspector</h3>
        <button onclick="this.closest('#gtm-consent-inspector-overlay').remove()" 
                style="background: none; border: none; font-size: 18px; cursor: pointer;">×</button>
      </div>
      <div style="font-size: 12px; color: #666;">
        Extension is active. Use popup for full controls.
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  return true;
}

// Lightweight GTM check for content script
function checkForGTM() {
  const hasGTM = !!window.google_tag_manager;
  let gtmId = '';
  let hasConsentMode = false;
  
  if (hasGTM) {
    // Get GTM ID efficiently
    gtmId = Object.keys(window.google_tag_manager).find(key => key.startsWith('GTM-')) || '';
    
    // Quick consent mode check
    hasConsentMode = !!(window.gtag || (window.dataLayer && 
      window.dataLayer.some(item => 
        Array.isArray(item) && item[0] === 'consent')));
  }
  
  return {
    hasGTM,
    gtmId,
    hasConsentMode,
    consentState: hasConsentMode ? getCurrentConsentState() : {},
    tags: hasGTM ? getBasicTagInfo() : [],
    events: getRecentEvents()
  };
}

// Basic tag info (lightweight version)
function getBasicTagInfo() {
  const tags = [];
  
  // Quick check for common tags
  if (window.gtag || document.querySelector('script[src*="gtag/js"]')) {
    tags.push({
      id: 'ga4',
      name: 'Google Analytics 4',
      type: 'analytics',
      category: 'analytics'
    });
  }
  
  if (window.ga || document.querySelector('script[src*="google-analytics.com"]')) {
    tags.push({
      id: 'ua',
      name: 'Universal Analytics', 
      type: 'analytics',
      category: 'analytics'
    });
  }
  
  return tags;
}

// Get recent events only (last 10)
function getRecentEvents() {
  if (!window.gtmConsentInspector || !window.gtmConsentInspector.events) {
    return [];
  }
  
  return window.gtmConsentInspector.events.slice(-10);
}

// Lightweight consent state check
function getCurrentConsentState() {
  const defaultState = {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'granted',
    security_storage: 'granted'
  };
  
  if (!window.dataLayer) return defaultState;
  
  // Find most recent consent setting
  for (let i = window.dataLayer.length - 1; i >= 0; i--) {
    const item = window.dataLayer[i];
    if (Array.isArray(item) && item[0] === 'consent' && 
        (item[1] === 'default' || item[1] === 'update')) {
      return { ...defaultState, ...(item[2] || {}) };
    }
  }
  
  return defaultState;
}