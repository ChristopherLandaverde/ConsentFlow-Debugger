// injected-script.js - FIXED GTM container detection

// Prevent multiple injections
if (window.ConsentInspector) {
  console.log('🔧 ConsentInspector already exists, skipping injection...');
} else {
  console.log('🔧 Creating ConsentInspector...');
  
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
    
      // Method 1: Check for GTM script tags
      const gtmScripts = document.querySelectorAll('script[src*="googletagmanager.com"]');
      if (gtmScripts.length > 0) {
        result.hasGTM = true;
        result.detectionMethods.scriptTags = true;
        
        // Extract GTM IDs from script URLs
        gtmScripts.forEach(script => {
          const match = script.src.match(/gtm\.js\?id=([^&]+)/);
          if (match && match[1]) {
            const gtmId = match[1];
            if (!result.containers.includes(gtmId)) {
              result.containers.push(gtmId);
            }
          }
        });
        
        if (result.containers.length > 0) {
          result.gtmId = result.containers[0]; // Use first container as primary
        }
      }
      
      // Method 2: Check for dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        result.hasGTM = true;
        result.detectionMethods.dataLayer = true;
        
        // Look for GTM container ID in dataLayer
        for (let i = 0; i < window.dataLayer.length; i++) {
          const item = window.dataLayer[i];
          if (item && typeof item === 'object' && item.gtm_id) {
            if (!result.containers.includes(item.gtm_id)) {
              result.containers.push(item.gtm_id);
            }
          }
        }
      }
      
      // Method 3: Check for gtag function
      if (window.gtag && typeof window.gtag === 'function') {
        result.hasGTM = true;
        result.detectionMethods.gtag = true;
      }
      
      // Method 4: Check for Google Tag Manager object
      if (window.google_tag_manager) {
        result.hasGTM = true;
        result.detectionMethods.gtmObject = true;
      }
    
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
      
      // Simple tag detection - check for common tracking scripts
      const tagDetectors = [
        {
          name: 'Google Analytics 4',
          type: 'analytics',
          consentType: 'analytics_storage',
          check: () => {
            return window.gtag || 
                   document.querySelector('script[src*="gtag/js"]') ||
                   document.querySelector('script[src*="googletagmanager.com"]');
          }
        },
        {
          name: 'Universal Analytics',
          type: 'analytics', 
          consentType: 'analytics_storage',
          check: () => {
            return window.ga || 
                   document.querySelector('script[src*="google-analytics.com"]');
          }
        },
        {
          name: 'Facebook Pixel',
          type: 'advertising',
          consentType: 'ad_storage', 
          check: () => {
            return window.fbq || 
                   document.querySelector('script[src*="connect.facebook.net"]');
          }
        },
        {
          name: 'Google Ads',
          type: 'advertising',
          consentType: 'ad_storage',
          check: () => {
            return document.querySelector('script[src*="googleadservices.com"]') ||
                   document.querySelector('script[src*="googlesyndication.com"]');
          }
        },
        {
          name: 'Hotjar',
          type: 'analytics',
          consentType: 'analytics_storage',
          check: () => {
            return window.hj || 
                   document.querySelector('script[src*="hotjar.com"]');
          }
        }
      ];
      
      // Check each detector
      tagDetectors.forEach(detector => {
        try {
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
        } catch (error) {
          console.log('Error checking detector:', detector.name, error);
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
      // Enhanced event logging - focus on tag behavior and consent impact
      const events = [];
      const consentState = this.getCurrentConsentState();
      
      try {
        // Get detected tags and their consent requirements
        const detectedTags = this.getTagInfo();
        console.log('📊 Detected tags:', detectedTags);
        
        // Create tag firing events based on detected tags and consent state
        detectedTags.forEach(tag => {
          const event = {
            timestamp: Date.now(),
            tagName: tag.name,
            tagType: tag.type,
            consentType: tag.consentType,
            allowed: tag.allowed,
            reason: tag.reason,
            status: tag.allowed ? 'ALLOWED ✅' : 'BLOCKED ❌',
            source: 'tag-detection'
          };
          
          events.push(event);
        });
        
        // Add consent state change events if consent mode is active
        if (this.detectConsentMode()) {
          const consentEvent = {
            timestamp: Date.now(),
            tagName: 'Consent Mode',
            tagType: 'consent',
            consentType: 'all',
            allowed: true,
            reason: 'Current consent state',
            status: 'ACTIVE 🔐',
            consentState: consentState,
            source: 'consent-state'
          };
          
          events.push(consentEvent);
        }
        
        // Add GTM container info
        const gtmInfo = this.detectGTM();
        if (gtmInfo.hasGTM) {
          const gtmEvent = {
            timestamp: Date.now(),
            tagName: 'GTM Container',
            tagType: 'container',
            consentType: 'none',
            allowed: true,
            reason: 'GTM container detected',
            status: 'ACTIVE 🏗️',
            gtmId: gtmInfo.gtmId,
            containers: gtmInfo.containers,
            source: 'gtm-detection'
          };
          
          events.push(gtmEvent);
        }
        
        console.log('📊 Returning', events.length, 'tag-related events');
        return events;
        
      } catch (error) {
        console.error('❌ Error in getEvents:', error);
        return [];
      }
    }
  };
  

}

// Listen for messages from content script
window.addEventListener('message', function(event) {
  // Only log and process our specific messages to avoid spam
  if (event.data && event.data.source === 'gtm-inspector-content') {
    console.log('📥 Injected script received GTM Inspector message:', event.data);
    
    // Ensure ConsentInspector is available
    if (!window.ConsentInspector) {
      console.error('❌ ConsentInspector not available, cannot process message');
      window.postMessage({
        source: 'gtm-inspector-page',
        id: event.data.id,
        result: null,
        error: 'ConsentInspector not initialized'
      }, '*');
      return;
    }
    
    const { action, data, id } = event.data;
    console.log('🔧 Processing action:', action, 'with data:', data);
    
    let result = null;
    let error = null;
    
    try {
      switch (action) {
        case 'detectGTM':
          console.log('🔍 Calling detectGTM...');
          result = window.ConsentInspector.detectGTM();
          break;
          
        case 'getTagInfo':
          console.log('🏷️ Calling getTagInfo...');
          result = window.ConsentInspector.getTagInfo();
          break;
          
        case 'updateConsent':
          console.log('🔐 Calling updateConsent...');
          result = window.ConsentInspector.updateConsent(data);
          break;
          
        case 'getEvents':
          console.log('📊 Calling getEvents...');
          result = window.ConsentInspector.getEvents();
          break;
          
        default:
          error = 'Unknown action: ' + action;
          console.error('❌ Unknown action:', action);
      }
    } catch (err) {
      error = err.message;
      console.error('❌ Error processing action:', action, 'Error:', err);
    }
    
    console.log('📤 Sending response:', { result, error });
    
    // Ensure response is serializable before sending
    let serializableResult = result;
    let serializableError = error;
    
    try {
      // Test if result can be serialized
      if (result !== null && result !== undefined) {
        JSON.stringify(result);
      }
    } catch (serializeError) {
      console.error('❌ Result not serializable, sending error instead:', serializeError);
      serializableResult = null;
      serializableError = 'Result data not serializable: ' + serializeError.message;
    }
    
    // Send response back to content script
    window.postMessage({
      source: 'gtm-inspector-page',
      id: id,
      result: serializableResult,
      error: serializableError
    }, '*');
  }
});

console.log('🔧 GTM Inspector injected script loaded successfully');
console.log('🔧 ConsentInspector available:', !!window.ConsentInspector);
console.log('🔧 Message listener attached');