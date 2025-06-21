// content.js - Optimized lightweight content script

console.log('🔍 GTM Consent Inspector: Loading optimized version...');

// Performance controls
let isInitialized = false;
let messageHandlers = new Map();
let eventBuffer = [];
let lastBufferFlush = 0;

// Initialize only when needed
function initializeInspector() {
  if (isInitialized) return;
  
  console.log('🔍 GTM Consent Inspector: Initializing...');
  
  // Set up lightweight event monitoring
  setupEventMonitoring();
  
  // Set up message handlers
  setupMessageHandlers();
  
  // Mark as initialized
  isInitialized = true;
  
  console.log('✅ GTM Consent Inspector: Ready');
}

// Lightweight event monitoring setup
function setupEventMonitoring() {
  // Only initialize if not already done
  if (window.gtmConsentInspector) return;
  
  window.gtmConsentInspector = {
    events: [],
    maxEvents: 50, // Lower limit for performance
    isMonitoring: false
  };
  
  // Hook into dataLayer only if it exists
  if (window.dataLayer) {
    interceptDataLayer();
  } else {
    // Watch for dataLayer creation
    const observer = new MutationObserver(() => {
      if (window.dataLayer && !window.gtmConsentInspector.originalPush) {
        interceptDataLayer();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    
    // Stop watching after 10 seconds
    setTimeout(() => observer.disconnect(), 10000);
  }
  
  // Hook into gtag if available
  if (window.gtag) {
    interceptGtag();
  }
}

// Lightweight dataLayer interception
function interceptDataLayer() {
  if (window.gtmConsentInspector.originalPush) return;
  
  window.gtmConsentInspector.originalPush = window.dataLayer.push;
  
  let lastEventTime = 0;
  const THROTTLE_MS = 1000; // 1 second throttle
  
  window.dataLayer.push = function() {
    const result = window.gtmConsentInspector.originalPush.apply(this, arguments);
    
    // Throttle event logging
    const now = Date.now();
    if (now - lastEventTime < THROTTLE_MS) return result;
    lastEventTime = now;
    
    try {
      const event = arguments[0];
      
      // Only log important events
      if (typeof event === 'object' && event !== null) {
        if (Array.isArray(event) && event[0] === 'consent') {
          addEventToBuffer('Consent Update', 'consent', 
            `${event[1]}: ${JSON.stringify(event[2])}`);
        } else if (event.event && !event.event.startsWith('gtm.')) {
          addEventToBuffer('DataLayer Event', 'gtm', 
            `${event.event}`);
        }
      }
    } catch (e) {
      // Fail silently
    }
    
    return result;
  };
}

// Lightweight gtag interception
function interceptGtag() {
  if (window.gtmConsentInspector.originalGtag) return;
  
  window.gtmConsentInspector.originalGtag = window.gtag;
  
  window.gtag = function() {
    const result = window.gtmConsentInspector.originalGtag.apply(this, arguments);
    
    try {
      const args = Array.from(arguments);
      if (args[0] === 'consent') {
        addEventToBuffer('gtag Consent', 'consent', 
          `${args[1]}: ${JSON.stringify(args[2])}`);
      }
    } catch (e) {
      // Fail silently
    }
    
    return result;
  };
}

// Buffered event logging for performance
function addEventToBuffer(type, category, details) {
  eventBuffer.push({
    timestamp: Date.now(),
    type,
    category,
    details
  });
  
  // Flush buffer periodically
  const now = Date.now();
  if (now - lastBufferFlush > 2000 || eventBuffer.length > 10) {
    flushEventBuffer();
  }
}

// Flush event buffer to main storage
function flushEventBuffer() {
  if (eventBuffer.length === 0) return;
  
  if (!window.gtmConsentInspector.events) {
    window.gtmConsentInspector.events = [];
  }
  
  // Add buffered events
  window.gtmConsentInspector.events.push(...eventBuffer);
  
  // Maintain size limit
  if (window.gtmConsentInspector.events.length > window.gtmConsentInspector.maxEvents) {
    window.gtmConsentInspector.events = window.gtmConsentInspector.events.slice(-30);
  }
  
  // Clear buffer
  eventBuffer = [];
  lastBufferFlush = Date.now();
}

// Setup message handlers
function setupMessageHandlers() {
  // Register message handlers efficiently
  messageHandlers.set('checkGTM', handleCheckGTM);
  messageHandlers.set('applyConsent', handleApplyConsent);
  messageHandlers.set('getEventLog', handleGetEventLog);
  messageHandlers.set('clearEventLog', handleClearEventLog);
  messageHandlers.set('toggleOverlay', handleToggleOverlay);
  messageHandlers.set('getTagStatus', handleGetTagStatus);
  
  // Single message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handler = messageHandlers.get(request.action);
    
    if (handler) {
      try {
        const result = handler(request.data || {});
        sendResponse(result);
      } catch (error) {
        console.error(`Error handling ${request.action}:`, error);
        sendResponse({ error: error.message });
      }
    } else {
      sendResponse({ error: 'Unknown action' });
    }
    
    return true; // Keep message channel open
  });
}

// Message handlers
function handleCheckGTM() {
  flushEventBuffer(); // Ensure recent events are included
  
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
    tags: getBasicTagInfo(),
    events: getRecentEvents()
  };
}

function handleApplyConsent(settings) {
  if (!window.gtag && !window.dataLayer) {
    return { success: false, error: 'No consent mechanism available' };
  }
  
  try {
    if (window.gtag) {
      window.gtag('consent', 'update', settings);
    } else if (window.dataLayer) {
      window.dataLayer.push(['consent', 'update', settings]);
    }
    
    addEventToBuffer('Consent Applied', 'consent', 
      `Settings: ${JSON.stringify(settings)}`);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function handleGetEventLog() {
  flushEventBuffer();
  return getRecentEvents();
}

function handleClearEventLog() {
  if (window.gtmConsentInspector) {
    window.gtmConsentInspector.events = [];
    eventBuffer = [];
    addEventToBuffer('Log Cleared', 'system', 'Event log cleared by user');
  }
  return { success: true };
}

function handleToggleOverlay() {
  return toggleOverlay();
}

function handleGetTagStatus() {
  return getBasicTagInfo();
}

// Utility functions
function getCurrentConsentState() {
  const defaultState = {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'granted',
    security_storage: 'granted'
  };
  
  if (!window.dataLayer) return defaultState;
  
  // Find most recent consent setting efficiently
  for (let i = window.dataLayer.length - 1; i >= 0; i--) {
    const item = window.dataLayer[i];
    if (Array.isArray(item) && item[0] === 'consent' && 
        (item[1] === 'default' || item[1] === 'update') && item[2]) {
      return { ...defaultState, ...item[2] };
    }
  }
  
  return defaultState;
}

function getBasicTagInfo() {
  const tags = [];
  const consentState = getCurrentConsentState();
  
  // Quick detection of common tags
  const commonTags = [
    {
      check: () => window.gtag || document.querySelector('script[src*="gtag/js"]'),
      name: 'Google Analytics 4',
      type: 'analytics',
      consentType: 'analytics_storage'
    },
    {
      check: () => window.ga || document.querySelector('script[src*="google-analytics.com/analytics.js"]'),
      name: 'Universal Analytics',
      type: 'analytics',
      consentType: 'analytics_storage'
    },
    {
      check: () => document.querySelector('script[src*="googleadservices.com"]') || window.gtag,
      name: 'Google Ads',
      type: 'advertising',
      consentType: 'ad_storage'
    },
    {
      check: () => window.fbq || document.querySelector('script[src*="connect.facebook.net"]'),
      name: 'Facebook Pixel',
      type: 'advertising',
      consentType: 'ad_storage'
    },
    {
      check: () => window.hj || document.querySelector('script[src*="hotjar.com"]'),
      name: 'Hotjar',
      type: 'personalization',
      consentType: 'functionality_storage'
    }
  ];
  
  commonTags.forEach((tagDef, index) => {
    if (tagDef.check()) {
      const isAllowed = consentState[tagDef.consentType] === 'granted';
      
      tags.push({
        id: `tag_${index}`,
        name: tagDef.name,
        type: tagDef.type,
        allowed: isAllowed,
        reason: isAllowed ? 
          `${tagDef.consentType} granted` : 
          `${tagDef.consentType} denied`,
        wouldFireWith: isAllowed ? '' : tagDef.consentType
      });
    }
  });
  
  return tags;
}

function getRecentEvents() {
  flushEventBuffer();
  
  if (!window.gtmConsentInspector || !window.gtmConsentInspector.events) {
    return [];
  }
  
  return window.gtmConsentInspector.events.slice(-20); // Last 20 events only
}

function toggleOverlay() {
  let overlay = document.getElementById('gtm-consent-inspector-overlay');
  
  if (overlay) {
    overlay.remove();
    return { success: true, action: 'removed' };
  }
  
  // Create minimal overlay
  overlay = document.createElement('div');
  overlay.id = 'gtm-consent-inspector-overlay';
  overlay.innerHTML = `
    <div style="position: fixed; top: 10px; right: 10px; width: 320px; 
                background: white; border: 1px solid #ddd; border-radius: 6px; 
                padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
                z-index: 9999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px; line-height: 1.4;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 16px; color: #202124;">🔍 GTM Inspector</h3>
        <button onclick="this.closest('#gtm-consent-inspector-overlay').remove()" 
                style="background: none; border: none; font-size: 18px; color: #5f6368; cursor: pointer;">×</button>
      </div>
      <div style="margin-bottom: 12px;">
        <strong>Status:</strong> ${window.google_tag_manager ? '✅ GTM Active' : '❌ No GTM'}
      </div>
      <div style="margin-bottom: 12px;">
        <strong>Consent Mode:</strong> ${window.gtag ? '✅ Active' : '❌ Not Found'}
      </div>
      <div style="font-size: 11px; color: #5f6368; text-align: center;">
        Use browser extension popup for full controls
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  return { success: true, action: 'created' };
}

// Initialize when DOM is ready or immediately if already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeInspector);
} else {
  // Delay initialization slightly to avoid blocking page load
  setTimeout(initializeInspector, 100);
}

// Export to global scope for debugging
window.ConsentInspector = {
  getStatus: () => handleCheckGTM(),
  applyConsent: (settings) => handleApplyConsent(settings),
  showOverlay: () => handleToggleOverlay(),
  getEvents: () => getRecentEvents()
};

console.log('🔍 GTM Consent Inspector: Content script loaded');