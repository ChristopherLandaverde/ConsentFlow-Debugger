// injected-script.js - Enhanced external script
console.log('🔵 GTM Inspector: External injected script loading...');

// Prevent multiple injections
if (window.ConsentInspector) {
  console.log('🔵 ConsentInspector already exists, skipping...');
} else {
  console.log('🔵 Creating ConsentInspector...');
  
  // Create ConsentInspector in page context
  window.ConsentInspector = {
    version: 'external-v1',
    
    detectGTM: function() {
      console.log('🔵 detectGTM called...');
      
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
        console.log('🔵 Found google_tag_manager:', Object.keys(window.google_tag_manager));
        result.hasGTM = true;
        result.detectionMethods.google_tag_manager = true;
        
        const containerIds = Object.keys(window.google_tag_manager);
        
        // Filter and find actual GTM container IDs (GTM-XXXXXXX format)
        const actualContainers = containerIds.filter(id => {
          // Look for GTM container ID pattern: GTM-XXXXXXX
          return /^GTM-[A-Z0-9]+$/.test(id);
        });
        
        // If we found actual GTM containers, use the first one
        if (actualContainers.length > 0) {
          result.gtmId = actualContainers[0];
        } else {
          // Fallback: look for any key that might be a GTM ID (starts with GTM)
          const gtmLikeContainers = containerIds.filter(id => id.startsWith('GTM-'));
          if (gtmLikeContainers.length > 0) {
            result.gtmId = gtmLikeContainers[0];
          } else if (containerIds.length > 0) {
            // Last resort: use first key
            result.gtmId = containerIds[0];
          }
        }
        
        result.containers = containerIds.map(id => ({
          id: id,
          source: 'google_tag_manager',
          isDebugGroup: !/^GTM-[A-Z0-9]+$/.test(id) && (id.includes('debug') || id.includes('test') || id.includes('sandbox') || id.length < 8)
        }));
      }
      
      // Method 2: Check for GTM script tags
      const gtmScripts = document.querySelectorAll('script[src*="googletagmanager.com"]');
      console.log('🔵 GTM scripts found:', gtmScripts.length);
      result.detectionMethods.scriptTags = gtmScripts.length;
      
      if (gtmScripts.length > 0) {
        result.hasGTM = true;
        gtmScripts.forEach(script => {
          const match = script.src.match(/id=([^&]+)/);
          if (match && match[1]) {
            const id = match[1];
            // Prioritize script tag IDs over debug groups
            if (!result.gtmId || result.gtmId.includes('debug')) {
              result.gtmId = id;
            }
            if (!result.containers.some(c => c.id === id)) {
              result.containers.push({
                id: id,
                source: 'script_tag',
                isDebugGroup: false
              });
            }
          }
        });
      }
      
      // Method 3: Check for gtag function
      if (window.gtag && typeof window.gtag === 'function') {
        console.log('🔵 Found gtag function');
        result.detectionMethods.gtag = true;
        result.hasGTM = true;
      }
      
      // Method 4: Check dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        console.log('🔵 Found dataLayer with', window.dataLayer.length, 'items');
        result.detectionMethods.dataLayer = window.dataLayer.length;
        
        // Look for GTM-related events
        const hasGtmEvents = window.dataLayer.some(item => {
          return (typeof item === 'object' && item !== null && 
                  (item.event || item['gtm.start'] || item['gtm.uniqueEventId']));
        });
        
        if (hasGtmEvents) {
          result.hasGTM = true;
        }
      }
      
      // Check consent mode
      result.hasConsentMode = this.detectConsentMode();
      result.consentState = this.getCurrentConsentState();
      
      console.log('🔵 GTM Detection Result:', result);
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
      console.log('🔵 getTagInfo called...');
      
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
          
          console.log('🔵 Detected tag:', detector.name, 'allowed:', allowed);
        }
      });
      
      console.log('🔵 getTagInfo result:', tags);
      return tags;
    },
    
    updateConsent: function(settings) {
      console.log('🔵 updateConsent called with:', settings);
      
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
  
  console.log('🔵 ConsentInspector created successfully');
  
  // Test immediately
  setTimeout(() => {
    console.log('🔵 Running immediate test...');
    console.log('🔵 GTM Detection:', window.ConsentInspector.detectGTM());
    console.log('🔵 Tag Info:', window.ConsentInspector.getTagInfo());
  }, 100);
}

console.log('🔵 External injected script complete');

// Listen for messages from content script
window.addEventListener('message', function(event) {
  if (event.data && event.data.source === 'gtm-inspector-content') {
    console.log('🔵 Received message from content script:', event.data);
    
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