console.log('=== GTM CONSENT MODE INSPECTOR LOADING ===');

// Enhanced GTM Detection with Tag Discovery
function detectGTM() {
  let gtmId = null;
  let hasGTM = false;
  let tags = [];
  
  // Method 1: Check google_tag_manager
  if (window.google_tag_manager) {
    for (const key in window.google_tag_manager) {
      if (key.startsWith('GTM-')) {
        gtmId = key;
        hasGTM = true;
        
        // Try to extract tag information
        const container = window.google_tag_manager[key];
        if (container && container.gtm) {
          tags = extractTagsFromContainer(container);
        }
        break;
      }
    }
  }
  
  // Method 2: Check scripts
  if (!hasGTM) {
    const scripts = document.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]');
    if (scripts.length > 0) {
      const src = scripts[0].src;
      const match = src.match(/[?&]id=([^&]+)/);
      if (match && match[1].startsWith('GTM-')) {
        gtmId = match[1];
        hasGTM = true;
      }
    }
  }
  
  // Method 3: Look for common tracking tags in DOM
  if (hasGTM || tags.length === 0) {
    tags = tags.concat(detectCommonTags());
  }
  
  console.log('[GTM Detection] Result:', { hasGTM, gtmId, tags: tags.length });
  return { hasGTM, gtmId, tags };
}

// Extract tags from GTM container
function extractTagsFromContainer(container) {
  const tags = [];
  
  try {
    // This is a simplified extraction - real GTM containers are complex
    if (container.macro) {
      Object.keys(container.macro).forEach(key => {
        const macro = container.macro[key];
        if (macro && macro[1]) {
          tags.push({
            id: key,
            name: `Macro ${key}`,
            category: 'functionality',
            status: 'unknown',
            type: 'macro'
          });
        }
      });
    }
  } catch (e) {
    console.warn('[GTM] Could not extract container tags:', e);
  }
  
  return tags;
}

// Detect common tracking tags in DOM
function detectCommonTags() {
  const tags = [];
  const consentState = getConsentState();
  
  // Google Analytics 4
  if (window.gtag || document.querySelector('script[src*="gtag/js"]')) {
    tags.push({
      id: 'ga4',
      name: 'Google Analytics 4',
      category: 'analytics',
      status: consentState.analytics_storage === 'granted' ? 'allowed' : 'blocked',
      type: 'tracking'
    });
  }
  
  // Universal Analytics
  if (window.ga || document.querySelector('script[src*="google-analytics.com/analytics.js"]')) {
    tags.push({
      id: 'ua',
      name: 'Universal Analytics',
      category: 'analytics',
      status: consentState.analytics_storage === 'granted' ? 'allowed' : 'blocked',
      type: 'tracking'
    });
  }
  
  // Google Ads
  if (document.querySelector('script[src*="googleadservices.com"]') || window.gtag) {
    tags.push({
      id: 'gads',
      name: 'Google Ads Conversion',
      category: 'advertising',
      status: consentState.ad_storage === 'granted' ? 'allowed' : 'blocked',
      type: 'conversion'
    });
  }
  
  // Facebook Pixel
  if (window.fbq || document.querySelector('script[src*="connect.facebook.net"]')) {
    tags.push({
      id: 'fbpixel',
      name: 'Facebook Pixel',
      category: 'advertising',
      status: consentState.ad_storage === 'granted' ? 'allowed' : 'blocked',
      type: 'tracking'
    });
  }
  
  // Hotjar
  if (window.hj || document.querySelector('script[src*="hotjar.com"]')) {
    tags.push({
      id: 'hotjar',
      name: 'Hotjar',
      category: 'personalization',
      status: consentState.functionality_storage === 'granted' ? 'allowed' : 'blocked',
      type: 'heatmap'
    });
  }
  
  // LinkedIn Insight
  if (window._linkedin_partner_id || document.querySelector('script[src*="snap.licdn.com"]')) {
    tags.push({
      id: 'linkedin',
      name: 'LinkedIn Insight',
      category: 'advertising',
      status: consentState.ad_storage === 'granted' ? 'allowed' : 'blocked',
      type: 'tracking'
    });
  }
  
  return tags;
}

// Get consent status for specific storage type
function getConsentStatus(storageType) {
  const consentState = getConsentState();
  return consentState[storageType] || 'granted';
}

// Properly detect if consent mode is actually configured
function detectConsentMode() {
  // Check if there are any consent commands in dataLayer
  if (window.dataLayer) {
    for (let i = 0; i < window.dataLayer.length; i++) {
      const item = window.dataLayer[i];
      if (Array.isArray(item) && item[0] === 'consent') {
        return true;
      }
      // Also check for gtag consent calls
      if (typeof item === 'object' && item.event === 'gtag.consent') {
        return true;
      }
    }
  }
  
  // Check if gtag has been called with consent
  if (window.gtag) {
    // This is harder to detect retroactively, but we can check if
    // the page has consent-related scripts or configurations
    const scripts = document.querySelectorAll('script');
    for (let script of scripts) {
      if (script.textContent && script.textContent.includes('consent')) {
        return true;
      }
    }
  }
  
  return false;
}

// Enhanced consent state detection
function getConsentState() {
  const defaultState = {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    functionality_storage: 'granted',
    personalization_storage: 'granted',
    security_storage: 'granted'
  };
  
  if (!window.dataLayer) return defaultState;
  
  // Look for consent in dataLayer (most recent wins)
  let consentState = { ...defaultState };
  
  for (let i = 0; i < window.dataLayer.length; i++) {
    const item = window.dataLayer[i];
    if (Array.isArray(item) && item[0] === 'consent' && (item[1] === 'default' || item[1] === 'update')) {
      const consentUpdate = item[2] || {};
      consentState = { ...consentState, ...consentUpdate };
    }
  }
  
  return consentState;
}

// Enhanced consent application with tag status refresh
async function applyConsent(settings) {
  console.log('[Consent] Applying:', settings);
  
  // Wait for gtag if needed
  let gtagReady = false;
  if (typeof window.gtag === 'function') {
    gtagReady = true;
  } else {
    // Wait up to 5 seconds for gtag
    for (let i = 0; i < 50; i++) {
      if (typeof window.gtag === 'function') {
        gtagReady = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Try gtag first
  if (gtagReady) {
    try {
      window.gtag('consent', 'update', settings);
      console.log('[Consent] ✅ Applied via gtag');
      logEvent('Consent Update', 'consent', `Applied via gtag: ${JSON.stringify(settings)}`);
      
      // Trigger tag status refresh
      setTimeout(() => {
        logEvent('Tag Status Refresh', 'system', 'Refreshing tag statuses after consent change');
      }, 500);
      
      return true;
    } catch (e) {
      console.error('[Consent] gtag error:', e);
    }
  }
  
  // Fallback to dataLayer
  if (window.dataLayer) {
    try {
      window.dataLayer.push(['consent', 'update', settings]);
      console.log('[Consent] ✅ Applied via dataLayer');
      logEvent('Consent Update', 'consent', `Applied via dataLayer: ${JSON.stringify(settings)}`);
      
      // Trigger tag status refresh
      setTimeout(() => {
        logEvent('Tag Status Refresh', 'system', 'Refreshing tag statuses after consent change');
      }, 500);
      
      return true;
    } catch (e) {
      console.error('[Consent] dataLayer error:', e);
    }
  }
  
  console.error('[Consent] ❌ No method available');
  return false;
}

// Enhanced event storage and monitoring
let eventLog = [];
let originalDataLayerPush = null;

function logEvent(type, category, details) {
  const event = {
    timestamp: Date.now(),
    type,
    category,
    details
  };
  eventLog.push(event);
  console.log(`[Event] ${type}: ${details}`);
  
  // Keep only last 100 events to prevent memory issues
  if (eventLog.length > 100) {
    eventLog = eventLog.slice(-100);
  }
}

// Monitor dataLayer for real-time events
function setupDataLayerMonitoring() {
  if (!window.dataLayer) {
    window.dataLayer = [];
  }
  
  // Intercept dataLayer.push to log events
  if (!originalDataLayerPush) {
    originalDataLayerPush = window.dataLayer.push;
    window.dataLayer.push = function(...args) {
      // Log the event
      args.forEach(event => {
        if (typeof event === 'object' && event !== null) {
          if (Array.isArray(event)) {
            logEvent('DataLayer Push', 'gtm', `${event[0]} - ${JSON.stringify(event.slice(1))}`);
          } else {
            logEvent('DataLayer Push', 'gtm', `${event.event || 'Object'} - ${JSON.stringify(event)}`);
          }
        }
      });
      
      // Call original method
      return originalDataLayerPush.apply(this, args);
    };
  }
}

// Overlay functionality
function createOverlay() {
  // Remove existing overlay
  const existing = document.getElementById('gtm-consent-inspector-overlay');
  if (existing) {
    existing.remove();
    return;
  }
  
  const gtmInfo = detectGTM();
  const consentState = getConsentState();
  
  const overlay = document.createElement('div');
  overlay.id = 'gtm-consent-inspector-overlay';
  overlay.innerHTML = `
    <div class="header-container">
      <h2>🔍 GTM Inspector</h2>
      <button class="close-button" onclick="this.closest('#gtm-consent-inspector-overlay').remove()">×</button>
    </div>
    
    <div class="inspector-section">
      <h3>📊 GTM Status</h3>
      <div class="tag-item ${gtmInfo.hasGTM ? 'tag-analytics' : 'tag-other'}">
        <strong>Container:</strong> ${gtmInfo.hasGTM ? gtmInfo.gtmId : 'Not Found'}
        <span class="tag-status ${gtmInfo.hasGTM ? 'allowed' : 'blocked'}">${gtmInfo.hasGTM ? 'Active' : 'Missing'}</span>
      </div>
    </div>
    
    <div class="inspector-section">
      <h3>🏷️ Detected Tags (${gtmInfo.tags.length})</h3>
      ${gtmInfo.tags.map(tag => `
        <div class="tag-item tag-${tag.category}">
          <strong>${tag.name}</strong>
          <span class="tag-status ${tag.status}">${tag.status}</span>
        </div>
      `).join('') || '<div class="empty-state">No tags detected</div>'}
    </div>
    
    <div class="inspector-section">
      <h3>🍪 Consent Status</h3>
      ${Object.entries(consentState).map(([key, value]) => `
        <div class="consent-status-item">
          <span class="consent-status-name">${key.replace('_', ' ')}</span>
          <span class="consent-${value}">${value}</span>
        </div>
      `).join('')}
    </div>
    
    <div class="button-container">
      <button class="inspector-button" onclick="this.closest('#gtm-consent-inspector-overlay').remove()">Close</button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  logEvent('Overlay Opened', 'ui', 'Inspector overlay displayed');
}

// Set up message listener
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('📨 MESSAGE RECEIVED:', request);
  
  switch (request.action) {
    case 'checkGTM':
      try {
        const gtmInfo = detectGTM();
        const consentState = getConsentState();
        
        sendResponse({
          hasGTM: gtmInfo.hasGTM,
          gtmId: gtmInfo.gtmId,
          hasConsentMode: detectConsentMode(),
          consentState: consentState,
          events: eventLog,
          tags: gtmInfo.tags
        });
      } catch (error) {
        console.error('[GTM Check] Error:', error);
        sendResponse({ error: error.message });
      }
      break;
      
    case 'applyConsent':
      applyConsent(request.settings).then(result => {
        sendResponse(result);
      }).catch(error => {
        console.error('[Apply Consent] Error:', error);
        sendResponse(false);
      });
      return true;
      
    case 'getEventLog':
      sendResponse(eventLog);
      break;
      
    case 'clearEventLog':
      eventLog = [];
      logEvent('Event Log Cleared', 'ui', 'All events cleared');
      sendResponse(true);
      break;
      
    case 'toggleOverlay':
      createOverlay();
      sendResponse(true);
      break;
      
    default:
      console.warn('[Message] Unknown action:', request.action);
      sendResponse({ error: 'Unknown action' });
  }
  
  return true;
});

// Create ConsentInspector object
window.ConsentInspector = {
  getStatus: function() {
    try {
      const gtmInfo = detectGTM();
      return {
        initialized: true,
        gtmDetected: gtmInfo.hasGTM,
        gtmId: gtmInfo.gtmId,
        consentMode: detectConsentMode(),
        eventCount: eventLog.length,
        tagCount: gtmInfo.tags.length
      };
    } catch (error) {
      console.error('[ConsentInspector] Status error:', error);
      return {
        initialized: false,
        error: error.message
      };
    }
  },
  
  simulateConsent: function(settings) {
    applyConsent(settings);
    return true;
  },
  
  getConsentState: getConsentState,
  getEventLog: () => eventLog,
  clearEventLog: () => { eventLog = []; return true; },
  getTags: () => detectGTM().tags,
  showOverlay: createOverlay
};

// Initialize monitoring
setupDataLayerMonitoring();

// Log initialization complete
logEvent('Extension Initialized', 'system', 'Enhanced content script with monitoring ready');

console.log('=== GTM CONSENT MODE INSPECTOR READY ===');
console.log('GTM Detection:', detectGTM());
console.log('ConsentInspector available:', !!window.ConsentInspector);