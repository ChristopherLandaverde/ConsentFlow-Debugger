// injected-script.js - FIXED GTM container detection

// Prevent multiple injections
if (window.ConsentInspector) {
  // ConsentInspector already exists, skipping...
} else {
  // Creating ConsentInspector...
  
  // Create ConsentInspector in page context
  window.ConsentInspector = {
    version: 'external-v2-fixed',
    
    detectGTM: function() {
      const result = {
        hasGTM: false,
        gtmId: '',
        containers: [],
        hasConsentMode: false,
        consentState: {},
        detectionMethods: {},
        timestamp: Date.now()
      };
    
      // ... existing GTM detection code ...
    
      // BETTER consent mode detection
      result.hasConsentMode = this.detectConsentMode();
      
      if (result.hasConsentMode) {
        result.consentState = this.getCurrentConsentState();
      } else {
        // No consent mode - all storage granted by default
        result.consentState = {
          analytics_storage: 'granted',
          ad_storage: 'granted', 
          functionality_storage: 'granted',
          personalization_storage: 'granted',
          security_storage: 'granted',
          _noConsentMode: true  // Flag to indicate default state
        };
      }
    
      return result;
    },
    
    detectConsentMode: function() {
      // Method 1: Check for actual consent events in dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        const hasConsentEvents = window.dataLayer.some(item => 
          Array.isArray(item) && item[0] === 'consent' && 
          (item[1] === 'default' || item[1] === 'update')
        );
        if (hasConsentEvents) {
          return true;
        }
      }
      
      // Method 2: Check if gtag with consent is used
      if (window.gtag && typeof window.gtag === 'function') {
        // Look for gtag consent calls in dataLayer
        if (window.dataLayer) {
          const hasGtagConsent = window.dataLayer.some(item =>
            Array.isArray(item) && item[0] === 'consent'
          );
          return hasGtagConsent;
        }
      }
      
      // Method 3: Check for CMP implementations
      if (window.__tcfapi || window.OneTrust || window.Cookiebot) {
        return true;
      }
      
      return false;
    },
    
    detectConsentMode: function() {
      // Check gtag function
      if (window.gtag && typeof window.gtag === 'function') {
        return true;
      }
      
      // Check for consent events in dataLayer
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
      
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        for (let i = window.dataLayer.length - 1; i >= 0; i--) {
          const item = window.dataLayer[i];
          if (Array.isArray(item) && item[0] === 'consent' && 
              (item[1] === 'default' || item[1] === 'update') && item[2]) {
            return { ...defaultState, ...item[2] };
          }
        }
      }
      
      return defaultState;
    },
    
    getTagInfo: function() {
      
      const tags = [];
      const consentState = this.getCurrentConsentState();
      
      // Comprehensive tag detection
      const detectors = [
        {
          name: 'Google Analytics 4',
          type: 'analytics',
          consentType: 'analytics_storage',
          check: () => window.gtag || document.querySelector('script[src*="gtag/js"]') || document.querySelector('script[src*="googletagmanager.com"]')
        },
        {
          name: 'Universal Analytics',
          type: 'analytics',
          consentType: 'analytics_storage',
          check: () => window.ga || document.querySelector('script[src*="google-analytics.com"]')
        },
        {
          name: 'Facebook Pixel',
          type: 'advertising',
          consentType: 'ad_storage',
          check: () => window.fbq || document.querySelector('script[src*="connect.facebook.net"]')
        },
        {
          name: 'Google Ads',
          type: 'advertising',
          consentType: 'ad_storage',
          check: () => document.querySelector('script[src*="googleadservices.com"]') || document.querySelector('script[src*="googlesyndication.com"]')
        },
        {
          name: 'Hotjar',
          type: 'analytics',
          consentType: 'analytics_storage',
          check: () => window.hj || document.querySelector('script[src*="hotjar.com"]')
        }
      ];
      
      detectors.forEach(detector => {
        if (detector.check()) {
          const allowed = consentState[detector.consentType] === 'granted';
          tags.push({
            name: detector.name,
            type: detector.type,
            consentType: detector.consentType,
            allowed: allowed,
            reason: `${detector.consentType}: ${consentState[detector.consentType]}`
          });
          
        }
      });
      
      return tags;
    },
    
    updateConsent: function(settings) {
      
      try {
        if (window.gtag && typeof window.gtag === 'function') {
          window.gtag('consent', 'update', settings);
          return { success: true, method: 'gtag' };
        }
        
        if (window.dataLayer && Array.isArray(window.dataLayer)) {
          window.dataLayer.push(['consent', 'update', settings]);
          return { success: true, method: 'dataLayer' };
        }
        
        return { success: false, error: 'No consent mechanism available' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    
    getEvents: function() {
      return [];
    }
  };
  

}

// Listen for messages from content script
window.addEventListener('message', function(event) {
  if (event.data && event.data.source === 'gtm-inspector-content') {
    
    const { action, data, id } = event.data;
    let result = null;
    let error = null;
    
    try {
      switch (action) {
        case 'detectGTM':
          result = window.ConsentInspector.detectGTM();
          break;
          
        case 'getTagInfo':
          result = window.ConsentInspector.getTagInfo();
          break;
          
        case 'updateConsent':
          result = window.ConsentInspector.updateConsent(data);
          break;
          
        case 'getEvents':
          result = window.ConsentInspector.getEvents();
          break;
          
        default:
          error = 'Unknown action: ' + action;
      }
    } catch (err) {
      error = err.message;
    }
    
    // Send response back to content script
    window.postMessage({
      source: 'gtm-inspector-page',
      id: id,
      result: result,
      error: error
    }, '*');
  }
});