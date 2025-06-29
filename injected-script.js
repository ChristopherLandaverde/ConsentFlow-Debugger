// injected-script.js - Enhanced with consent persistence
console.log('🔍 GTM Inspector: Injected script loading in page context...');

// Create ConsentInspector in the REAL page context
window.ConsentInspector = {
  // Store our override state
  _overrideActive: false,
  _overrideState: null,
  _originalGtag: null,
  _originalDataLayerPush: null,
  
  // Detection methods
  detectGTM: function() {
    console.log('🔍 Running GTM detection...');
    
    const hasGTM = !!window.google_tag_manager;
    let gtmId = '';
    
    if (hasGTM) {
      gtmId = Object.keys(window.google_tag_manager).find(key => key.startsWith('GTM-')) || '';
    }
    
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
      overrideActive: this._overrideActive,
      timestamp: Date.now()
    };
  },
  
  detectConsentMode: function() {
    if (window.gtag) return true;
    
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      return window.dataLayer.some(item => 
        Array.isArray(item) && item[0] === 'consent'
      );
    }
    
    return false;
  },
  
  getCurrentConsentState: function() {
    // If we have an active override, return our override state
    if (this._overrideActive && this._overrideState) {
      console.log('🎯 Returning override consent state:', this._overrideState);
      return this._overrideState;
    }
    
    // Otherwise, read the actual page state
    console.log('🔍 Reading actual page consent state...');
    
    let consentFromDataLayer = null;
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      for (let i = window.dataLayer.length - 1; i >= 0; i--) {
        const item = window.dataLayer[i];
        if (Array.isArray(item) && item[0] === 'consent' && 
            (item[1] === 'default' || item[1] === 'update') && item[2]) {
          consentFromDataLayer = item[2];
          console.log('🎯 Found consent in dataLayer:', item);
          break;
        }
      }
    }
    
    const finalState = consentFromDataLayer || {
      analytics_storage: this.detectConsentMode() ? 'denied' : 'granted',
      ad_storage: this.detectConsentMode() ? 'denied' : 'granted', 
      functionality_storage: 'granted',
      personalization_storage: this.detectConsentMode() ? 'denied' : 'granted',
      security_storage: 'granted'
    };
    
    console.log('🎯 Final consent state:', finalState);
    return finalState;
  },
  
  // ENHANCED: Consent override with persistence
  updateConsent: function(settings) {
    console.log('🔧 Updating consent with OVERRIDE:', settings);
    
    // Store our override state
    this._overrideState = { ...settings };
    this._overrideActive = true;
    
    // Set up monitoring to maintain our override
    this._maintainConsentOverride();
    
    let success = false;
    let method = '';
    
    // Apply the consent using available methods
    if (window.gtag && typeof window.gtag === 'function') {
      try {
        console.log('🔧 Applying via gtag...');
        window.gtag('consent', 'update', settings);
        success = true;
        method = 'gtag';
      } catch (e) {
        console.error('❌ gtag failed:', e);
      }
    }
    
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      try {
        console.log('🔧 Applying via dataLayer...');
        window.dataLayer.push(['consent', 'update', settings]);
        success = true;
        method = method ? method + '+dataLayer' : 'dataLayer';
      } catch (e) {
        console.error('❌ dataLayer failed:', e);
      }
    }
    
    // Force trigger event
    if (success && window.dataLayer) {
      try {
        window.dataLayer.push({
          'event': 'gtm_consent_inspector_override',
          'consent_settings': settings
        });
      } catch (e) {
        console.log('⚠️ Could not trigger event:', e);
      }
    }
    
    if (success) {
      console.log(`✅ Consent override activated via ${method}`);
      return { success: true, method: method, override: true };
    } else {
      this._overrideActive = false;
      this._overrideState = null;
      return { success: false, error: 'No consent mechanism available' };
    }
  },
  
  // NEW: Maintain consent override against site changes
  _maintainConsentOverride: function() {
    if (this._overrideActive) {
      console.log('🛡️ Setting up consent override protection...');
      
      // Re-apply our override every 2 seconds
      const overrideInterval = setInterval(() => {
        if (!this._overrideActive) {
          clearInterval(overrideInterval);
          return;
        }
        
        console.log('🔄 Re-applying consent override...');
        
        if (window.gtag) {
          window.gtag('consent', 'update', this._overrideState);
        }
        if (window.dataLayer) {
          window.dataLayer.push(['consent', 'update', this._overrideState]);
        }
      }, 2000);
      
      // Stop override after 30 seconds
      setTimeout(() => {
        console.log('⏰ Consent override timeout - stopping protection');
        this._overrideActive = false;
        clearInterval(overrideInterval);
      }, 30000);
    }
  },
  
  // NEW: Stop consent override
  stopOverride: function() {
    console.log('🛑 Stopping consent override');
    this._overrideActive = false;
    this._overrideState = null;
    return { success: true, message: 'Override stopped' };
  },
  
  // Enhanced tag detection
  getTagInfo: function() {
    const tags = [];
    const consentState = this.getCurrentConsentState();
    
    console.log('🔍 Analyzing tags with consent state:', consentState);
    
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
        check: () => document.querySelector('script[src*="googleadservices.com"]') || 
                     document.querySelector('script[src*="googlesyndication.com"]'),
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
          consentType: tagDef.consentType,
          overridden: this._overrideActive
        });
      }
    });
    
    return tags;
  },
  
  // Helper methods
  status: function() {
    const result = this.detectGTM();
    console.table({
      'GTM Detected': result.hasGTM,
      'GTM ID': result.gtmId || 'None',
      'Consent Mode': result.hasConsentMode,
      'Override Active': this._overrideActive,
      'Analytics Storage': result.consentState.analytics_storage,
      'Ad Storage': result.consentState.ad_storage
    });
    return result;
  },
  
  allowAll: function() {
    console.log('🎯 ConsentInspector.allowAll() called');
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

window.ConsentInspector.getEvents = function() {
  return this._events.slice(-20);
};

// Enhanced dataLayer monitoring
if (window.dataLayer && Array.isArray(window.dataLayer)) {
  const originalPush = window.dataLayer.push;
  
  window.dataLayer.push = function() {
    const result = originalPush.apply(this, arguments);
    
    try {
      const event = arguments[0];
      
      if (typeof event === 'object' && event !== null) {
        if (Array.isArray(event) && event[0] === 'consent') {
          // Log all consent changes
          window.ConsentInspector._events.push({
            timestamp: Date.now(),
            type: 'Consent Update',
            category: 'consent',
            details: `${event[1]}: ${JSON.stringify(event[2])}`
          });
          
          // If site is trying to override our override, re-apply ours
          if (window.ConsentInspector._overrideActive && event[1] === 'update') {
            console.log('🛡️ Site tried to override our consent - re-applying override in 100ms');
            setTimeout(() => {
              if (window.ConsentInspector._overrideActive) {
                originalPush.call(this, ['consent', 'update', window.ConsentInspector._overrideState]);
              }
            }, 100);
          }
        } else if (event.event && !event.event.startsWith('gtm.')) {
          window.ConsentInspector._events.push({
            timestamp: Date.now(),
            type: 'DataLayer Event',
            category: 'gtm',
            details: event.event
          });
        }
      }
      
      if (window.ConsentInspector._events.length > window.ConsentInspector._maxEvents) {
        window.ConsentInspector._events = window.ConsentInspector._events.slice(-30);
      }
    } catch (e) {
      // Fail silently
    }
    
    return result;
  };
}

// Listen for messages from content script
window.addEventListener('message', function(event) {
  if (event.data.source === 'gtm-inspector-content') {
    const { action, data, id } = event.data;
    let response = null;
    
    try {
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
        case 'stopOverride':
          response = window.ConsentInspector.stopOverride();
          break;
        default:
          response = { error: 'Unknown action: ' + action };
      }
    } catch (error) {
      response = { error: error.message };
    }
    
    window.postMessage({
      source: 'gtm-inspector-page-response',
      id: id,
      data: response
    }, '*');
  }
});

console.log('✅ GTM Inspector: ConsentInspector created with override protection!');
console.log('💡 Try: ConsentInspector.allowAll() - it will maintain the override');

// Initial detection
setTimeout(() => {
  try {
    const result = window.ConsentInspector.detectGTM();
    if (result.hasGTM) {
      console.log(`🎯 GTM Found: ${result.gtmId}`);
      console.log('📊 Initial consent state:', result.consentState);
      
      if (result.consentState.analytics_storage === 'denied') {
        console.log('⚠️ Site has consent denied by default - use ConsentInspector.allowAll() to override');
      }
    }
  } catch (error) {
    console.error('❌ Error in initial GTM detection:', error);
  }
}, 1000);