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
      
      // Method 1: Check window.google_tag_manager
      if (window.google_tag_manager && typeof window.google_tag_manager === 'object') {
        
        const allKeys = Object.keys(window.google_tag_manager);
        
        // FIXED: Better filtering for actual GTM containers
        const actualContainers = allKeys.filter(id => {
          // Must start with GTM- and be reasonably short (real containers are like GTM-ABC123)
          if (!id.startsWith('GTM-')) return false;
          
          // Exclude debug groups (they're usually very long)
          if (id.length > 15) return false;
          
          // Must match proper GTM container pattern: GTM-[alphanumeric]
          if (!/^GTM-[A-Z0-9]{6,8}$/.test(id)) return false;
          
          // Additional check: should be an object, not a string
          const containerData = window.google_tag_manager[id];
          if (typeof containerData !== 'object' || containerData === null) return false;
          
          return true;
        });
        

        
        if (actualContainers.length > 0) {
          result.hasGTM = true;
          result.gtmId = actualContainers[0]; // Primary container
          result.detectionMethods.google_tag_manager = true;
          
          // Build container info
          result.containers = actualContainers.map(id => {
            const containerData = window.google_tag_manager[id];
            return {
              id: id,
              source: 'google_tag_manager',
              isDebugGroup: false,
              hasConsentMode: this.detectConsentMode(),
              dataLayer: window.dataLayer ? window.dataLayer.length : 0,
              method: 'object_detection'
            };
          });
        }
        

      }
      
      // Method 2: Check for GTM script tags (fallback)
      const gtmScripts = document.querySelectorAll('script[src*="googletagmanager.com"]');
      
      if (gtmScripts.length > 0 && !result.hasGTM) {
        result.detectionMethods.scriptTags = gtmScripts.length;
        
        gtmScripts.forEach(script => {
          const match = script.src.match(/id=([^&]+)/);
          if (match && match[1]) {
            const id = match[1];
            if (/^GTM-[A-Z0-9]{6,8}$/.test(id)) {
              result.hasGTM = true;
              if (!result.gtmId) result.gtmId = id;
              
              if (!result.containers.some(c => c.id === id)) {
                result.containers.push({
                  id: id,
                  source: 'script_tag',
                  isDebugGroup: false,
                  hasConsentMode: this.detectConsentMode(),
                  dataLayer: window.dataLayer ? window.dataLayer.length : 0,
                  method: 'script_detection'
                });
              }
            }
          }
        });
      }
      
      // Method 3: Check for gtag function
      if (window.gtag && typeof window.gtag === 'function') {
        result.detectionMethods.gtag = true;
        if (!result.hasGTM) {
          result.hasGTM = true;
          result.gtmId = 'gtag-detected';
        }
      }
      
      // Method 4: Check dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        result.detectionMethods.dataLayer = window.dataLayer.length;
        
        // Look for GTM-related events
        const hasGtmEvents = window.dataLayer.some(item => {
          return (typeof item === 'object' && item !== null && 
                  (item.event || item['gtm.start'] || item['gtm.uniqueEventId']));
        });
        
        if (hasGtmEvents && !result.hasGTM) {
          result.hasGTM = true;
          result.gtmId = 'datalayer-detected';
        }
      }
      
      // Check consent mode
      result.hasConsentMode = this.detectConsentMode();
      result.consentState = this.getCurrentConsentState();
      
      // Final validation: ensure we have a reasonable number of containers
      if (result.containers.length > 5) {
        // Keep only containers detected via object method (most reliable)
        const objectContainers = result.containers.filter(c => c.source === 'google_tag_manager');
        if (objectContainers.length > 0 && objectContainers.length <= 3) {
          result.containers = objectContainers;
          result.gtmId = objectContainers[0].id;
        }
      }
      
      return result;
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