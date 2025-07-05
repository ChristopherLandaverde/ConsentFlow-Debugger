// injected-script.js - Enhanced with consent persistence
console.log('🔍 GTM Inspector: Injected script loading in page context...');

// Create ConsentInspector in the REAL page context
window.ConsentInspector = {
  // Store our override state
  _overrideActive: false,
  _overrideState: null,
  _originalGtag: null,
  _originalDataLayerPush: null,
  
  // IAB TCF Framework detection
  detectIABTCF: function() {
    console.log('🔍 Detecting IAB TCF Framework...');
    
    const tcfInfo = {
      version: null,
      consentString: null,
      vendorConsents: {},
      purposeConsents: {},
      cmpId: null,
      cmpVersion: null,
      gdprApplies: false,
      detected: false
    };
    
    // Check for TCF v2.2 (most common) - prioritize this
    if (window.__tcfapi) {
      console.log('🎯 TCF v2.2 API detected');
      tcfInfo.version = '2.2';
      tcfInfo.detected = true;
      
      // Try to get current consent info
      try {
        window.__tcfapi('getTCData', 2, (tcData, success) => {
          if (success && tcData) {
            tcfInfo.consentString = tcData.tcString;
            tcfInfo.cmpId = tcData.cmpId;
            tcfInfo.cmpVersion = tcData.cmpVersion;
            tcfInfo.gdprApplies = tcData.gdprApplies;
            
            if (tcData.purpose && tcData.purpose.consents) {
              tcfInfo.purposeConsents = tcData.purpose.consents;
            }
            
            if (tcData.vendor && tcData.vendor.consents) {
              tcfInfo.vendorConsents = tcData.vendor.consents;
            }
          }
        });
        console.log('✅ TCF v2.2 data retrieved');
      } catch (e) {
        console.log('⚠️ Error getting TCF v2.2 data:', e);
      }
    }
    // Only check v1.1 if v2.2 is not present
    else if (window.__cmp) {
      console.log('🎯 TCF v1.1 API detected');
      tcfInfo.version = '1.1';
      tcfInfo.detected = true;
      
      // Try to get consent string
      try {
        window.__cmp('getConsentData', null, (consentData) => {
          if (consentData && consentData.consentData) {
            tcfInfo.consentString = consentData.consentData;
            tcfInfo.gdprApplies = consentData.gdprApplies;
          }
        });
      } catch (e) {
        console.log('⚠️ Error getting TCF v1.1 data:', e);
      }
    }
    
    // Check for common CMP implementations
    const cmpDetection = this.detectCMP();
    if (cmpDetection.detected && !tcfInfo.cmpId) {
      tcfInfo.cmpId = cmpDetection.cmpId;
      tcfInfo.cmpVersion = cmpDetection.version;
    }
    
    // Check for consent string in cookies
    if (!tcfInfo.consentString) {
      const consentCookie = this.findConsentCookie();
      if (consentCookie) {
        tcfInfo.consentString = consentCookie;
      }
    }
    
    console.log('🎯 IAB TCF detection result:', tcfInfo);
    return tcfInfo;
  },
  
  // Enhanced CMP detection
  detectCMP: function() {
    console.log('🔍 Detecting Consent Management Platform...');
    
    const cmps = [
      {
        name: 'OneTrust',
        check: () => window.OneTrust || document.querySelector('[data-domain-script*="cdn.cookielaw.org"]'),
        version: () => window.OneTrust ? window.OneTrust.version : null,
        cmpId: 5
      },
      {
        name: 'Cookiebot',
        check: () => window.Cookiebot || document.querySelector('[data-cookieconsent]'),
        version: () => window.Cookiebot ? window.Cookiebot.version : null,
        cmpId: 14
      },
      {
        name: 'TrustArc',
        check: () => window.truste || document.querySelector('[data-truste]'),
        version: () => window.truste ? window.truste.version : null,
        cmpId: 21
      },
      {
        name: 'Quantcast',
        check: () => window.__tcfapi || document.querySelector('[data-quantcast]'),
        version: () => null,
        cmpId: 22
      },
      {
        name: 'Sourcepoint',
        check: () => window.__spapi || document.querySelector('[data-sp-cc]'),
        version: () => null,
        cmpId: 24
      },
      {
        name: 'Didomi',
        check: () => window.didomi || document.querySelector('[data-didomi]'),
        version: () => window.didomi ? window.didomi.version : null,
        cmpId: 7
      },
      {
        name: 'Usercentrics',
        check: () => window.UC_UI || document.querySelector('[data-usercentrics]'),
        version: () => null,
        cmpId: 11
      },
      {
        name: 'Ebay',
        check: () => window.ebay || document.querySelector('[data-ebay-consent]'),
        version: () => null,
        cmpId: 28
      }
    ];
    
    // Check each CMP and return the first one found
    for (const cmp of cmps) {
      if (cmp.check()) {
        console.log(`🎯 CMP detected: ${cmp.name}`);
        return {
          detected: true,
          name: cmp.name,
          version: cmp.version(),
          cmpId: cmp.cmpId
        };
      }
    }
    
    console.log('❌ No known CMP detected');
    return {
      detected: false,
      name: null,
      version: null,
      cmpId: null
    };
  },
  
  // Find consent cookie
  findConsentCookie: function() {
    const consentCookies = [
      'euconsent',
      'euconsent-v2',
      'consent-string',
      'tcf_consent',
      'gdpr_consent',
      'cookieconsent_status',
      'OptanonAlertBoxClosed',
      'CookieConsent'
    ];
    
    for (const cookieName of consentCookies) {
      const cookie = this.getCookie(cookieName);
      if (cookie) {
        console.log(`🎯 Found consent cookie: ${cookieName}`);
        return cookie;
      }
    }
    
    return null;
  },
  
  // Helper to get cookie value
  getCookie: function(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  },
  
  // Parse TCF consent string
  parseTCFConsentString: function(consentString) {
    if (!consentString || typeof consentString !== 'string') {
      console.log('⚠️ Invalid consent string provided:', consentString);
      return null;
    }
    
    try {
      // Basic TCF v2 consent string parsing
      // Format: Base64 encoded string with specific structure
      const decoded = atob(consentString);
      
      // This is a simplified parser - full TCF parsing is complex
      return {
        raw: consentString,
        decoded: decoded,
        length: consentString.length,
        version: this.extractTCFVersion(decoded)
      };
    } catch (e) {
      console.log('⚠️ Error parsing TCF consent string:', e);
      return null;
    }
  },
  
  // Extract TCF version from consent string
  extractTCFVersion: function(decoded) {
    // Simplified version extraction
    // In practice, this would parse the binary structure
    return '2.2'; // Default assumption
  },
  
  // Detection methods
  detectGTM: function() {
    console.log('🔍 Running GTM detection...');
    
    const containers = [];
    
    // Method 1: Check window.google_tag_manager for all containers
    if (window.google_tag_manager) {
      const gtmKeys = Object.keys(window.google_tag_manager);
      gtmKeys.forEach(key => {
        if (key.startsWith('GTM-')) {
          const container = window.google_tag_manager[key];
          const dataLayer = (container.dataLayer && Array.isArray(container.dataLayer)) ? container.dataLayer : [];
          
          containers.push({
            id: key,
            method: 'window.google_tag_manager',
            dataLayer: dataLayer.length, // Just send the count, not the actual array
            hasConsentMode: this.detectConsentModeForContainer(key)
          });
        }
      });
    }
    
    // Method 2: Check all GTM script tags
    const gtmScripts = document.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]');
    gtmScripts.forEach(script => {
      const src = script.src;
      const match = src.match(/[?&]id=([^&]+)/);
      if (match && match[1].startsWith('GTM-')) {
        const containerId = match[1];
        
        // Check if we already found this container
        const existing = containers.find(c => c.id === containerId);
        if (!existing) {
          containers.push({
            id: containerId,
            method: 'script_tag',
            dataLayer: (window.dataLayer && Array.isArray(window.dataLayer)) ? window.dataLayer.length : 0,
            hasConsentMode: this.detectConsentModeForContainer(containerId)
          });
        }
      }
    });
    
    // Method 3: Check for gtag configurations (GA4)
    if (window.gtag && typeof window.gtag === 'function') {
      // Look for gtag config calls that might indicate additional containers
      const gtagConfigs = this.findGtagConfigs();
      gtagConfigs.forEach(config => {
        if (config.startsWith('GTM-') && !containers.find(c => c.id === config)) {
          containers.push({
            id: config,
            method: 'gtag_config',
            dataLayer: (window.dataLayer && Array.isArray(window.dataLayer)) ? window.dataLayer.length : 0,
            hasConsentMode: this.detectConsentModeForContainer(config)
          });
        }
      });
    }
    
    // Get overall consent state (from primary container or global)
    const primaryContainer = containers[0] || null;
    const overallConsentState = this.getCurrentConsentState();
    
    // Enhanced with IAB TCF detection
    const tcfInfo = this.detectIABTCF();
    const cmpInfo = this.detectCMP();
    
    return {
      hasGTM: containers.length > 0,
      containers: containers,
      primaryContainer: primaryContainer,
      gtmId: primaryContainer ? primaryContainer.id : '', // Backward compatibility
      hasConsentMode: this.detectConsentMode(),
      consentState: overallConsentState,
      overrideActive: this._overrideActive,
      timestamp: Date.now(),
      // NEW: IAB TCF information
      tcfInfo: tcfInfo,
      cmpInfo: cmpInfo
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
  
  // NEW: Detect consent mode for a specific container
  detectConsentModeForContainer: function(containerId) {
    // Check if this specific container has consent mode
    if (window.google_tag_manager && window.google_tag_manager[containerId]) {
      const container = window.google_tag_manager[containerId];
      if (container.dataLayer && Array.isArray(container.dataLayer)) {
        return container.dataLayer.some(item => 
          Array.isArray(item) && item[0] === 'consent'
        );
      }
    }
    
    // Fallback to global detection
    return this.detectConsentMode();
  },
  
  // NEW: Find gtag configurations
  findGtagConfigs: function() {
    const configs = [];
    
    // Look for gtag config calls in the page
    if (window.gtag && typeof window.gtag === 'function') {
      // We can't directly inspect gtag calls, but we can look for common patterns
      // This is a simplified approach - in practice, you might need to monitor gtag calls
      try {
        // Check if there are any GTM IDs in the page source
        const pageSource = document.documentElement.outerHTML;
        const gtmMatches = pageSource.match(/GTM-[A-Z0-9]+/g);
        if (gtmMatches) {
          configs.push(...gtmMatches);
        }
      } catch (e) {
        console.log('Could not search page source for GTM configs:', e);
      }
    }
    
    return [...new Set(configs)]; // Remove duplicates
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
        case 'detectIABTCF':
          response = window.ConsentInspector.detectIABTCF();
          break;
        case 'detectCMP':
          response = window.ConsentInspector.detectCMP();
          break;
        case 'parseTCFConsentString':
          response = window.ConsentInspector.parseTCFConsentString(data);
          break;
        default:
          response = { error: 'Unknown action: ' + action };
      }
    } catch (error) {
      response = { error: error.message };
    }
    
    // Create a safe, serializable version of the response
    const safeResponse = (() => {
      try {
        // Try to serialize and deserialize to ensure it's safe
        return JSON.parse(JSON.stringify(response));
      } catch (e) {
        // If serialization fails, create a safe fallback
        console.warn('Response serialization failed, creating safe fallback:', e);
        if (response && typeof response === 'object') {
          const safe = {};
          for (const [key, value] of Object.entries(response)) {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
              safe[key] = value;
            } else if (Array.isArray(value)) {
              safe[key] = value.map(item => 
                (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null) ? item : '[Complex Object]'
              );
            } else if (typeof value === 'object') {
              safe[key] = '[Object]';
            }
          }
          return safe;
        }
        return { error: 'Response could not be serialized' };
      }
    })();
    
    window.postMessage({
      source: 'gtm-inspector-page-response',
      id: id,
      data: safeResponse
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