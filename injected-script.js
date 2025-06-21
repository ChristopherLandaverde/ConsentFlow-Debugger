// injected-script.js - Runs in page context (not isolated)
// This script has access to the actual window object that console can access

console.log('🔍 GTM Inspector: Injected script loading in page context...');

// Create ConsentInspector in the REAL page context
window.ConsentInspector = {
  // Detection methods
  detectGTM: function() {
    console.log('🔍 Running GTM detection...');
    
    const hasGTM = !!window.google_tag_manager;
    let gtmId = '';
    
    if (hasGTM) {
      // Get GTM ID
      gtmId = Object.keys(window.google_tag_manager).find(key => key.startsWith('GTM-')) || '';
    }
    
    // Check for GTM script tags as backup
    if (!gtmId) {
      const gtmScripts = document.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]');
      if (gtmScripts.length > 0) {
        const src = gtmScripts[0].src;
        const match = src.match(/[?&]id=([^&]+)/);
        if (match && match[1].startsWith('GTM-')) {
          gtmId = match[1];
        }
      }
    }
    
    return {
      hasGTM: hasGTM || !!gtmId,
      gtmId: gtmId,
      hasConsentMode: this.detectConsentMode(),
      consentState: this.getCurrentConsentState(),
      timestamp: Date.now()
    };
  },
  
  detectConsentMode: function() {
    // Check for gtag
    if (window.gtag) return true;
    
    // Check dataLayer for consent events
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      return window.dataLayer.some(item => 
        Array.isArray(item) && item[0] === 'consent'
      );
    }
    
    return false;
  },
  
  getCurrentConsentState: function() {
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
          (item[1] === 'default' || item[1] === 'update') && item[2]) {
        return { ...defaultState, ...item[2] };
      }
    }
    
    return defaultState;
  },
  
  // Consent manipulation
  updateConsent: function(settings) {
    console.log('🔧 Updating consent:', settings);
    
    if (window.gtag) {
      window.gtag('consent', 'update', settings);
      return { success: true, method: 'gtag' };
    } else if (window.dataLayer) {
      window.dataLayer.push(['consent', 'update', settings]);
      return { success: true, method: 'dataLayer' };
    }
    
    return { success: false, error: 'No consent mechanism available' };
  },
  
  // Tag detection
  getTagInfo: function() {
    const tags = [];
    const consentState = this.getCurrentConsentState();
    
    const tagChecks = [
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
    
    tagChecks.forEach((tagDef, index) => {
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
  },
  
  // Communication bridge
  sendToContentScript: function(data) {
    window.postMessage({
      source: 'gtm-inspector-page',
      data: data
    }, '*');
  },
  
  // Helper methods for console use
  status: function() {
    const result = this.detectGTM();
    console.table({
      'GTM Detected': result.hasGTM,
      'GTM ID': result.gtmId || 'None',
      'Consent Mode': result.hasConsentMode,
      'Analytics Storage': result.consentState.analytics_storage,
      'Ad Storage': result.consentState.ad_storage
    });
    return result;
  },
  
  allowAll: function() {
    return this.updateConsent({
      analytics_storage: 'granted',
      ad_storage: 'granted',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted'
    });
  },
  
  denyAll: function() {
    return this.updateConsent({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'denied'
    });
  },
  
  analyticsOnly: function() {
    return this.updateConsent({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      functionality_storage: 'granted',
      personalization_storage: 'denied',
      security_storage: 'granted'
    });
  }
};

// Initialize event monitoring
window.ConsentInspector._events = [];
window.ConsentInspector._maxEvents = 50;

// Hook into dataLayer if it exists
if (window.dataLayer && Array.isArray(window.dataLayer)) {
  const originalPush = window.dataLayer.push;
  
  window.dataLayer.push = function() {
    const result = originalPush.apply(this, arguments);
    
    try {
      const event = arguments[0];
      
      if (typeof event === 'object' && event !== null) {
        if (Array.isArray(event) && event[0] === 'consent') {
          window.ConsentInspector._events.push({
            timestamp: Date.now(),
            type: 'Consent Update',
            category: 'consent',
            details: `${event[1]}: ${JSON.stringify(event[2])}`
          });
        } else if (event.event && !event.event.startsWith('gtm.')) {
          window.ConsentInspector._events.push({
            timestamp: Date.now(),
            type: 'DataLayer Event',
            category: 'gtm',
            details: event.event
          });
        }
      }
      
      // Limit events to prevent memory issues
      if (window.ConsentInspector._events.length > window.ConsentInspector._maxEvents) {
        window.ConsentInspector._events = window.ConsentInspector._events.slice(-30);
      }
    } catch (e) {
      // Fail silently
    }
    
    return result;
  };
}

// Hook into gtag if it exists
if (window.gtag) {
  const originalGtag = window.gtag;
  
  window.gtag = function() {
    const result = originalGtag.apply(this, arguments);
    
    try {
      const args = Array.from(arguments);
      if (args[0] === 'consent') {
        window.ConsentInspector._events.push({
          timestamp: Date.now(),
          type: 'gtag Consent',
          category: 'consent',
          details: `${args[1]}: ${JSON.stringify(args[2])}`
        });
      }
    } catch (e) {
      // Fail silently  
    }
    
    return result;
  };
}

// Add method to get events
window.ConsentInspector.getEvents = function() {
  return this._events.slice(-20); // Return last 20 events
};

// Listen for messages from content script
window.addEventListener('message', function(event) {
  if (event.data.source === 'gtm-inspector-content') {
    // Handle requests from content script
    const { action, data, id } = event.data;
    let response = null;
    
    switch (action) {
      case 'detectGTM':
        response = window.ConsentInspector.detectGTM();
        break;
      case 'updateConsent':
        response = window.ConsentInspector.updateConsent(data);
        break;
      case 'getTagInfo':
        response = window.ConsentInspector.getTagInfo();
        break;
      case 'getEvents':
        response = window.ConsentInspector.getEvents();
        break;
    }
    
    // Send response back
    window.postMessage({
      source: 'gtm-inspector-page-response',
      id: id,
      data: response
    }, '*');
  }
});

console.log('✅ GTM Inspector: ConsentInspector created and accessible in console!');
console.log('💡 Try: ConsentInspector.status() or ConsentInspector.allowAll()');

// Run initial detection
setTimeout(() => {
  const result = window.ConsentInspector.detectGTM();
  if (result.hasGTM) {
    console.log(`🎯 GTM Found: ${result.gtmId}`);
  }
}, 1000);