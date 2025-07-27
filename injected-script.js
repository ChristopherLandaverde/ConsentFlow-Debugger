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
        cmpInfo: {},
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
        result.cmpInfo = this.detectCMP();
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
      console.log('🔍 detectConsentMode called');
      console.log('🔍 dataLayer available:', !!window.dataLayer);
      console.log('🔍 dataLayer length:', window.dataLayer ? window.dataLayer.length : 0);
      console.log('🔍 dataLayer contents:', window.dataLayer ? JSON.stringify(window.dataLayer, null, 2) : 'null');
      
      // Method 1: Check for actual consent events in dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        const hasConsentEvents = window.dataLayer.some(item => 
          Array.isArray(item) && item[0] === 'consent' && 
          (item[1] === 'default' || item[1] === 'update')
        );
        console.log('🔍 Method 1 - hasConsentEvents:', hasConsentEvents);
        if (hasConsentEvents) {
          return true;
        }
      }
      
      // Method 2: Check if gtag with consent is used
      if (window.gtag && typeof window.gtag === 'function') {
        console.log('🔍 Method 2 - gtag function available');
        // Look for gtag consent calls in dataLayer
        if (window.dataLayer) {
          const hasGtagConsent = window.dataLayer.some(item =>
            Array.isArray(item) && item[0] === 'consent'
          );
          console.log('🔍 Method 2 - hasGtagConsent:', hasGtagConsent);
          return hasGtagConsent;
        }
      }
      
      // Method 3: Enhanced CMP detection
      console.log('🔍 Method 3 - CMP detection');
      console.log('🔍 __tcfapi available:', !!window.__tcfapi);
      console.log('🔍 OneTrust available:', !!window.OneTrust);
      console.log('🔍 Cookiebot available:', !!window.Cookiebot);
      if (window.__tcfapi || window.OneTrust || window.Cookiebot) {
        console.log('🔍 Method 3 - CMP detected, returning true');
        return true;
      }
      
      // Method 4: Check for Cookiebot script tag
      const cookiebotScript = document.querySelector('script[id="Cookiebot"], script[src*="cookiebot.com"]');
      console.log('🔍 Method 4 - Cookiebot script found:', !!cookiebotScript);
      if (cookiebotScript) {
        return true;
      }
      
      console.log('🔍 No consent mode detected');
      return false;
    },
    
    detectCMP: function() {
      const cmpInfo = {
        type: 'none',
        name: 'None',
        version: null,
        details: {}
      };
      
      // Check for Cookiebot
      if (window.Cookiebot) {
        cmpInfo.type = 'cookiebot';
        cmpInfo.name = 'Cookiebot';
        cmpInfo.version = window.Cookiebot.version || 'unknown';
        cmpInfo.details = {
          consent: window.Cookiebot.consent ? 'available' : 'not_available',
          banner: window.Cookiebot.show ? 'available' : 'not_available',
          domain: window.Cookiebot.domain || 'unknown'
        };
        return cmpInfo;
      }
      
      // Check for OneTrust
      if (window.OneTrust) {
        cmpInfo.type = 'onetrust';
        cmpInfo.name = 'OneTrust';
        cmpInfo.version = window.OneTrust.version || 'unknown';
        cmpInfo.details = {
          domainData: window.OneTrust.GetDomainData ? 'available' : 'not_available',
          groups: window.OneTrust.GetDomainData ? 'available' : 'not_available'
        };
        return cmpInfo;
      }
      
      // Check for IAB TCF
      if (window.__tcfapi) {
        cmpInfo.type = 'iab_tcf';
        cmpInfo.name = 'IAB TCF';
        cmpInfo.version = '2.0';
        cmpInfo.details = {
          api: 'available',
          gdpr: window.__tcfapi ? 'available' : 'not_available'
        };
        return cmpInfo;
      }
      
      // Check for script tags
      const cookiebotScript = document.querySelector('script[id="Cookiebot"], script[src*="cookiebot.com"]');
      if (cookiebotScript) {
        cmpInfo.type = 'cookiebot_script';
        cmpInfo.name = 'Cookiebot (Script Tag)';
        cmpInfo.details = {
          scriptSrc: cookiebotScript.src || 'inline',
          scriptId: cookiebotScript.id || 'none'
        };
        return cmpInfo;
      }
      
      const oneTrustScript = document.querySelector('script[src*="onetrust.com"], script[src*="cdn.cookielaw.org"]');
      if (oneTrustScript) {
        cmpInfo.type = 'onetrust_script';
        cmpInfo.name = 'OneTrust (Script Tag)';
        cmpInfo.details = {
          scriptSrc: oneTrustScript.src || 'inline'
        };
        return cmpInfo;
      }
      
      return cmpInfo;
    },
    

    
    getCurrentConsentState: function() {
      const defaultState = {
        analytics_storage: 'granted',
        ad_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'granted',
        security_storage: 'granted'
      };
      
      // Method 1: Check Google Consent Mode in dataLayer
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        for (let i = window.dataLayer.length - 1; i >= 0; i--) {
          const item = window.dataLayer[i];
          if (Array.isArray(item) && item[0] === 'consent' && 
              (item[1] === 'default' || item[1] === 'update') && item[2]) {
            return { ...defaultState, ...item[2] };
          }
        }
      }
      
      // Method 2: Check Cookiebot consent state
      if (window.Cookiebot && window.Cookiebot.consent) {
        const cookiebotConsent = window.Cookiebot.consent;
        return {
          analytics_storage: cookiebotConsent.analytics ? 'granted' : 'denied',
          ad_storage: cookiebotConsent.advertising ? 'granted' : 'denied',
          functionality_storage: cookiebotConsent.functionality ? 'granted' : 'denied',
          personalization_storage: cookiebotConsent.personalization ? 'granted' : 'denied',
          security_storage: cookiebotConsent.necessary ? 'granted' : 'denied',
          _cookiebot: true
        };
      }
      
      // Method 3: Check OneTrust consent state
      if (window.OneTrust && window.OneTrust.GetDomainData) {
        try {
          const oneTrustData = window.OneTrust.GetDomainData();
          if (oneTrustData && oneTrustData.Groups) {
            const groups = oneTrustData.Groups;
            return {
              analytics_storage: groups.find(g => g.CustomGroupId === 'analytics')?.Status === 'true' ? 'granted' : 'denied',
              ad_storage: groups.find(g => g.CustomGroupId === 'advertising')?.Status === 'true' ? 'granted' : 'denied',
              functionality_storage: groups.find(g => g.CustomGroupId === 'functionality')?.Status === 'true' ? 'granted' : 'denied',
              personalization_storage: groups.find(g => g.CustomGroupId === 'personalization')?.Status === 'true' ? 'granted' : 'denied',
              security_storage: 'granted', // Necessary cookies are always granted
              _oneTrust: true
            };
          }
        } catch (error) {
          console.log('OneTrust consent check failed:', error);
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
      // Simple event logging - avoid complex function calls that might timeout
      const events = [];
      
      try {
        console.log('📊 Getting simple events...');
        
        // Just return a simple status event to test communication
        const statusEvent = {
          timestamp: Date.now(),
          tagName: 'Event Log Test',
          tagType: 'test',
          consentType: 'none',
          allowed: true,
          reason: 'Testing event log communication',
          status: 'WORKING ✅',
          source: 'test'
        };
        
        events.push(statusEvent);
        
        console.log('📊 Returning', events.length, 'test events');
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